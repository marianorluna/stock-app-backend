/**
 * Servicio para actualizar stock desde facturas PDF nuevas del bucket
 *
 * Flujo:
 *   1. Procesar PDFs nuevos del bucket → JSONs individuales (invoiceProcessor)
 *   2. Unificar items de las facturas nuevas por codigoArticulo
 *   3. Match con ingredientes/bebidas por codeArticlePurchase → actualizar stock
 *
 * Para ingredientes:
 *   stock     += cantidadTotalGramos
 *   stockMerma = stockMerma + (cantidadTotalGramos - (cantidadTotalGramos * factorMermaNat))
 *
 * Para bebidas:
 *   stock     += cantidadFactura  (unidades)
 *
 * Items sin match (código inexistente, duplicado en BD, etc.) se devuelven en unmatchedItems.
 */

import { processNewInvoices, processInvoiceFromPath } from './invoiceProcessor.js';
import Ingredient from '../models/Ingredient.js';
import Beverage from '../models/Beverage.js';
import Purchase from '../models/Purchase.js';
import logger from '../config/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee una lista de JSONs de facturas individuales y unifica sus items
 * sumando cantidadFactura, cantidadTotalGramos e importeTotal por codigoArticulo.
 *
 * @param {string[]} jsonPaths – Rutas absolutas a los JSON de facturas
 * @returns {Array} Array de items unificados
 */
function unificarItemsDeFacturas(jsonPaths) {
  const itemsMap = new Map();

  for (const jsonPath of jsonPaths) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (err) {
      logger.warn(`⚠️  No se pudo leer JSON de factura ${jsonPath}: ${err.message}`);
      continue;
    }

    // El JSON generado por invoiceProcessor.js usa camelCase → listaItems
    const listaItems = Array.isArray(data.listaItems) ? data.listaItems : [];

    for (const item of listaItems) {
      if (!item.codigoArticulo) {
        logger.warn(`⚠️  Item sin codigoArticulo en ${jsonPath}`, item);
        continue;
      }

      const codigo = String(item.codigoArticulo).trim().toUpperCase();

      if (itemsMap.has(codigo)) {
        const existing = itemsMap.get(codigo);
        existing.cantidadFactura =
          (existing.cantidadFactura || 0) + (Number(item.cantidadFactura) || 0);
        existing.cantidadTotalGramos =
          (existing.cantidadTotalGramos || 0) + (Number(item.cantidadTotalGramos) || 0);
        existing.importeTotal = Math.round(
          ((existing.importeTotal || 0) + (Number(item.importeTotal) || 0)) * 100
        ) / 100;
      } else {
        itemsMap.set(codigo, {
          codigoArticulo: codigo,
          descripcionArticulo: item.descripcionArticulo || null,
          cantidadFactura: Number(item.cantidadFactura) || 0,
          unidadFactura: item.unidadFactura || null,
          cantidadTotalGramos: Number(item.cantidadTotalGramos) || 0,
          precioUnitario: item.precioUnitario || null,
          importeTotal: Math.round((Number(item.importeTotal) || 0) * 100) / 100
        });
      }
    }
  }

  return Array.from(itemsMap.values()).sort((a, b) =>
    (a.codigoArticulo ?? '').localeCompare(b.codigoArticulo ?? '')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper interno: pasos 2, 3a y 3b compartidos entre los dos flujos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ejecuta los pasos de unificación, creación de Purchase y actualización de stock
 * a partir de una lista de rutas JSON de facturas ya procesadas por Gemini.
 *
 * @param {string[]} newJsonPaths  – Rutas absolutas a los JSON de facturas
 * @param {Object[]} steps         – Array de pasos previos (para acumular)
 * @param {Object}   pdfMeta       – Metadatos { facturasNuevas, facturasExitosas, facturasFallidas }
 * @returns {Promise<Object>}
 */
async function _runStockUpdateFromJsons(newJsonPaths, steps, pdfMeta) {
  // ── PASO 2: Unificar items ────────────────────────────────────────────────
  logger.info(`🔄 PASO 2: Unificando items de ${newJsonPaths.length} factura(s)...`);

  let unifiedItems;
  try {
    unifiedItems = unificarItemsDeFacturas(newJsonPaths);
    steps.push({
      step: 2,
      name: 'Unificación de items',
      success: true,
      details: { totalItemsUnicos: unifiedItems.length }
    });
    logger.info(`✅ PASO 2 completado: ${unifiedItems.length} items únicos`);
  } catch (err) {
    logger.error('❌ Error en PASO 2 (unificación):', err);
    steps.push({ step: 2, name: 'Unificación de items', success: false, error: err.message });
    throw { steps, error: `Error al unificar items de facturas: ${err.message}` };
  }

  // ── PASO 3: Cargar ingredientes y bebidas con código de artículo ──────────
  const [allIngredients, allBeverages] = await Promise.all([
    Ingredient.find({ codeArticlePurchase: { $exists: true, $ne: '' } }).lean(),
    Beverage.find({ codeArticlePurchase: { $exists: true, $ne: '' } }).lean()
  ]);

  const ingredientMap = new Map();
  const ingredientDuplicates = new Set();
  for (const ing of allIngredients) {
    const code = String(ing.codeArticlePurchase).trim().toUpperCase();
    if (ingredientMap.has(code)) ingredientDuplicates.add(code);
    else ingredientMap.set(code, ing);
  }

  const beverageMap = new Map();
  const beverageDuplicates = new Set();
  for (const bev of allBeverages) {
    const code = String(bev.codeArticlePurchase).trim().toUpperCase();
    if (beverageMap.has(code)) beverageDuplicates.add(code);
    else beverageMap.set(code, bev);
  }

  // ── PASO 3a: Crear Purchase por cada factura ──────────────────────────────
  logger.info(`🧾 PASO 3a: Creando registros de compra para ${newJsonPaths.length} factura(s)...`);

  const createdPurchases = [];

  for (const jsonPath of newJsonPaths) {
    let invoiceData;
    try {
      invoiceData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (err) {
      logger.warn(`⚠️  No se pudo leer JSON para crear Purchase (${jsonPath}): ${err.message}`);
      continue;
    }

    const listaItems = Array.isArray(invoiceData.listaItems) ? invoiceData.listaItems : [];
    const purchaseItems = [];

    for (const item of listaItems) {
      const codigo = String(item.codigoArticulo || '').trim().toUpperCase();
      if (!codigo) continue;

      let matched = false;

      // Intentar match como ingrediente primero
      if (!ingredientDuplicates.has(codigo)) {
        const ingredient = ingredientMap.get(codigo);
        if (ingredient) {
          purchaseItems.push({
            ingredient: ingredient._id,
            quantityInGrams: Number(item.cantidadTotalGramos) || 0,
            unitPrice: Number(item.precioUnitario) || 0
          });
          matched = true;
        }
      }

      // Si no es ingrediente, intentar match como bebida
      if (!matched && !beverageDuplicates.has(codigo)) {
        const beverage = beverageMap.get(codigo);
        if (beverage) {
          purchaseItems.push({
            beverage: beverage._id,
            quantityInUnits: Number(item.cantidadFactura) || 0,
            unitPrice: Number(item.precioUnitario) || 0
          });
          matched = true;
        }
      }

      // Si no hay match, registrar igualmente como item sin match
      if (!matched) {
        const isDuplicateIng = ingredientDuplicates.has(codigo);
        const isDuplicateBev = beverageDuplicates.has(codigo);
        purchaseItems.push({
          unmatchedItem: {
            codigoArticulo: codigo,
            descripcionArticulo: item.descripcionArticulo || null,
            cantidadFactura: Number(item.cantidadFactura) || 0,
            cantidadTotalGramos: Number(item.cantidadTotalGramos) || 0,
            unidadFactura: item.unidadFactura || null,
            razon: isDuplicateIng
              ? 'Código duplicado en ingredientes — debe resolverse manualmente'
              : isDuplicateBev
              ? 'Código duplicado en bebidas — debe resolverse manualmente'
              : 'No se encontró ningún ingrediente ni bebida con este código'
          },
          unitPrice: Number(item.precioUnitario) || 0
        });
      }
    }

    let purchaseDate = new Date();
    if (invoiceData.fecha) {
      const parts = String(invoiceData.fecha).split('/');
      if (parts.length === 3) {
        const parsed = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        if (!isNaN(parsed.getTime())) purchaseDate = parsed;
      } else {
        const parsed = new Date(invoiceData.fecha);
        if (!isNaN(parsed.getTime())) purchaseDate = parsed;
      }
    }

    try {
      const ingredientItemsCount = purchaseItems.filter(i => i.ingredient).length;
      const beverageItemsCount = purchaseItems.filter(i => i.beverage).length;

      const purchase = await Purchase.create({
        supplier: invoiceData.proveedor || null,
        invoiceNumber: invoiceData.numeroFactura || null,
        timestamp: purchaseDate,
        items: purchaseItems,
        metadata: new Map(Object.entries({
          totalBruto: invoiceData.totalBruto ?? null,
          totalFactura: invoiceData.totalFactura ?? null,
          impuestos: invoiceData.impuestos ?? null,
          jsonPath,
          totalItemsFactura: listaItems.length,
          itemsIngredientesMatch: ingredientItemsCount,
          itemsBebidasMatch: beverageItemsCount
        }))
      });

      createdPurchases.push({
        id: purchase._id,
        invoiceNumber: purchase.invoiceNumber,
        supplier: purchase.supplier,
        date: purchaseDate,
        ingredientItemsCount,
        beverageItemsCount,
        totalItemsInInvoice: listaItems.length
      });

      logger.info(`✅ Purchase creado: factura ${purchase.invoiceNumber} — ${purchaseItems.length}/${listaItems.length} items`);
    } catch (err) {
      logger.error(`❌ Error creando Purchase para ${jsonPath}:`, err);
    }
  }

  steps.push({
    step: '3a',
    name: 'Creación de registros de compra',
    success: true,
    details: { purchasesCreados: createdPurchases.length }
  });

  // ── PASO 3b: Actualización de stock ────────────────────────────────────────
  const updatedIngredients = [];
  const updatedBeverages = [];
  const unmatchedItems = [];

  for (const item of unifiedItems) {
    const codigo = String(item.codigoArticulo || '').trim().toUpperCase();
    const isIngDuplicate = ingredientDuplicates.has(codigo);
    const isBevDuplicate = beverageDuplicates.has(codigo);

    if (isIngDuplicate || isBevDuplicate) {
      const type = isIngDuplicate ? 'ingredientes' : 'bebidas';
      logger.warn(`⚠️  Código duplicado en ${type}: ${codigo}`);
      unmatchedItems.push({
        codigoArticulo: codigo,
        descripcionArticulo: item.descripcionArticulo,
        cantidadFactura: item.cantidadFactura,
        cantidadTotalGramos: item.cantidadTotalGramos,
        razon: `Código duplicado en ${type} — debe resolverse manualmente`
      });
      continue;
    }

    const ingredient = ingredientMap.get(codigo) || null;
    const beverage = !ingredient ? beverageMap.get(codigo) || null : null;

    if (ingredient) {
      const cantidadGramos = item.cantidadTotalGramos;
      const factorMerma = Number(ingredient.factorMermaNat) || 0;
      const mermaIncrement = cantidadGramos - cantidadGramos * factorMerma;
      try {
        await Ingredient.findByIdAndUpdate(ingredient._id, {
          $inc: {
            stock: cantidadGramos,
            stockMerma: Math.round(mermaIncrement * 100) / 100
          }
        });
        updatedIngredients.push({
          id: ingredient._id,
          sku: ingredient.sku,
          name: ingredient.name,
          codigoArticulo: codigo,
          stockAnterior: ingredient.stock,
          stockSumado: cantidadGramos,
          stockNuevo: ingredient.stock + cantidadGramos,
          stockMermaAnterior: ingredient.stockMerma || 0,
          stockMermaSumado: Math.round(mermaIncrement * 100) / 100,
          stockMermaNuevo: Math.round(((ingredient.stockMerma || 0) + mermaIncrement) * 100) / 100
        });
        logger.info(`✅ Ingrediente actualizado: ${ingredient.name} +${cantidadGramos}g`);
      } catch (err) {
        logger.error(`❌ Error actualizando ingrediente ${codigo}:`, err);
        unmatchedItems.push({
          codigoArticulo: codigo,
          descripcionArticulo: item.descripcionArticulo,
          cantidadFactura: item.cantidadFactura,
          cantidadTotalGramos: item.cantidadTotalGramos,
          razon: `Error al actualizar ingrediente "${ingredient.name}": ${err.message}`
        });
      }
    } else if (beverage) {
      const cantidadUnidades = item.cantidadFactura;
      try {
        await Beverage.findByIdAndUpdate(beverage._id, { $inc: { stock: cantidadUnidades } });
        updatedBeverages.push({
          id: beverage._id,
          sku: beverage.sku,
          name: beverage.name,
          codigoArticulo: codigo,
          stockAnterior: beverage.stock,
          stockSumado: cantidadUnidades,
          stockNuevo: beverage.stock + cantidadUnidades
        });
        logger.info(`✅ Bebida actualizada: ${beverage.name} +${cantidadUnidades} unidades`);
      } catch (err) {
        logger.error(`❌ Error actualizando bebida ${codigo}:`, err);
        unmatchedItems.push({
          codigoArticulo: codigo,
          descripcionArticulo: item.descripcionArticulo,
          cantidadFactura: item.cantidadFactura,
          cantidadTotalGramos: item.cantidadTotalGramos,
          razon: `Error al actualizar bebida "${beverage.name}": ${err.message}`
        });
      }
    } else {
      logger.warn(`⚠️  Sin match para código: ${codigo} (${item.descripcionArticulo})`);
      unmatchedItems.push({
        codigoArticulo: codigo,
        descripcionArticulo: item.descripcionArticulo,
        cantidadFactura: item.cantidadFactura,
        cantidadTotalGramos: item.cantidadTotalGramos,
        razon: 'No se encontró ningún ingrediente ni bebida con este código de artículo'
      });
    }
  }

  steps.push({
    step: '3b',
    name: 'Actualización de stock',
    success: true,
    details: {
      ingredientesActualizados: updatedIngredients.length,
      bebidasActualizadas: updatedBeverages.length,
      itemsSinMatch: unmatchedItems.length
    }
  });

  logger.info('✅ PASO 3b completado', {
    ingredientesActualizados: updatedIngredients.length,
    bebidasActualizadas: updatedBeverages.length,
    itemsSinMatch: unmatchedItems.length
  });

  return {
    success: true,
    noNewInvoices: false,
    steps,
    createdPurchases,
    updatedIngredients,
    updatedBeverages,
    unmatchedItems,
    summary: {
      facturasNuevas: pdfMeta.facturasNuevas,
      facturasExitosas: pdfMeta.facturasExitosas,
      facturasFallidas: pdfMeta.facturasFallidas,
      itemsUnificados: unifiedItems.length,
      purchasesCreados: createdPurchases.length,
      ingredientesActualizados: updatedIngredients.length,
      bebidasActualizadas: updatedBeverages.length,
      itemsSinMatch: unmatchedItems.length
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones principales exportadas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orquesta el proceso completo de actualización de stock desde facturas PDF.
 *
 * @param {string|null} bucketName – Nombre del bucket GCS (usa el de la config si es null)
 * @returns {Promise<Object>} – Resultado con pasos, items actualizados y sin match
 */
export async function updateStockFromNewInvoices(bucketName = null) {
  const steps = [];

  // ── PASO 1: Procesar PDFs nuevos del bucket ─────────────────────────────
  logger.info('📦 PASO 1: Procesando PDFs nuevos del bucket...');

  let pdfResults;
  try {
    pdfResults = await processNewInvoices(bucketName);
    steps.push({
      step: 1,
      name: 'Procesamiento de PDFs',
      success: true,
      details: {
        totalEnBucket: pdfResults.total || 0,
        nuevos: pdfResults.new || 0,
        exitosos: pdfResults.successful || 0,
        fallidos: pdfResults.failed || 0
      }
    });
  } catch (err) {
    logger.error('❌ Error en PASO 1 (procesamiento PDFs):', err);
    steps.push({
      step: 1,
      name: 'Procesamiento de PDFs',
      success: false,
      error: err.message
    });
    throw { steps, error: `Error al procesar PDFs del bucket: ${err.message}` };
  }

  if (pdfResults.new === 0) {
    logger.info('✅ No hay facturas nuevas en el bucket');
    return {
      success: true,
      noNewInvoices: true,
      message: 'No hay facturas nuevas para procesar en el bucket',
      steps,
      updatedIngredients: [],
      updatedBeverages: [],
      unmatchedItems: [],
      summary: {
        facturasNuevas: 0,
        facturasExitosas: 0,
        facturasFallidas: 0,
        itemsUnificados: 0,
        ingredientesActualizados: 0,
        bebidasActualizadas: 0,
        itemsSinMatch: 0
      }
    };
  }

  // Recopilar JSONs generados exitosamente
  const newJsonPaths = (pdfResults.results || [])
    .filter(r => r.success && r.jsonPath)
    .map(r => r.jsonPath);

  if (newJsonPaths.length === 0) {
    logger.warn('⚠️  PDFs procesados pero sin JSONs válidos');
    return {
      success: true,
      noNewInvoices: true,
      message: 'Los PDFs se procesaron pero no se generaron archivos JSON válidos',
      steps,
      updatedIngredients: [],
      updatedBeverages: [],
      unmatchedItems: [],
      summary: {
        facturasNuevas: pdfResults.new,
        facturasExitosas: pdfResults.successful || 0,
        facturasFallidas: pdfResults.failed || 0,
        itemsUnificados: 0,
        ingredientesActualizados: 0,
        bebidasActualizadas: 0,
        itemsSinMatch: 0
      }
    };
  }

  return _runStockUpdateFromJsons(newJsonPaths, steps, {
    facturasNuevas: pdfResults.new,
    facturasExitosas: pdfResults.successful || 0,
    facturasFallidas: pdfResults.failed || 0
  });
}

/**
 * Actualiza el stock a partir de un PDF cargado manualmente (base64).
 * Realiza el mismo flujo que updateStockFromNewInvoices pero usando el PDF
 * subido en lugar de leerlo del bucket de GCS.
 *
 * @param {string} pdfBase64      – Contenido del PDF codificado en base64
 * @param {string} originalFileName – Nombre original del archivo (solo para logs/registro)
 * @returns {Promise<Object>}
 */
export async function updateStockFromUploadedPdf(pdfBase64, originalFileName) {
  const steps = [];

  // ── PASO 1: Guardar PDF temporal y procesarlo con Gemini ──────────────────
  logger.info(`📤 PASO 1: Procesando PDF cargado manualmente: ${originalFileName}`);

  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Nombre de archivo seguro para el temp
  const safeFileName = originalFileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const tempPath = path.join(tempDir, `upload-${Date.now()}-${safeFileName}`);

    let pdfResult;
  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(tempPath, pdfBuffer);

    pdfResult = await processInvoiceFromPath(tempPath);

    steps.push({
      step: 1,
      name: 'Procesamiento del PDF cargado',
      success: true,
      details: { archivo: originalFileName }
    });
    logger.info(`✅ PASO 1 completado: JSON generado en ${pdfResult.jsonPath}`);
  } catch (err) {
    logger.error(`❌ Error en PASO 1 (procesamiento PDF cargado):`, err);

    // Los errores de duplicado se propagan directamente (sin wrapping)
    // para que el controlador pueda responder con 409
    if (err && err.isDuplicateInvoice) {
      throw err;
    }

    steps.push({ step: 1, name: 'Procesamiento del PDF cargado', success: false, error: err.message });
    throw { steps, error: `Error al procesar el PDF: ${err.message}` };
  } finally {
    // Limpiar el archivo temporal independientemente del resultado
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {
        logger.warn(`No se pudo eliminar PDF temporal: ${e.message}`);
      }
    }
  }

  if (!pdfResult.success || !pdfResult.jsonPath) {
    steps.push({ step: 1, name: 'Procesamiento del PDF cargado', success: false, error: 'Sin JSON generado' });
    throw { steps, error: 'El PDF se procesó pero no se generó un archivo JSON válido' };
  }

  return _runStockUpdateFromJsons([pdfResult.jsonPath], steps, {
    facturasNuevas: 1,
    facturasExitosas: 1,
    facturasFallidas: 0
  });
}
