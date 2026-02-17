import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Wastage from '../models/Wastage.js';
import WastagePreset from '../models/WastagePreset.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import stockService from '../services/stockService.js';

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
  const sale = await Sale.create({ ...req.body, source: 'manual' });
  await stockService.applySaleToStock(sale);
  eventBus.emit(EVENT_TYPES.SALE_RECORDED, sale);
  res.status(201).json(sale);
});

//registra una compra manual y actualiza el inventario
export const recordManualPurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.create(req.body);
  await stockService.applyPurchaseToStock(purchase);
  eventBus.emit(EVENT_TYPES.PURCHASE_RECORDED, purchase);
  res.status(201).json(purchase);
});

//registra una merma manual y actualiza el inventario
export const recordManualWastage = asyncHandler(async (req, res) => {
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
    .populate('ingredient', 'name category purchaseUnit stockUnit productUnit conversionFactor conversionFactorToGrams stock')
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
    'name category purchaseUnit stockUnit productUnit conversionFactor conversionFactorToGrams stock'
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
    .populate('items.ingredient', 'name purchaseUnit stockUnit productUnit conversionFactor conversionFactorToGrams')
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
    .populate('items.ingredient', 'name purchaseUnit stockUnit productUnit conversionFactor conversionFactorToGrams')
    .populate('reportedBy', 'name email')
    .populate('deletedBy', 'name email')
    .lean();

  res.json(wastage);
});

