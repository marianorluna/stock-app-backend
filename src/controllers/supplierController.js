import asyncHandler from 'express-async-handler';
import Purchase from '../models/Purchase.js';

export const listSuppliers = asyncHandler(async (_req, res) => {
  const suppliers = await Purchase.aggregate([
    {
      $match: {
        supplier: { $exists: true, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$supplier',
        lastPurchase: { $max: '$timestamp' },
        totalPurchases: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  res.json(
    suppliers.map((supplier) => ({
      name: supplier._id,
      lastPurchase: supplier.lastPurchase ?? null,
      totalPurchases: supplier.totalPurchases ?? 0
    }))
  );
});

const decodeSupplierName = (value) => decodeURIComponent(value).trim();

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplierName = decodeSupplierName(req.params.supplierName);
  const { newName } = req.body;

  if (!newName || typeof newName !== 'string' || !newName.trim()) {
    res.status(400);
    throw new Error('Nombre de proveedor inválido');
  }

  const normalizedName = newName.trim();
  const { modifiedCount } = await Purchase.updateMany(
    { supplier: supplierName },
    { $set: { supplier: normalizedName } }
  );

  res.json({ updated: modifiedCount });
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const supplierName = decodeSupplierName(req.params.supplierName);
  const { modifiedCount } = await Purchase.updateMany(
    { supplier: supplierName },
    { $unset: { supplier: '' } }
  );

  res.json({ updated: modifiedCount });
});

export const duplicateSupplier = asyncHandler(async (req, res) => {
  const supplierName = decodeSupplierName(req.params.supplierName);
  const { newName } = req.body;

  if (!newName || typeof newName !== 'string' || !newName.trim()) {
    res.status(400);
    throw new Error('Nombre de proveedor inválido');
  }

  const normalizedName = newName.trim();
  const purchases = await Purchase.find({ supplier: supplierName }).lean();

  if (!purchases.length) {
    res.status(404);
    throw new Error('No se encontraron compras para duplicar');
  }

  const duplicatedPurchases = purchases.map((purchase) => ({
    supplier: normalizedName,
    invoiceNumber: purchase.invoiceNumber ? `${purchase.invoiceNumber}-copy` : undefined,
    timestamp: new Date(),
    items: purchase.items,
    metadata: purchase.metadata
  }));

  await Purchase.insertMany(duplicatedPurchases);

  res.status(201).json({ created: duplicatedPurchases.length });
});


