/**
 * Sincronización de facturas JSON a la base de datos
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Ingredient from '../models/Ingredient.js';
import Purchase from '../models/Purchase.js';
import stockService from './stockService.js';
import logger from '../config/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getPrompt } from './promptService.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
if (!process.env.GEMINI_API_KEY) {
    dotenv.config();
}

// Inicializar Gemini
let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Unidades estándar (SIMELA) que son válidas tal cual
const STANDARD_UNITS = ['KG', 'G', 'G.', 'g', 'kg', 'L', 'L.', 'l', 'ML', 'ML.', 'ml', 'M', 'M.', 'm'];

/**
 * Verifica si una unidad es estándar (SIMELA)
 */
function isStandardUnit(unidad) {
    if (!unidad) return false;
    return STANDARD_UNITS.includes(unidad.toUpperCase().trim());
}

/**
 * Interpreta y normaliza un item de factura usando Gemini
 */
async function interpretInvoiceItem(item) {
    try {
        if (!genAI) {
            throw new Error('Gemini API no está configurada');
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Cargar prompt desde Cloud Storage
        const itemPrompt = await getPrompt('item-interpretation.md');
        const prompt = itemPrompt
            .replace('{codigo_articulo}', item.codigo_articulo || '')
            .replace('{descripcion_articulo}', item.descripcion_articulo || '')
            .replace('{cantidad}', item.cantidad?.toString() || '0')
            .replace('{unidad}', item.unidad || 'UNI')
            .replace('{precio}', item.precio?.toString() || '0');

        logger.debug(`🤖 Interpretando item con Gemini: ${item.codigo_articulo} - ${item.descripcion_articulo}`);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Limpiar respuesta y extraer JSON
        let jsonText = text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        // Intentar extraer JSON si está embebido en texto
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonText = jsonMatch[0];
        }

        const interpreted = JSON.parse(jsonText);

        logger.debug(`✅ Item interpretado:`, {
            codigo: interpreted.codigo_articulo,
            nombre: interpreted.nombre_normalizado,
            unidad_real: interpreted.unidad_real,
            cantidad_real: interpreted.cantidad_real,
            peso_gramos: interpreted.peso_neto_gramos
        });

        return interpreted;

    } catch (error) {
        logger.error(`❌ Error interpretando item ${item.codigo_articulo}:`, error);

        // Fallback: usar valores por defecto basados en lógica simple
        const unidad = item.unidad?.trim() || 'UNI';
        const cantidad = parseFloat(item.cantidad) || 0;
        const esEstandar = isStandardUnit(unidad);

        return {
            codigo_articulo: item.codigo_articulo,
            nombre_normalizado: item.descripcion_articulo || 'Producto sin descripción',
            unidad_es_estandar: esEstandar,
            unidad_real: esEstandar ? unidad : 'UNI',
            cantidad_real: cantidad,
            peso_neto_gramos: 0,
            categoria: 'otros',
            alergenos: [],
            purchase_unit: unidad,
            conversion_factor: 1,
            conversion_unit: 'g',
            stock_unit: 'g'
        };
    }
}

/**
 * Busca coincidencias inteligentes usando Gemini
 */
async function findIntelligentMatch(interpretedItem, existingIngredients) {
    try {
        if (!genAI || existingIngredients.length === 0) {
            // Fallback: buscar por código
            const matchByCode = existingIngredients.find(
                ing => ing.codeArticlePurchase === interpretedItem.codigo_articulo
            );
            return matchByCode || null;
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Preparar lista de productos existentes para el prompt
        const productosList = existingIngredients.map(ing =>
            `- ID: ${ing._id}, Código: ${ing.codeArticlePurchase || 'N/A'}, Nombre: ${ing.name}, SKU: ${ing.sku}`
        ).join('\n');

        // Cargar prompt desde Cloud Storage
        const matchingPrompt = await getPrompt('matching.md');
        const prompt = matchingPrompt
            .replace('{codigo_articulo}', interpretedItem.codigo_articulo)
            .replace('{nombre_normalizado}', interpretedItem.nombre_normalizado)
            .replace('{unidad_real}', interpretedItem.unidad_real)
            .replace('{peso_neto_gramos}', interpretedItem.peso_neto_gramos?.toString() || '0')
            .replace('{productos_existentes}', productosList);

        logger.debug(`🔍 Buscando coincidencias inteligentes para: ${interpretedItem.nombre_normalizado}`);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Limpiar y parsear JSON
        let jsonText = text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonText = jsonMatch[0];
        }

        const matching = JSON.parse(jsonText);

        // Buscar el ingrediente según la recomendación
        if (matching.ingredient_id_final) {
            const matched = existingIngredients.find(
                ing => ing._id.toString() === matching.ingredient_id_final
            );
            if (matched) {
                logger.info(`✅ Coincidencia encontrada: ${matched.name} (${matching.recomendacion})`);
                return matched;
            }
        }

        // Fallback: buscar por código
        const matchByCode = existingIngredients.find(
            ing => ing.codeArticlePurchase === interpretedItem.codigo_articulo
        );
        return matchByCode || null;

    } catch (error) {
        logger.error(`❌ Error en matching inteligente:`, error);
        // Fallback: buscar por código
        const matchByCode = existingIngredients.find(
            ing => ing.codeArticlePurchase === interpretedItem.codigo_articulo
        );
        return matchByCode || null;
    }
}

/**
 * Procesa todos los items de una factura en batch usando Gemini (una sola llamada)
 */
async function processInvoiceItemsBatch(invoiceItems, existingIngredients) {
    try {
        if (!genAI) {
            throw new Error('Gemini API no está configurada');
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Preparar lista de items para el prompt
        const itemsList = invoiceItems.map((item, index) =>
            `${index + 1}. Código: ${item.codigo_articulo || 'N/A'}, Descripción: ${item.descripcion_articulo || 'N/A'}, Cantidad: ${item.cantidad || 0}, Unidad: ${item.unidad || 'UNI'}, Precio: ${item.precio || 0}`
        ).join('\n');

        // Preparar lista de ingredientes existentes
        const ingredientsList = existingIngredients.length > 0
            ? existingIngredients.map(ing =>
                `- ID: ${ing._id}, Código: ${ing.codeArticlePurchase || 'N/A'}, Nombre: ${ing.name}, SKU: ${ing.sku}, Categoría: ${ing.category || 'otros'}`
            ).join('\n')
            : '(No hay ingredientes existentes en la base de datos)';

        // Cargar prompt desde Cloud Storage
        const batchPrompt = await getPrompt('batch-processing.md');
        const prompt = batchPrompt
            .replace('{items_list}', itemsList)
            .replace('{existing_ingredients_list}', ingredientsList);

        logger.info(`🤖 Procesando ${invoiceItems.length} items en batch con Gemini`);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Limpiar respuesta y extraer JSON
        let jsonText = text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        // Intentar extraer JSON si está embebido en texto
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonText = jsonMatch[0];
        }

        const batchResult = JSON.parse(jsonText);

        if (!batchResult.items || !Array.isArray(batchResult.items)) {
            throw new Error('La respuesta de Gemini no contiene un array de items válido');
        }

        if (batchResult.items.length !== invoiceItems.length) {
            logger.warn(`⚠️  Número de items procesados (${batchResult.items.length}) no coincide con items originales (${invoiceItems.length})`);
        }

        logger.info(`✅ Procesados ${batchResult.items.length} items en batch`);

        return batchResult.items;

    } catch (error) {
        logger.error(`❌ Error procesando items en batch:`, error);
        throw error;
    }
}

/**
 * Mapea la categoría del ingrediente al elemento de 2 letras según SKU_ELEMENTS.md
 */
function getCategoryElement(categoria) {
    const categoryMap = {
        'lacteos': 'LV',
        'cereales': 'GR',
        'condimentos': 'CO',
        'vegetales': 'VG',
        'frutas': 'FR',
        'proteinas': 'PR',
        'otros': 'OT',
        'bebida': 'BE',
        'bebidas': 'BE',
        'cafe': 'CF',
        'aceites': 'AC',
        'frutos secos': 'FS',
        'gases': 'GS',
        'dulces': 'DL'
    };

    const normalizedCategory = categoria?.toLowerCase().trim() || 'otros';
    return categoryMap[normalizedCategory] || 'OT';
}

/**
 * Genera un código de 3 letras desde el nombre del producto
 */
function generateProductCode(nombre) {
    // Limpiar nombre: remover caracteres especiales, números, espacios
    const cleanName = nombre
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .replace(/\s+/g, '');

    if (cleanName.length >= 3) {
        // Tomar las primeras 3 letras significativas
        return cleanName.substring(0, 3);
    }

    // Si tiene menos de 3 letras, rellenar con 'X'
    return cleanName.padEnd(3, 'X');
}

/**
 * Busca el siguiente número disponible para una categoría
 * Los números van en incrementos de 10: 0010, 0020, 0030, etc.
 */
async function getNextNumberForCategory(element) {
    try {
        // Buscar todos los SKUs que empiecen con I + elemento
        const prefix = `I${element}`;
        const existingIngredients = await Ingredient.find({
            sku: { $regex: `^${prefix}` }
        }).select('sku').lean();

        // Extraer números de los SKUs existentes
        const numbers = existingIngredients
            .map(ing => {
                // El formato es I + Elemento(2) + Número(4) + Código(3)
                // Extraer el número de las posiciones 3-6
                const sku = ing.sku || '';
                if (sku.length >= 7 && sku.startsWith(prefix)) {
                    const numberPart = sku.substring(3, 7);
                    const num = parseInt(numberPart, 10);
                    return isNaN(num) ? 0 : num;
                }
                return 0;
            })
            .filter(num => num > 0);

        if (numbers.length === 0) {
            return 10; // Empezar con 0010
        }

        // Encontrar el siguiente número múltiplo de 10
        const maxNumber = Math.max(...numbers);
        const nextNumber = Math.ceil((maxNumber + 1) / 10) * 10;

        // Asegurar que no esté en el rango reservado 0011-0019
        if (nextNumber >= 11 && nextNumber <= 19) {
            return 20;
        }

        return nextNumber;

    } catch (error) {
        logger.error(`Error buscando siguiente número para categoría ${element}:`, error);
        return 10; // Fallback: empezar con 0010
    }
}

/**
 * Genera un SKU único siguiendo las reglas de SKU_ELEMENTS.md
 * Formato: [Tipo][Elemento][Número][Código] = 10 caracteres
 * - Tipo: I (Ingredient)
 * - Elemento: 2 letras según categoría
 * - Número: 0010, 0020, 0030... (incrementos de 10)
 * - Código: 3 letras del nombre del producto
 */
async function generateSku(categoria, nombreProducto) {
    // Tipo: I para Ingredient
    const tipo = 'I';

    // Elemento: 2 letras según categoría
    const elemento = getCategoryElement(categoria);

    // Número: siguiente disponible en incrementos de 10
    const numero = await getNextNumberForCategory(elemento);
    const numeroStr = String(numero).padStart(4, '0'); // 0010, 0020, etc.

    // Código: 3 letras desde el nombre
    const codigo = generateProductCode(nombreProducto);

    // Combinar: I + Elemento + Número + Código = 10 caracteres
    const sku = `${tipo}${elemento}${numeroStr}${codigo}`;

    // Verificar que el SKU generado no exista (por si hay colisión)
    const existing = await Ingredient.findOne({ sku });
    if (existing) {
        // Si existe, usar el rango reservado 0011-0019 para colisiones
        // Buscar el siguiente número disponible en ese rango
        for (let i = 11; i <= 19; i++) {
            const collisionSku = `${tipo}${elemento}${String(i).padStart(4, '0')}${codigo}`;
            const collisionExists = await Ingredient.findOne({ sku: collisionSku });
            if (!collisionExists) {
                logger.warn(`⚠️  SKU ${sku} ya existe, usando colisión: ${collisionSku}`);
                return collisionSku;
            }
        }
        // Si todos los números de colisión están ocupados, incrementar el número base
        const nextBaseNumber = Math.ceil((numero + 1) / 10) * 10;
        const nextSku = `${tipo}${elemento}${String(nextBaseNumber).padStart(4, '0')}${codigo}`;
        logger.warn(`⚠️  SKU ${sku} y colisiones ocupadas, usando: ${nextSku}`);
        return nextSku;
    }

    return sku;
}

/**
 * Sincroniza los productos de una factura con la base de datos usando Gemini
 */
export async function syncInvoiceToDatabase(jsonPath) {
    try {
        logger.info(`🔄 Iniciando sincronización inteligente de factura: ${jsonPath}`);

        if (!fs.existsSync(jsonPath)) {
            throw new Error(`El archivo JSON no existe: ${jsonPath}`);
        }

        const invoiceData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        if (!invoiceData.lista_items || !Array.isArray(invoiceData.lista_items)) {
            throw new Error('El JSON de factura no tiene lista_items válida');
        }

        logger.info(`📦 Procesando ${invoiceData.lista_items.length} items con Gemini (batch)`);

        // Obtener todos los ingredientes existentes para matching
        const existingIngredients = await Ingredient.find({}).lean();
        logger.debug(`📋 ${existingIngredients.length} ingredientes existentes cargados para matching`);

        // Procesar TODOS los items en una sola llamada a Gemini
        let processedItems;
        try {
            processedItems = await processInvoiceItemsBatch(
                invoiceData.lista_items,
                existingIngredients
            );
        } catch (error) {
            logger.error(`❌ Error en procesamiento batch, fallando a procesamiento individual:`, error);
            // Fallback: si el batch falla, intentar procesamiento individual
            throw new Error(`Error procesando factura en batch: ${error.message}`);
        }

        const purchaseItems = [];
        const newIngredients = [];
        const updatedIngredients = [];
        const errors = [];

        // Verificar si es modo preview
        const isPreview = invoiceData._previewMode === true;

        // Procesar los resultados del batch
        for (let i = 0; i < processedItems.length; i++) {
            const processedItem = processedItems[i];
            const originalItem = invoiceData.lista_items[i];

            try {
                // Buscar el ingrediente según el matching de Gemini
                let ingredient = null;
                if (processedItem.matching?.ingredient_id_final) {
                    ingredient = existingIngredients.find(
                        ing => ing._id.toString() === processedItem.matching.ingredient_id_final
                    );
                }

                if (ingredient) {
                    // Ingrediente existe: actualizar stock
                    logger.info(`✅ Ingrediente encontrado: ${ingredient.name}`);

                    const quantityInGrams = processedItem.peso_neto_gramos || 0;

                    if (quantityInGrams > 0) {
                        purchaseItems.push({
                            ingredient: ingredient._id,
                            quantityInGrams,
                            unitPrice: parseFloat(originalItem.precio) || 0
                        });

                        updatedIngredients.push({
                            codigo: processedItem.codigo_articulo,
                            nombre: ingredient.name,
                            cantidadAnterior: ingredient.stock,
                            cantidadAgregada: quantityInGrams,
                            unidad_interpretada: processedItem.unidad_real,
                            cantidad_real: processedItem.cantidad_real
                        });
                    } else {
                        logger.warn(`⚠️  Peso en gramos es 0, omitiendo item ${processedItem.codigo_articulo}`);
                    }
                } else {
                    // Ingrediente no existe: crear nuevo
                    logger.info(`🆕 Creando nuevo ingrediente: ${processedItem.nombre_normalizado}`);

                    // Generar SKU siguiendo las reglas de SKU_ELEMENTS.md
                    const categoria = processedItem.categoria || 'otros';
                    const nombreProducto = processedItem.nombre_normalizado;
                    const sku = await generateSku(categoria, nombreProducto);

                    if (!isPreview) {
                        // Crear nuevo ingrediente (solo si no es preview)
                        ingredient = await Ingredient.create({
                            name: processedItem.nombre_normalizado,
                            sku: sku,
                            stock: 0,
                            stockUnit: processedItem.stock_unit || 'g',
                            purchaseUnit: processedItem.purchase_unit || processedItem.unidad_real,
                            conversionFactor: processedItem.conversion_factor || 1,
                            conversionUnit: processedItem.conversion_unit || 'g',
                            reorderPoint: 0,
                            category: processedItem.categoria || 'otros',
                            allergens: processedItem.alergenos || [],
                            codeArticlePurchase: processedItem.codigo_articulo
                        });

                        logger.info(`✅ Nuevo ingrediente creado: ${ingredient.name} (SKU: ${ingredient.sku})`);
                        existingIngredients.push(ingredient);
                    } else {
                        // En modo preview, crear un objeto simulado
                        ingredient = {
                            _id: `preview-${Date.now()}-${Math.random()}`,
                            name: processedItem.nombre_normalizado,
                            sku: sku,
                            stock: 0
                        };
                        logger.info(`👁️  Preview: se crearía nuevo ingrediente ${ingredient.name} (SKU: ${ingredient.sku})`);
                    }

                    const quantityInGrams = processedItem.peso_neto_gramos || 0;

                    if (quantityInGrams > 0) {
                        purchaseItems.push({
                            ingredient: ingredient._id,
                            quantityInGrams,
                            unitPrice: parseFloat(originalItem.precio) || 0
                        });

                        newIngredients.push({
                            codigo: processedItem.codigo_articulo,
                            nombre: processedItem.nombre_normalizado,
                            sku: ingredient.sku,
                            cantidad: quantityInGrams,
                            unidad_interpretada: processedItem.unidad_real,
                            cantidad_real: processedItem.cantidad_real
                        });
                    }
                }

            } catch (error) {
                logger.error(`❌ Error procesando item ${processedItem.codigo_articulo}:`, error);
                errors.push({
                    codigo: processedItem.codigo_articulo,
                    descripcion: processedItem.descripcion_original || originalItem.descripcion_articulo,
                    error: error.message
                });
            }
        }

        if (purchaseItems.length === 0) {
            logger.warn('⚠️  No se generaron items de compra válidos');
            return {
                success: false,
                message: 'No se generaron items de compra válidos',
                errors
            };
        }

        let purchase = null;
        if (!isPreview) {
            // Crear registro de compra solo si no es preview
            logger.info(`💾 Creando registro de compra con ${purchaseItems.length} items...`);

            purchase = await Purchase.create({
                supplier: invoiceData.proveedor || 'Proveedor desconocido',
                invoiceNumber: invoiceData.numero_factura || '',
                timestamp: invoiceData.fecha ? new Date(invoiceData.fecha) : new Date(),
                items: purchaseItems,
                metadata: {
                    jsonPath,
                    totalBruto: invoiceData.total_bruto,
                    totalFactura: invoiceData.total_factura,
                    impuestos: invoiceData.impuestos,
                    fecha: invoiceData.fecha,
                    procesado_con_gemini: true
                }
            });

            logger.info(`✅ Registro de compra creado: ${purchase._id}`);

            // Actualizar stock
            logger.info(`📊 Actualizando stock de ingredientes...`);
            await stockService.applyPurchaseToStock(purchase);
        } else {
            logger.info(`👁️  Modo preview: no se creará registro de compra ni se actualizará el stock`);
            // Crear un objeto purchase simulado para la respuesta
            purchase = {
                _id: 'preview',
                supplier: invoiceData.proveedor || 'Proveedor desconocido',
                invoiceNumber: invoiceData.numero_factura || '',
                timestamp: invoiceData.fecha ? new Date(invoiceData.fecha) : new Date(),
                items: purchaseItems
            };
        }

        logger.info(`✅ Sincronización completada exitosamente`, {
            purchaseId: purchase._id,
            totalItems: purchaseItems.length,
            nuevosIngredientes: newIngredients.length,
            ingredientesActualizados: updatedIngredients.length,
            errores: errors.length
        });

        return {
            success: true,
            purchaseId: purchase._id,
            purchase,
            summary: {
                totalItems: purchaseItems.length,
                nuevosIngredientes: newIngredients.length,
                ingredientesActualizados: updatedIngredients.length,
                errores: errors.length
            },
            nuevosIngredientes: newIngredients,
            ingredientesActualizados: updatedIngredients,
            errors
        };

    } catch (error) {
        logger.error(`❌ Error sincronizando factura:`, {
            jsonPath,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Sincroniza una factura desde su ruta relativa
 */
export async function syncInvoiceByFileName(fileName) {
    const outputDir = path.join(__dirname, '../../output/invoices');
    const jsonPath = path.join(outputDir, fileName);
    return await syncInvoiceToDatabase(jsonPath);
}
