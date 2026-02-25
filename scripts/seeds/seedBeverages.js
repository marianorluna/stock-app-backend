/**
 * Script para poblar la base de datos con bebidas.
 * Lee desde stockearly.bebidas.json y las carga como documentos Beverage.
 * Uso: node scripts/seeds/seedBeverages.js
 * Orden: seedRoles -> seedIngredients -> seedBeverages -> seedMenu -> seedSuppliers -> seedEvents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDatabase from '../../src/config/database.js';
import Beverage from '../../src/models/Beverage.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const seed = async () => {
  const mongoUri = process.env.NODE_ENV === 'production'
    ? (process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI)
    : process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI is not defined in environment variables');
  }

  const rawData = JSON.parse(
    readFileSync(join(__dirname, 'stockearly.bebidas.json'), 'utf-8')
  );

  const beverages = rawData.map((item) => ({
    sku: item.sku,
    name: item.name,
    description: item.description?.trim() ?? '',
    // categoryName se calcula automáticamente desde el SKU en el pre-save hook
    stock: item.stock ?? item.stockInitial ?? 0,
    stockUnit: item.stockUnit ?? 'u',
    stockUnitName: item.stockUnitName ?? 'unidad',
    reorderPoint: item.reorderPoint ?? 0,
    allergens: item.allergens ?? [],
    codeArticlePurchase: item.codeArticlePurchase ?? ''
  }));

  await connectDatabase(mongoUri);

  const operations = beverages.map((beverage) => ({
    updateOne: {
      filter: { $or: [{ sku: beverage.sku }, { name: beverage.name }] },
      update: { $set: beverage },
      upsert: true
    }
  }));

  const result = await Beverage.bulkWrite(operations);
  console.log('Beverage seed completed', { inserted: result.upsertedCount ?? 0, modified: result.modifiedCount ?? 0 });
  process.exit(0);
};

seed().catch((error) => {
  console.error('Beverage seed failed', error);
  process.exit(1);
});
