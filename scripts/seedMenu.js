/**
 * Script para poblar la base de datos con platos y bebidas.
 * Lee desde stockcontrol.dishes.json, vincula ingredientes por SKU.
 * Uso: node scripts/seedMenu.js
 * Orden: seedRoles -> seedIngredients -> seedMenu -> seedSuppliers -> seedEvents
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDatabase from '../src/config/database.js';
import Dish from '../src/models/Dish.js';
import Ingredient from '../src/models/Ingredient.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const seed = async () => {
  const mongoUri = process.env.NODE_ENV === 'production'
    ? (process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI)
    : process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI is not defined in environment variables');
  }

  const rawDishes = JSON.parse(
    readFileSync(join(__dirname, 'stockcontrol.dishes.json'), 'utf-8')
  );

  await connectDatabase(mongoUri);

  const ingredientDocs = await Ingredient.find().lean();
  const ingredientBySku = new Map(ingredientDocs.map((i) => [i.sku, i]));

  const findIngredientBySku = (sku) => {
    const doc = ingredientBySku.get(sku);
    if (!doc) throw new Error(`Ingredient not found for SKU: ${sku}`);
    return doc;
  };

  const resolveRecipe = (recipeItems) => {
    if (!recipeItems || !recipeItems.length) return [];
    return recipeItems.map((item) => {
      const sku = item.sku;
      const ingredientDoc = findIngredientBySku(sku);
      
      // Si item.grams está definido, usarlo directamente (ya está en gramos)
      // Si no, calcular basándose en el nuevo formato de ingredientes
      let quantityInGrams;
      
      if (item.grams !== undefined) {
        // Ya está en gramos, usar directamente
        quantityInGrams = item.grams;
      } else {
        // Calcular conversionFactorToGrams manualmente ya que .lean() no incluye virtuals
        // El conversionFactor representa cuántas unidades de conversionUnit hay en 1 unidad de purchaseUnit
        // Para convertir a gramos, necesitamos considerar stockUnit y conversionUnit
        let conversionFactorToGrams = 1;
        
        if (ingredientDoc.conversionFactor) {
          if (ingredientDoc.conversionUnit === 'g') {
            // Si conversionUnit es 'g', el factor ya está en gramos
            conversionFactorToGrams = ingredientDoc.conversionFactor;
          } else if (ingredientDoc.conversionUnit === 'ml') {
            // Para ml, asumimos 1ml ≈ 1g para la mayoría de líquidos
            conversionFactorToGrams = ingredientDoc.conversionFactor;
          } else {
            // Para 'u' (unidades), el factor representa unidades por unidad de compra
            // Si el stockUnit es 'g', necesitamos un valor por defecto razonable
            // Por ahora usamos el factor directamente
            conversionFactorToGrams = ingredientDoc.conversionFactor;
          }
        }
        
        quantityInGrams = conversionFactorToGrams;
      }
      
      return {
        ingredient: ingredientDoc._id,
        quantityInGrams
      };
    });
  };

  const dishesPayload = rawDishes.map((dish) => {
    const rawRecipe = dish.recipe && dish.recipe.length ? dish.recipe : [];
    return {
      sku: dish.sku,
      name: dish.name,
      description: dish.description ?? '',
      price: dish.price,
      type: dish.type ?? 'dish',
      recipe: resolveRecipe(rawRecipe),
      isActive: dish.isActive ?? true
    };
  });

  const operations = dishesPayload.map((dish) => ({
    updateOne: {
      filter: { $or: [{ sku: dish.sku }, { name: dish.name }] },
      update: { $set: dish },
      upsert: true
    }
  }));

  const result = await Dish.bulkWrite(operations);
  console.log('Menu seed completed', { inserted: result.upsertedCount ?? 0, modified: result.modifiedCount ?? 0 });
  process.exit(0);
};

seed().catch((error) => {
  console.error('Menu seed failed', error);
  process.exit(1);
});
