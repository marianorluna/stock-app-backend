/**
 * Script para poblar la base de datos con bebidas.
 * Lee desde stockearly.bebidas.json y las carga como ingredientes con category='bebida'.
 * Uso: node scripts/seedBeverages.js
 * Orden: seedRoles -> seedIngredients -> seedBeverages -> seedMenu -> seedSuppliers -> seedEvents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDatabase from '../../src/config/database.js';
import Ingredient from '../../src/models/Ingredient.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mapeo de categoryName a category para bebidas
const mapBeverageCategoryNameToCategory = (categoryName) => {
  if (!categoryName) return 'bebida';
  
  // Todas las bebidas van a category 'bebida' independientemente de su categoryName
  // (Bebidas, Copa de vino, Bebida Premium, Botella)
  return 'bebida';
};

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

  const beverages = rawData.map((item) => {
    return {
      sku: item.sku,
      name: item.name,
      stock: item.stock ?? item.stockInitial ?? 0,
      stockUnit: item.stockUnit ?? 'u',
      purchaseUnit: item.purchaseUnit?.trim() ?? 'unidad',
      conversionFactor: item.conversionFactor ?? 1,
      conversionUnit: item.conversionUnit ?? 'u',
      reorderPoint: item.reorderPoint ?? 0,
      category: mapBeverageCategoryNameToCategory(item.categoryName),
      allergens: item.allergens ?? [],
      codeArticlePurchase: item.codeArticlePurchase ?? ''
    };
  });

  await connectDatabase(mongoUri);

  const operations = beverages.map((beverage) => ({
    updateOne: {
      filter: { $or: [{ sku: beverage.sku }, { name: beverage.name }] },
      update: { $set: beverage },
      upsert: true
    }
  }));

  const result = await Ingredient.bulkWrite(operations);
  console.log('Beverage seed completed', { inserted: result.upsertedCount ?? 0, modified: result.modifiedCount ?? 0 });
  process.exit(0);
};

seed().catch((error) => {
  console.error('Beverage seed failed', error);
  process.exit(1);
});
