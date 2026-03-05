/**
 * Script para poblar la base de datos con ingredientes.
 * Lee desde stockearly.ingredients-NEW.json
 * Uso: node scripts/seeds/seedIngredients.js
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

  const ingredients = rawData.map((item) => ({
    sku: item.sku,
    name: item.name,
    description: item.description?.trim() ?? '',
    categoryName: item.categoryName ?? '',
    stock: item.stock ?? item.stockInitial ?? 0,
    stockUnit: 'g',
    stockUnitName: item.stockUnitName ?? 'gramo',
    factorMermaNat: item.factorMermaNat ?? 0,
    reorderPoint: item.reorderPoint ?? 0,
    allergens: item.allergens ?? [],
    codeArticlePurchase: item.codeArticlePurchase ?? '',
    pesoUnitarioGramos: item.pesoUnitarioGramos ?? 0,
    stockMerma: item.stockMerma ?? 0
  }));

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
