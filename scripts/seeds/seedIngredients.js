/**
 * Script para poblar la base de datos con ingredientes.
 * Lee desde stockearly.ingredients.json
 * Uso: node scripts/seedIngredients.js
 * Orden: seedRoles -> seedIngredients -> seedMenu -> seedSuppliers -> seedEvents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDatabase from '../../src/config/database.js';
import Ingredient from '../../src/models/Ingredient.js';

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
    readFileSync(join(__dirname, 'stockearly.ingredients.json'), 'utf-8')
  );

  const ingredients = rawData.map((item) => {
    return {
      sku: item.sku,
      name: item.name,
      stock: item.stock ?? 0,
      stockUnit: item.stockUnit ?? 'g',
      purchaseUnit: item.purchaseUnit?.trim() ?? 'unidad',
      conversionFactor: item.conversionFactor ?? 1,
      conversionUnit: item.conversionUnit ?? 'g',
      reorderPoint: item.reorderPoint ?? 0,
      category: item.category ?? 'otros',
      allergens: item.allergens ?? [],
      codeArticlePurchase: item.codeArticlePurchase ?? ''
    };
  });

  await connectDatabase(mongoUri);

  const operations = ingredients.map((ingredient) => ({
    updateOne: {
      filter: { $or: [{ sku: ingredient.sku }, { name: ingredient.name }] },
      update: { $set: ingredient },
      upsert: true
    }
  }));

  const result = await Ingredient.bulkWrite(operations);
  console.log('Ingredient seed completed', { inserted: result.upsertedCount ?? 0, modified: result.modifiedCount ?? 0 });
  process.exit(0);
};

seed().catch((error) => {
  console.error('Ingredient seed failed', error);
  process.exit(1);
});
