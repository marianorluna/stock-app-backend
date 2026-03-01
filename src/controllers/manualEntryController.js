import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import fs from 'fs';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Wastage from '../models/Wastage.js';
import WastagePreset from '../models/WastagePreset.js';
import Beverage from '../models/Beverage.js';
import ProcessedInvoice from '../models/ProcessedInvoice.js';
import QmareroImport from '../models/QmareroImport.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import stockService from '../services/stockService.js';
import logger from '../config/logger.js';
import { isStockUpdateInProgress } from '../services/schedulerService.js';

//construye un filtro de fechas para consultas de registros manuales
const buildDateFilter = (query) => {
  const { from, to } = query;
  if (!from && !to) return {};

  const filter = {};
  const range = {};

  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new Error('Invalid from date');
    }
    range.$gte = fromDate;
  }

  if (to) {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new Error('Invalid to date');
    }
    range.$lte = toDate;
  }

  if (Object.keys(range).length) {
    filter.timestamp = range;
  }

  return filter;
};

//registra una venta manual y actualiza el inventario
export const recordManualSale = asyncHandler(async (req, res) => {
  if (isStockUpdateInProgress()) {
    res.status(409);
    throw new Error('No se pueden registrar ventas mientras la actualización automática de stock está en curso. Por favor, inténtalo de nuevo en unos minutos.');
  }
  const sale = await Sale.create({ ...req.body, source: 'manual' });
  await stockService.applySaleToStock(sale);
  eventBus.emit(EVENT_TYPES.SALE_RECORDED, sale);
  res.status(201).json(sale);
});

//registra una compra manual y actualiza el inventario
export const recordManualPurchase = asyncHandler(async (req, res) => {
  if (isStockUpdateInProgress()) {
    res.status(409);
    throw new Error('No se pueden registrar compras mientras la actualización automática de stock está en curso. Por favor, inténtalo de nuevo en unos minutos.');
  }
  const purchase = await Purchase.create(req.body);
  await stockService.applyPurchaseToStock(purchase);
  eventBus.emit(EVENT_TYPES.PURCHASE_RECORDED, purchase);
  res.status(201).json(purchase);
});

//registra una merma manual y actualiza el inventario
export const recordManualWastage = asyncHandler(async (req, res) => {
  if (isStockUpdateInProgress()) {
    res.status(409);
    throw new Error('No se pueden registrar mermas mientras la actualización automática de stock está en curso. Por favor, inténtalo de nuevo en unos minutos.');
  }
  const createdBy =
    req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : undefined;

  const wastage = await Wastage.create({
    ...req.body,
    ...(createdBy ? { reportedBy: createdBy } : {})
  });
  await stockService.applyWastageToStock(wastage);
  eventBus.emit(EVENT_TYPES.WASTAGE_RECORDED, wastage);
  res.status(201).json(wastage);
});

//elimina un registro de merma y revierte el cambio en el inventario
export const deleteManualWastage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedByUserId =
    req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : undefined;

  const wastage = await Wastage.findById(id);
  if (!wastage) {
    res.status(404);
    throw new Error('Wastage record not found');
  }

  // Marcar como eliminado (soft delete) y guardar quién eliminó
  wastage.isDeleted = true;
  wastage.deletedAt = new Date();
  if (deletedByUserId) {
    wastage.deletedBy = deletedByUserId;
  }
  await wastage.save();

  await stockService.revertWastageFromStock(wastage);
  eventBus.emit(EVENT_TYPES.WASTAGE_RECORDED, { deleted: true, _id: id });
  res.status(204).end();
});

export const listWastagePresets = asyncHandler(async (req, res) => {
  const presets = await WastagePreset.find()
    .sort({ name: 1 })
    .populate('ingredient', 'name categoryName stockUnit stock')
    .lean();

  res.json(presets);
});

export const createWastagePreset = asyncHandler(async (req, res) => {
  const createdBy =
    req.user?.sub && mongoose.Types.ObjectId.isValid(req.user.sub) ? req.user.sub : undefined;

  const preset = await WastagePreset.create({
    ...req.body,
    ...(createdBy ? { createdBy } : {})
  });

  const populatedPreset = await preset.populate(
    'ingredient',
    'name categoryName stockUnit stock'
  );

  res.status(201).json(populatedPreset);
});

export const deleteWastagePreset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const preset = await WastagePreset.findByIdAndDelete(id);
  if (!preset) {
    res.status(404);
    throw new Error('Preset not found');
  }
  res.status(204).end();
});

// Elimina una compra, revierte el stock de ingredientes/bebidas y borra el ProcessedInvoice
export const deleteManualPurchase = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('ID de compra no válido');
  }

  const purchase = await Purchase.findById(id);
  if (!purchase) {
    res.status(404);
    throw new Error('Compra no encontrada');
  }

  // ── 1. Revertir stock de ingredientes ─────────────────────────────────────
  if (purchase.items.length > 0) {
    try {
      await stockService.revertPurchaseFromStock(purchase);
      logger.info(`✅ Stock de ingredientes revertido para compra ${id}`);
    } catch (err) {
      logger.error(`❌ Error revirtiendo stock de ingredientes para compra ${id}:`, err);
      res.status(500);
      throw new Error(`Error al revertir el stock de ingredientes: ${err.message}`);
    }
  }

  // ── 2. Revertir stock de bebidas (si hay jsonPath en metadata) ────────────
  const jsonPath = purchase.metadata instanceof Map
    ? purchase.metadata.get('jsonPath')
    : purchase.metadata?.jsonPath;

  if (jsonPath && fs.existsSync(jsonPath)) {
    try {
      const invoiceData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const listaItems = Array.isArray(invoiceData.listaItems) ? invoiceData.listaItems : [];

      if (listaItems.length > 0) {
        const beverages = await Beverage.find({
          codeArticlePurchase: { $exists: true, $ne: '' }
        }).lean();

        const beverageMap = new Map(
          beverages.map(b => [String(b.codeArticlePurchase).trim(), b])
        );

        const bulkOps = [];
        for (const item of listaItems) {
          const codigo = String(item.codigoArticulo || '').trim();
          const bev = beverageMap.get(codigo);
          if (bev) {
            const unidades = Math.abs(Number(item.cantidadFactura) || 0);
            if (unidades > 0) {
              bulkOps.push({
                updateOne: {
                  filter: { _id: bev._id },
                  update: { $inc: { stock: -unidades } }
                }
              });
            }
          }
        }

        if (bulkOps.length > 0) {
          await Beverage.bulkWrite(bulkOps);
          logger.info(`✅ Stock de ${bulkOps.length} bebida(s) revertido para compra ${id}`);
        }
      }
    } catch (err) {
      // No bloqueante: registrar pero continuar con la eliminación
      logger.warn(`⚠️  No se pudo revertir stock de bebidas para compra ${id}: ${err.message}`);
    }

    // ── 3. Eliminar ProcessedInvoice para permitir resubir el PDF ────────────
    try {
      const deleted = await ProcessedInvoice.deleteOne({ jsonPath });
      if (deleted.deletedCount > 0) {
        logger.info(`✅ ProcessedInvoice eliminado (jsonPath: ${jsonPath})`);
      } else {
        logger.debug(`No se encontró ProcessedInvoice con jsonPath: ${jsonPath}`);
      }
    } catch (err) {
      logger.warn(`⚠️  No se pudo eliminar ProcessedInvoice (${jsonPath}): ${err.message}`);
    }
  }

  // ── 4. Eliminar el registro de compra ──────────────────────────────────────
  await Purchase.findByIdAndDelete(id);
  logger.info(`✅ Compra ${id} eliminada correctamente`);

  res.status(204).end();
});

// Elimina una venta, revierte el stock de ingredientes (y bebidas si era POS)
// y elimina el QmareroImport del día si era la última venta POS de esa jornada
export const deleteManualSale = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('ID de venta no válido');
  }

  // Usar .lean() para obtener objetos planos y garantizar compatibilidad con stockService
  const sale = await Sale.findById(id)
    .populate({
      path: 'lines.dish',
      populate: { path: 'recipe.ingredient', select: 'name sku stock stockMerma factorMermaNat' }
    })
    .lean();

  if (!sale) {
    res.status(404);
    throw new Error('Venta no encontrada');
  }

  logger.info(`🗑️  Eliminando venta ${id} (source: ${sale.source}, lines: ${sale.lines?.length ?? 0})`);

  // ── 1. Revertir stock de ingredientes ──────────────────────────────────────
  try {
    if (sale.source === 'pos') {
      // Con .lean(), line.dish es un objeto plano o un ObjectId si populate falló
      const dishQuantities = sale.lines
        .filter(line => {
          if (!line.dish || typeof line.dish !== 'object') {
            logger.warn(`⚠️  Venta ${id}: dish no poblado para línea ${JSON.stringify(line)}`);
            return false;
          }
          if (!Array.isArray(line.dish.recipe) || line.dish.recipe.length === 0) {
            logger.warn(`⚠️  Venta ${id}: plato ${line.dish._id} sin receta, se omite del revert`);
            return false;
          }
          return true;
        })
        .map(line => ({ dish: line.dish, quantity: line.quantity }));

      logger.info(`   → ${dishQuantities.length} plato(s) a revertir en ingredientes`);

      if (dishQuantities.length > 0) {
        await stockService.revertPOSSaleFromStock(dishQuantities);
        logger.info(`✅ Stock ingredientes POS revertido para venta ${id}`);
      } else {
        logger.warn(`⚠️  Venta ${id}: no se encontraron platos con receta — no se revertió stock de ingredientes`);
      }
    } else {
      await stockService.revertSaleFromStock(sale);
      logger.info(`✅ Stock manual revertido para venta ${id}`);
    }
  } catch (err) {
    logger.error(`❌ Error revirtiendo stock de ingredientes para venta ${id}:`, err);
    res.status(500);
    throw new Error(`Error al revertir el stock de ingredientes: ${err.message}`);
  }

  // ── 2. Revertir stock de bebidas (solo ventas POS con beverageLines en metadata) ─
  if (sale.source === 'pos') {
    const beverageLines = sale.metadata instanceof Map
      ? sale.metadata.get('beverageLines')
      : sale.metadata?.beverageLines;

    if (Array.isArray(beverageLines) && beverageLines.length > 0) {
      try {
        const beverageUpdates = beverageLines.map(bl => ({
          beverageId: bl.beverageId,
          delta: Math.abs(Math.round(Number(bl.quantity))) // positivo = devolver al stock
        }));
        await stockService.commitBeverageStockUpdates(beverageUpdates, {
          context: 'pos-sale-revert',
          referenceId: id
        });
        logger.info(`✅ Stock bebidas POS revertido para venta ${id} (${beverageUpdates.length} bebida(s))`);
      } catch (err) {
        // No bloqueante: si falla, se avisa por log pero se continúa
        logger.warn(`⚠️  No se pudo revertir stock de bebidas para venta ${id}: ${err.message}`);
      }
    }

    // ── 3. Eliminar QmareroImport si es la última venta POS del día ───────────
    const fechaTPV = sale.metadata instanceof Map
      ? sale.metadata.get('fechaTPV')
      : sale.metadata?.fechaTPV;

    if (fechaTPV && typeof fechaTPV === 'string') {
      try {
        const dayStart = new Date(fechaTPV + 'T00:00:00.000Z');
        const dayEnd   = new Date(fechaTPV + 'T23:59:59.999Z');

        const remainingSales = await Sale.countDocuments({
          _id:       { $ne: sale._id },
          source:    'pos',
          timestamp: { $gte: dayStart, $lte: dayEnd }
        });

        if (remainingSales === 0) {
          const deleted = await QmareroImport.deleteOne({ date: fechaTPV });
          if (deleted.deletedCount > 0) {
            logger.info(`✅ QmareroImport eliminado para ${fechaTPV} — permite reimportación del día`);
          }
        } else {
          logger.info(`ℹ️  Quedan ${remainingSales} venta(s) POS para ${fechaTPV}, QmareroImport se mantiene`);
        }
      } catch (err) {
        logger.warn(`⚠️  No se pudo verificar/eliminar QmareroImport: ${err.message}`);
      }
    }
  }

  // ── 4. Eliminar el documento Sale ──────────────────────────────────────────
  await Sale.findByIdAndDelete(id);
  eventBus.emit(EVENT_TYPES.SALE_RECORDED, { deleted: true, _id: id });
  logger.info(`✅ Venta ${id} eliminada correctamente`);

  res.status(204).end();
});

export const listManualSales = asyncHandler(async (req, res) => {
  let filter = {};
  try {
    filter = buildDateFilter(req.query);
  } catch (error) {
    res.status(400);
    throw error;
  }

  const sales = await Sale.find(filter)
    .sort({ timestamp: -1 })
    .populate('lines.dish', 'name price type')
    .lean();

  res.json(sales);
});

export const listManualPurchases = asyncHandler(async (req, res) => {
  let filter = {};
  try {
    filter = buildDateFilter(req.query);
  } catch (error) {
    res.status(400);
    throw error;
  }

  const purchases = await Purchase.find(filter)
    .sort({ timestamp: -1 })
    .populate('items.ingredient', 'name categoryName stockUnit')
    .lean();

  res.json(purchases);
});

export const listManualWastage = asyncHandler(async (req, res) => {
  let filter = {};
  try {
    filter = buildDateFilter(req.query);
  } catch (error) {
    res.status(400);
    throw error;
  }

  // Excluir mermas eliminadas (soft delete)
  filter.isDeleted = { $ne: true };

  const wastage = await Wastage.find(filter)
    .sort({ timestamp: -1 })
    .populate('items.ingredient', 'name categoryName stockUnit')
    .populate('items.beverage', 'name categoryName stockUnit')
    .populate('reportedBy', 'name email')
    .populate('deletedBy', 'name email')
    .lean();

  res.json(wastage);
});

