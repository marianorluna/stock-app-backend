/**
 * Script para poblar la base de datos con ingredientes.
 * Lee desde stockcontrol.ingredients.json
 * Uso: node scripts/seedIngredients.js
 * Orden: seedRoles -> seedIngredients -> seedMenu -> seedSuppliers -> seedEvents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Ingredient from '../src/models/Ingredient.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const deriveProductUnit = (category, purchaseUnit) => {
  const normalizedPurchaseUnit = purchaseUnit?.trim().toLowerCase() ?? '';
  if (normalizedPurchaseUnit.includes('kg') || normalizedPurchaseUnit.includes('g')) return 'g';
  if (normalizedPurchaseUnit.includes('ml') || normalizedPurchaseUnit.endsWith('l') || normalizedPurchaseUnit.includes('litro')) return 'ml';
  if (normalizedPurchaseUnit.includes('unidad') || normalizedPurchaseUnit.includes('unidades')) return 'unidad';
  if (normalizedPurchaseUnit.includes('botella')) return 'botella';
  if (normalizedPurchaseUnit.includes('lata')) return 'lata';
  if (normalizedPurchaseUnit.includes('vaso')) return 'vaso';
  if (normalizedPurchaseUnit.includes('bloque') || normalizedPurchaseUnit.includes('pechuga') || normalizedPurchaseUnit.includes('caja') || normalizedPurchaseUnit.includes('bandeja') || normalizedPurchaseUnit.includes('bolsa') || normalizedPurchaseUnit.includes('paquete')) return 'unidad';
  if (normalizedPurchaseUnit.length === 0) return 'g';
  return purchaseUnit.trim();
};

const seed = async () => {
  const mongoUri = process.env.NODE_ENV === 'production'
    ? (process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI)
    : process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI is not defined in environment variables');
  }

  const rawData = JSON.parse(
    readFileSync(join(__dirname, 'stockcontrol.ingredients.json'), 'utf-8')
  );

  const ingredients = rawData.map((item) => {
    const category = item.category ?? 'ingredient';
    const purchaseUnit = item.purchaseUnit?.trim() ?? 'unidad';
    const productUnit = deriveProductUnit(category, purchaseUnit);
    return {
      sku: item.sku,
      name: item.name,
      stock: item.stockInGrams ?? item.stock ?? 0,
      reorderPoint: item.reorderPointInGrams ?? item.reorderPoint ?? 0,
      purchaseUnit,
      productUnit,
      conversionFactorToGrams: item.conversionFactorToGrams ?? 1,
      category,
      allergens: item.allergens ?? []
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
