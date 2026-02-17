import asyncHandler from 'express-async-handler';
import Purchase from '../models/Purchase.js';
import Supplier from '../models/Supplier.js';

//obtiene la lista de proveedores: todos los Supplier + stats desde Purchase (supplier = SKU)
export const listSuppliers = asyncHandler(async (_req, res) => {
  const [supplierDocs, fromPurchases] = await Promise.all([
    Supplier.find().lean(),
    Purchase.aggregate([
      { $match: { supplier: { $exists: true, $ne: '' } } },
      { $group: { _id: '$supplier', lastPurchase: { $max: '$timestamp' }, totalPurchases: { $sum: 1 } } }
    ])
  ]);

  const purchaseMap = new Map(fromPurchases.map((p) => [p._id, p]));

  const result = supplierDocs.map((s) => {
    const stats = purchaseMap.get(s.sku) ?? {};
    return {
      sku: s.sku,
      name: s.name,
      nif: s.nif || '',
      address: s.address || '',
      city: s.city || '',
      zip: s.zip || '',
      country: s.country || '',
      tel: s.tel || '',
      contact: s.contact || '',
      email: s.email || '',
      lastPurchase: stats.lastPurchase ?? null,
      totalPurchases: stats.totalPurchases ?? 0
    };
  }).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  res.json(result);
});

const decodeSupplierSku = (value) => decodeURIComponent(value).trim();

//crea un nuevo proveedor
export const createSupplier = asyncHandler(async (req, res) => {
  const { sku, name, nif, address, city, zip, country, tel, contact, email } = req.body;

  if (!sku || typeof sku !== 'string' || !sku.trim()) {
    res.status(400);
    throw new Error('sku es requerido');
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400);
    throw new Error('name es requerido');
  }

  const supplierData = {
    sku: sku.trim(),
    name: name.trim(),
    ...(nif && { nif: typeof nif === 'string' ? nif.trim() : nif }),
    ...(address && { address: typeof address === 'string' ? address.trim() : address }),
    ...(city && { city: typeof city === 'string' ? city.trim() : city }),
    ...(zip && { zip: typeof zip === 'string' ? zip.trim() : zip }),
    ...(country && { country: typeof country === 'string' ? country.trim() : country }),
    ...(tel && { tel: typeof tel === 'string' ? tel.trim() : tel }),
    ...(contact && { contact: typeof contact === 'string' ? contact.trim() : contact }),
    ...(email && { email: typeof email === 'string' ? email.trim().toLowerCase() : email })
  };

  const existingSupplier = await Supplier.findOne({ sku: supplierData.sku });
  if (existingSupplier) {
    res.status(409);
    throw new Error('Ya existe un proveedor con ese SKU');
  }

  const supplier = await Supplier.create(supplierData);

  res.status(201).json({
    sku: supplier.sku,
    name: supplier.name,
    nif: supplier.nif || '',
    address: supplier.address || '',
    city: supplier.city || '',
    zip: supplier.zip || '',
    country: supplier.country || '',
    tel: supplier.tel || '',
    contact: supplier.contact || '',
    email: supplier.email || '',
    totalPurchases: 0,
    lastPurchase: null
  });
});

//actualiza el proveedor (todos los campos del modelo Supplier); las compras siguen por SKU
export const updateSupplier = asyncHandler(async (req, res) => {
  const supplierSku = decodeSupplierSku(req.params.supplierSku);
  const { name, nif, address, city, zip, country, tel, contact, email } = req.body;

  const update = {};
  if (name != null && typeof name === 'string' && name.trim()) update.name = name.trim();
  if (nif != null) update.nif = typeof nif === 'string' ? nif.trim() : nif;
  if (address != null) update.address = typeof address === 'string' ? address.trim() : address;
  if (city != null) update.city = typeof city === 'string' ? city.trim() : city;
  if (zip != null) update.zip = typeof zip === 'string' ? zip.trim() : zip;
  if (country != null) update.country = typeof country === 'string' ? country.trim() : country;
  if (tel != null) update.tel = typeof tel === 'string' ? tel.trim() : tel;
  if (contact != null) update.contact = typeof contact === 'string' ? contact.trim() : contact;
  if (email != null) update.email = typeof email === 'string' ? email.trim().toLowerCase() : email;

  if (Object.keys(update).length === 0) {
    res.status(400);
    throw new Error('No hay campos válidos para actualizar');
  }

  const supplier = await Supplier.findOneAndUpdate(
    { sku: supplierSku },
    { $set: update },
    { new: true }
  );

  if (!supplier) {
    res.status(404);
    throw new Error('Proveedor no encontrado');
  }

  res.json({ updated: 1 });
});

//elimina el proveedor de todas sus compras (unset) y opcionalmente del modelo Supplier
export const deleteSupplier = asyncHandler(async (req, res) => {
  const supplierSku = decodeSupplierSku(req.params.supplierSku);
  const { modifiedCount } = await Purchase.updateMany(
    { supplier: supplierSku },
    { $unset: { supplier: '' } }
  );

  await Supplier.deleteOne({ sku: supplierSku });

  res.json({ updated: modifiedCount });
});

//duplica compras de un proveedor asignándolas a otro (por SKU)
export const duplicateSupplier = asyncHandler(async (req, res) => {
  const supplierSku = decodeSupplierSku(req.params.supplierSku);
  const { newSku } = req.body;

  if (!newSku || typeof newSku !== 'string' || !newSku.trim()) {
    res.status(400);
    throw new Error('newSku es requerido');
  }

  const targetSupplier = await Supplier.findOne({ sku: newSku.trim() });
  if (!targetSupplier) {
    res.status(404);
    throw new Error('Proveedor destino no encontrado');
  }

  const purchases = await Purchase.find({ supplier: supplierSku }).lean();

  if (!purchases.length) {
    res.status(404);
    throw new Error('No se encontraron compras para duplicar');
  }

  const duplicatedPurchases = purchases.map((purchase) => ({
    supplier: targetSupplier.sku,
    invoiceNumber: purchase.invoiceNumber ? `${purchase.invoiceNumber}-copy` : undefined,
    timestamp: new Date(),
    items: purchase.items,
    metadata: purchase.metadata
  }));

  await Purchase.insertMany(duplicatedPurchases);

  res.status(201).json({ created: duplicatedPurchases.length });
});


