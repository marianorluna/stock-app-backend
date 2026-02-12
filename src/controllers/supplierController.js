import asyncHandler from 'express-async-handler';
import Purchase from '../models/Purchase.js';

//obtiene la lista de proveedores agregados desde las compras
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

//actualiza el nombre de un proveedor en todas sus compras
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

//elimina el proveedor de todas sus compras
export const deleteSupplier = asyncHandler(async (req, res) => {
  const supplierName = decodeSupplierName(req.params.supplierName);
  const { modifiedCount } = await Purchase.updateMany(
    { supplier: supplierName },
    { $unset: { supplier: '' } }
  );

  res.json({ updated: modifiedCount });
});

//duplica todas las compras de un proveedor con un nuevo nombre
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


