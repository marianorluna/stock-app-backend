/**
 * Servicio para actualizar el stock desde las ventas del TPV (Qamarero).
 *
 * Flujo:
 * 1. Obtiene los tickets PAID del día desde la API de Qamarero
 * 2. Comprueba si ya se importó el día de hoy (evita duplicados)
 * 3. Guarda la importación en QmareroImport
 * 4. Extrae la cantidad vendida por productId
 * 5. Hace matching con Dishes (por productId) → descuenta ingredientes via stockService.applyPOSSaleToStock
 *    (fórmula: stockMerma -= qGramos × qty; stock -= (qGramos/(1-factor)) × qty)
 * 6. Hace matching con Beverages (por productId) → descuenta stock via stockService.commitBeverageStockUpdates
 * 7. Crea un documento Sale (source: 'pos') con los platos vendidos y emite SALE_RECORDED
 * 8. Devuelve resultado detallado para el frontend
 */

import zlib from 'zlib';
import { promisify } from 'util';
import Config from '../models/Config.js';
import QmareroImport from '../models/QmareroImport.js';
import Sale from '../models/Sale.js';
import Dish from '../models/Dish.js';
import Beverage from '../models/Beverage.js';
import stockService from './stockService.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import logger from '../config/logger.js';

const gunzip = promisify(zlib.gunzip);

// ─── Helpers de Qamarero (equivalentes a qmareroVentas.js) ────────────────────

/**
 * Descomprime la respuesta si está comprimida con gzip
 */
async function decompressResponse(resp) {
    const contentEncoding = resp.headers.get('content-encoding');
    const buffer = Buffer.from(await resp.arrayBuffer());

    if (contentEncoding && contentEncoding.toLowerCase() === 'gzip') {
        try {
            const decompressed = await gunzip(buffer);
            return decompressed.toString('utf8');
        } catch {
            return buffer.toString('utf8');
        }
    }

    return buffer.toString('utf8');
}

/**
 * Determina el offset de zona horaria para Barcelona/Madrid (Europe/Madrid)
 */
function getBarcelonaOffset(fecha) {
    const mes = fecha.getUTCMonth(); // 0-11
    // Marzo (2) a Octubre (9) = UTC+2 (CEST), resto = UTC+1 (CET)
    return (mes >= 2 && mes <= 9) ? 2 : 1;
}

/**
 * Devuelve el inicio y fin del día en UTC interpretando en zona horaria de Barcelona
 */
function getStartEndOfDayUTC(fecha) {
    const y = fecha.getUTCFullYear();
    const m = fecha.getUTCMonth();
    const d = fecha.getUTCDate();
    const offsetHoras = getBarcelonaOffset(fecha);

    const from = new Date(Date.UTC(y, m, d, 0 - offsetHoras, 0, 0));
    const to   = new Date(Date.UTC(y, m, d, 23 - offsetHoras, 59, 59, 999));

    return { from, to };
}

/**
 * Formatea una fecha a YYYY-MM-DD sin conversión de zona horaria (usando UTC)
 */
function formatearFechaUTC(fecha) {
    const año = fecha.getUTCFullYear();
    const mes  = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const dia  = String(fecha.getUTCDate()).padStart(2, '0');
    return `${año}-${mes}-${dia}`;
}

/**
 * Llama a la API de Qamarero con el body configurado
 */
async function llamarQamarero(inputExtra = {}, bearer) {
    const url     = process.env.Q_API_URL || 'https://qamarero.stellate.sh/';
    const cookie  = process.env.Q_COOKIE;
    const bodyRaw = process.env.Q_API_BODY;

    if (!bearer && !cookie) throw new Error('No hay bearer configurado ni Q_COOKIE en las variables de entorno');
    if (!bodyRaw)           throw new Error('Falta Q_API_BODY con el GraphQL configurado');

    let bodyBase;
    try {
        bodyBase = JSON.parse(bodyRaw);
    } catch {
        throw new Error('Q_API_BODY no es un JSON válido');
    }

    const headers = {
        'User-Agent':       'Mozilla/5.0 (Node.js)',
        'Content-Type':     'application/json',
        'Accept-Encoding':  'gzip, deflate, br'
    };
    if (bearer) {
        headers['Authorization']      = 'JWT ' + bearer;
        headers['restaurant-token']   = bearer;
        headers['x-restaurant-token'] = bearer;
    }
    if (cookie) headers['Cookie'] = cookie;

    const body = JSON.parse(JSON.stringify(bodyBase));
    if (!body.variables)       body.variables = {};
    if (!body.variables.input) body.variables.input = {};
    Object.assign(body.variables.input, inputExtra);

    const resp = await fetch(url, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body)
    });

    if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'No se pudo leer el error');
        throw new Error(`HTTP ${resp.status} al llamar Qamarero: ${errorText.substring(0, 200)}`);
    }

    const text = await decompressResponse(resp);

    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error(`Error al parsear JSON de Qamarero: ${err.message}. Inicio: ${text.substring(0, 300)}`);
    }

    if (data?.errors?.length) {
        throw new Error('API Qamarero error: ' + (data.errors[0].message || 'desconocido'));
    }

    return data;
}

/**
 * Obtiene todos los tickets PAID del día (con paginación)
 */
async function obtenerTicketsDelDia(fecha, bearer) {
    const { from, to } = getStartEndOfDayUTC(fecha);
    const tickets = [];
    let page = 1;
    const MAXP = 60;

    while (page <= MAXP) {
        const data = await llamarQamarero({
            page,
            fromDate: from.toISOString(),
            toDate:   to.toISOString(),
            status:   ['PAID']
        }, bearer);

        const bills = data?.data?.bills;
        const objs  = bills?.objects;

        if (Array.isArray(objs)) {
            objs.forEach(t => tickets.push(t));
        }

        const hasNext = Boolean(bills?.hasNext);
        const pages   = Number(bills?.pages || 0);
        if (!hasNext || (pages && page >= pages)) break;
        page++;
    }

    return tickets;
}

/**
 * Extrae los items de los tickets agrupando por productId y sumando cantidades
 */
function extraerItemsDeTickets(tickets) {
    const itemsMap = new Map();

    for (const ticket of tickets) {
        if (!ticket.orders || !Array.isArray(ticket.orders)) continue;

        for (const order of ticket.orders) {
            if (!order.items || !Array.isArray(order.items)) continue;

            for (const item of order.items) {
                if (!item.product || item.quantity == null) continue;

                const productId    = item.product.id           || null;
                const productName  = item.product.name         || null;
                const categoryId   = item.product.category?.id   || null;
                const categoryName = item.product.category?.name || null;
                const quantity     = Number(item.quantity) || 0;

                if (!productId) continue;

                if (itemsMap.has(productId)) {
                    itemsMap.get(productId).quantity += quantity;
                } else {
                    itemsMap.set(productId, {
                        productId,
                        productName,
                        categoryId,
                        categoryName,
                        quantity
                    });
                }
            }
        }
    }

    return Array.from(itemsMap.values());
}

// ─── Función principal del servicio ──────────────────────────────────────────

/**
 * Actualiza el stock del inventario con las ventas del TPV del día actual o de una fecha específica.
 *
 * @param {Object} options
 * @param {string} [options.userId] - ID del usuario que ejecuta la importación
 * @param {string} [options.date] - Fecha en formato YYYY-MM-DD (opcional, por defecto usa el día de hoy)
 * @returns {Promise<Object>} - Resultado detallado del proceso
 */
export async function updateStockFromPOS({ userId, date } = {}) {
    const steps = [];

    // ── Paso 1: Obtener bearer de la BD ───────────────────────────────────────
    steps.push({ step: 1, name: 'Obtener credenciales de Qamarero', success: false });

    let bearer;
    try {
        const config = await Config.findOne();
        if (!config || !config.value_qm_bearer) {
            throw new Error('No hay bearer de Qamarero configurado. Ve a Configuraciones y agrega el bearer token.');
        }
        bearer = config.value_qm_bearer;
        steps[steps.length - 1].success = true;
    } catch (err) {
        steps[steps.length - 1].error = err.message;
        throw { steps, error: err.message };
    }

    // ── Paso 2: Determinar fecha a usar ───────────────────────────────────────
    let fechaSeleccionada;
    let fechaStr;

    if (date && typeof date === 'string') {
        // Validar formato YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            throw { steps, error: 'Formato de fecha inválido. Debe ser YYYY-MM-DD (ejemplo: 2024-01-15)' };
        }

        // Crear Date desde la fecha proporcionada (en UTC para evitar problemas de zona horaria)
        const [year, month, day] = date.split('-').map(Number);
        fechaSeleccionada = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        
        // Validar que la fecha sea válida
        if (isNaN(fechaSeleccionada.getTime())) {
            throw { steps, error: 'Fecha inválida proporcionada' };
        }

        fechaStr = formatearFechaUTC(fechaSeleccionada);
    } else {
        // Usar fecha de hoy si no se proporciona
        fechaSeleccionada = new Date();
        fechaStr = formatearFechaUTC(fechaSeleccionada);
    }

    // ── Paso 3: Verificar duplicado ────────────────────────────────────────────
    const mensajeVerificacion = date ? `Verificar que no se haya importado el ${fechaStr}` : 'Verificar que no se haya importado hoy';
    steps.push({ step: 2, name: mensajeVerificacion, success: false });

    try {
        const existingImport = await QmareroImport.findOne({ date: fechaStr });
        if (existingImport) {
            const importedAt = existingImport.importedAt
                ? new Date(existingImport.importedAt).toLocaleString('es-ES')
                : 'fecha desconocida';
            throw {
                isDuplicateImport: true,
                message: `Ya se importaron las ventas del ${fechaStr} (a las ${importedAt}). No se pueden registrar duplicados para el mismo día.`
            };
        }
        steps[steps.length - 1].success = true;
    } catch (err) {
        if (err.isDuplicateImport) {
            steps[steps.length - 1].error = err.message;
            throw { steps, isDuplicateImport: true, error: err.message };
        }
        steps[steps.length - 1].error = err.message;
        throw { steps, error: err.message };
    }

    // ── Paso 4: Obtener tickets de Qamarero ────────────────────────────────────
    steps.push({ step: 3, name: `Obtener tickets PAID del día ${fechaStr} desde Qamarero`, success: false });

    let tickets = [];
    try {
        tickets = await obtenerTicketsDelDia(fechaSeleccionada, bearer);
        steps[steps.length - 1].success = true;
        steps[steps.length - 1].details = { totalTickets: tickets.length };
        logger.info(`✅ Obtenidos ${tickets.length} tickets de Qamarero para ${fechaStr}`);
    } catch (err) {
        steps[steps.length - 1].error = err.message;
        throw { steps, error: `Error obteniendo tickets de Qamarero: ${err.message}` };
    }

    if (tickets.length === 0) {
        return {
            success: true,
            noTickets: true,
            message: `No se encontraron tickets PAID para el día ${fechaStr} en Qamarero.`,
            steps,
            summary: {
                date: fechaStr,
                totalTickets: 0,
                productosUnicos: 0,
                ingredientesActualizados: 0,
                bebidasActualizadas: 0,
                itemsSinMatch: 0
            }
        };
    }

    // ── Paso 5: Extraer items por productId ────────────────────────────────────
    steps.push({ step: 4, name: 'Extraer y agrupar items por productId', success: false });

    let extractedItems = [];
    try {
        extractedItems = extraerItemsDeTickets(tickets);
        steps[steps.length - 1].success = true;
        steps[steps.length - 1].details = { productosUnicos: extractedItems.length };
        logger.info(`✅ Extraídos ${extractedItems.length} productos únicos de ${tickets.length} tickets`);
    } catch (err) {
        steps[steps.length - 1].error = err.message;
        throw { steps, error: `Error extrayendo items: ${err.message}` };
    }

    // ── Paso 6: Guardar importación en la BD ──────────────────────────────────
    steps.push({ step: 5, name: 'Guardar registro de importación', success: false });

    try {
        await QmareroImport.create({
            date:           fechaStr,
            importedAt:     new Date(),
            importedBy:     userId || undefined,
            totalTickets:   tickets.length,
            extractedItems,
            status:         'success'
        });
        steps[steps.length - 1].success = true;
        logger.info(`✅ Importación guardada en BD para ${fechaStr}`);
    } catch (err) {
        steps[steps.length - 1].error = err.message;
        throw { steps, error: `Error guardando importación: ${err.message}` };
    }

    // ── Paso 7: Matching y descuento de stock ─────────────────────────────────
    steps.push({ step: 6, name: 'Descontar stock por ventas del TPV', success: false });

    let updatedIngredients = [];
    let updatedBeverages   = [];
    const unmatchedItems   = [];

    try {
        // Cargar dishes con productId configurado y receta + ingredientes populados
        const [allDishes, allBeverages] = await Promise.all([
            Dish.find({ productId: { $ne: '', $exists: true } })
                .populate({ path: 'recipe.ingredient', select: 'name sku stock stockMerma factorMermaNat' })
                .lean(),
            Beverage.find({ productId: { $ne: '', $exists: true } })
                .lean()
        ]);

        // Detectar productId duplicados en la BD (igual que compras detecta codeArticlePurchase duplicado)
        const dishDuplicates    = new Set();
        const dishByProductId   = new Map();
        for (const d of allDishes) {
            if (dishByProductId.has(d.productId)) dishDuplicates.add(d.productId);
            else dishByProductId.set(d.productId, d);
        }

        const beverageDuplicates  = new Set();
        const beverageByProductId = new Map();
        for (const b of allBeverages) {
            if (beverageByProductId.has(b.productId)) beverageDuplicates.add(b.productId);
            else beverageByProductId.set(b.productId, b);
        }

        // Arrays para stockService
        const dishQuantities   = []; // { dish, quantity }
        const beverageUpdates  = []; // { beverageId, delta }

        // Datos previos de bebidas (para mostrar en tabla de resultados)
        const beveragePrevMap  = new Map(); // id → { name, sku, stockAnterior, deltaUnits }

        for (const item of extractedItems) {
            const { productId, productName, quantity } = item;
            if (!productId || quantity <= 0) continue;

            // ─── Duplicado en BD ─────────────────────────────────────────────
            if (dishDuplicates.has(productId)) {
                unmatchedItems.push({
                    productId,
                    productName: productName || 'Desconocido',
                    quantity,
                    reason: 'productId duplicado en platos — debe resolverse manualmente'
                });
                logger.warn(`⚠️  productId duplicado en platos: ${productId} (${productName})`);
                continue;
            }

            if (beverageDuplicates.has(productId)) {
                unmatchedItems.push({
                    productId,
                    productName: productName || 'Desconocido',
                    quantity,
                    reason: 'productId duplicado en bebidas — debe resolverse manualmente'
                });
                logger.warn(`⚠️  productId duplicado en bebidas: ${productId} (${productName})`);
                continue;
            }

            if (dishByProductId.has(productId)) {
                // ─── PLATO ────────────────────────────────────────────────────
                const dish = dishByProductId.get(productId);

                if (!dish.recipe || dish.recipe.length === 0) {
                    unmatchedItems.push({
                        productId,
                        productName: productName || dish.name,
                        quantity,
                        reason: 'El plato no tiene receta configurada'
                    });
                    continue;
                }

                dishQuantities.push({ dish, quantity });

            } else if (beverageByProductId.has(productId)) {
                // ─── BEBIDA ───────────────────────────────────────────────────
                const bev        = beverageByProductId.get(productId);
                const deltaUnits = Math.round(quantity);
                const bevId      = bev._id.toString();

                // Acumular si el mismo productId aparece varias veces
                if (beveragePrevMap.has(bevId)) {
                    beveragePrevMap.get(bevId).deltaUnits += deltaUnits;
                } else {
                    beveragePrevMap.set(bevId, {
                        id:           bev._id,
                        name:         bev.name,
                        sku:          bev.sku,
                        stockAnterior: bev.stock,
                        deltaUnits
                    });
                }

            } else {
                // ─── SIN MATCH ────────────────────────────────────────────────
                unmatchedItems.push({
                    productId,
                    productName: productName || 'Desconocido',
                    quantity,
                    reason: 'No se encontró match en platos ni bebidas por productId'
                });
            }
        }

        // ── Descuento de ingredientes (con fórmula POS + notificaciones stock bajo) ──
        if (dishQuantities.length > 0) {
            const result = await stockService.applyPOSSaleToStock(dishQuantities);
            updatedIngredients = result.updatedIngredients;
        }

        // ── Descuento de bebidas ────────────────────────────────────────────────
        for (const bev of beveragePrevMap.values()) {
            beverageUpdates.push({ beverageId: bev.id, delta: -bev.deltaUnits });
            updatedBeverages.push({
                name:         bev.name,
                sku:          bev.sku,
                stockAnterior: bev.stockAnterior,
                stockRestado:  bev.deltaUnits,
                stockNuevo:    bev.stockAnterior - bev.deltaUnits
            });
        }

        if (beverageUpdates.length > 0) {
            await stockService.commitBeverageStockUpdates(beverageUpdates, {
                context: 'pos-sale', referenceId: fechaStr
            });
        }

        steps[steps.length - 1].success = true;
        steps[steps.length - 1].details = {
            ingredientesActualizados: updatedIngredients.length,
            bebidasActualizadas:      updatedBeverages.length,
            itemsSinMatch:            unmatchedItems.length
        };

        logger.info(
            `✅ Stock actualizado: ${updatedIngredients.length} ingredientes, ` +
            `${updatedBeverages.length} bebidas, ${unmatchedItems.length} sin match`
        );

    } catch (err) {
        steps[steps.length - 1].error = err.message || String(err);
        throw { steps, error: `Error actualizando stock: ${err.message || err}` };
    }

    // ── Paso 8: Crear documentos Sale por ticket y emitir evento ─────────────
    try {
        const [allDishesForSale, allBeveragesForSale] = await Promise.all([
            Dish.find({ productId: { $ne: '', $exists: true } }).lean(),
            Beverage.find({ productId: { $ne: '', $exists: true } }).lean()
        ]);
        const dishIdByProductId = new Map(allDishesForSale.map(d => [d.productId, d._id]));
        // Mapa productId → objeto completo de bebida (para acceder a _id y name)
        const bevByProductId    = new Map(allBeveragesForSale.map(b => [b.productId, b]));

        const createdSales = [];

        for (const ticket of tickets) {
            // Extraer items solo de este ticket individual
            const ticketItems = extraerItemsDeTickets([ticket]);

            // Separar platos y bebidas
            const saleLines         = [];
            const metaBeverageLines = [];

            for (const item of ticketItems) {
                if (!item.productId || item.quantity <= 0) continue;

                const dishId = dishIdByProductId.get(item.productId);
                if (dishId) {
                    saleLines.push({ dish: dishId, quantity: Math.round(item.quantity) });
                }

                const bev = bevByProductId.get(item.productId);
                if (bev) {
                    metaBeverageLines.push({
                        beverageId:   bev._id.toString(),
                        beverageName: bev.name ?? item.productName ?? 'Bebida',
                        quantity:     Math.round(item.quantity)
                    });
                }
            }

            // Si el ticket no tiene platos con match, lo omitimos (puede ser solo bebidas)
            if (saleLines.length === 0) continue;

            const invoiceCode = ticket.invoices?.[0]?.code || ticket.id;
            const tableCode   = ticket.table?.code          || null;
            const placeName   = ticket.table?.place?.name   || null;
            const totalAmount = ticket.totalAmount           ?? null;
            const closedAt    = ticket.closedAt ? new Date(ticket.closedAt) : new Date();

            const metaEntries = [
                ['invoiceCode',   invoiceCode],
                ['tableCode',     tableCode],
                ['placeName',     placeName],
                ['totalAmount',   totalAmount],
                ['fechaTPV',      fechaStr],
                ['ticketId',      ticket.id],
                ['importedBy',    userId || 'system'],
                ...(metaBeverageLines.length > 0 ? [['beverageLines', metaBeverageLines]] : [])
            ].filter(([, v]) => v !== null && v !== undefined);

            const sale = await Sale.create({
                source:    'pos',
                timestamp: closedAt,
                lines:     saleLines,
                metadata:  new Map(metaEntries)
            });

            createdSales.push(sale);
        }

        // Emitir UN ÚNICO evento SALE_RECORDED con el total de líneas importadas
        if (createdSales.length > 0) {
            eventBus.emit(EVENT_TYPES.SALE_RECORDED, {
                _id:    createdSales[0]._id,
                source: 'pos',
                lines:  createdSales.flatMap(s => s.lines)
            });
            logger.info(`✅ ${createdSales.length} documentos Sale creados (source: pos)`);
        }
    } catch (err) {
        // No interrumpir el flujo si falla la creación del Sale; solo loguear
        logger.error('⚠️  Error creando documentos Sale para ventas TPV:', err.message || err);
    }

    logger.info(`✅ Actualización de stock desde TPV completada para ${fechaStr}`);

    return {
        success: true,
        steps,
        summary: {
            date:                    fechaStr,
            totalTickets:            tickets.length,
            productosUnicos:         extractedItems.length,
            ingredientesActualizados: updatedIngredients.length,
            bebidasActualizadas:     updatedBeverages.length,
            itemsSinMatch:           unmatchedItems.length
        },
        updatedIngredients,
        updatedBeverages,
        unmatchedItems
    };
}
