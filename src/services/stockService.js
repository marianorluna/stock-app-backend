import Ingredient from '../models/Ingredient.js';
import Dish from '../models/Dish.js';
import logger from '../config/logger.js';

const applySaleToStock = async (sale) => {
  const dishIds = sale.lines.map(line => line.dish);
  const dishes = await Dish.find({ _id: { $in: dishIds } }).populate('recipe.ingredient');

  const updates = [];

  dishes.forEach(dish => {
    const saleLine = sale.lines.find(line => line.dish.toString() === dish._id.toString());
    if (!saleLine) return;

    dish.recipe.forEach(recipeItem => {
      const totalQuantity = recipeItem.quantityInGrams * saleLine.quantity;
      updates.push({
        ingredientId: recipeItem.ingredient._id,
        delta: -totalQuantity
      });
    });
  });

  await commitStockUpdates(updates, { context: 'sale', referenceId: sale._id });
};

const applyPurchaseToStock = async (purchase) => {
  const updates = purchase.items.map(item => ({
    ingredientId: item.ingredient,
    delta: item.quantityInGrams
  }));
  await commitStockUpdates(updates, { context: 'purchase', referenceId: purchase._id });
};

const applyWastageToStock = async (wastage) => {
  const updates = wastage.items.map(item => ({
    ingredientId: item.ingredient,
    delta: -Math.abs(item.quantityInGrams)
  }));
  await commitStockUpdates(updates, { context: 'wastage', referenceId: wastage._id });
};

const revertWastageFromStock = async (wastage) => {
  const updates = wastage.items.map(item => ({
    ingredientId: item.ingredient,
    delta: Math.abs(item.quantityInGrams)
  }));
  await commitStockUpdates(updates, { context: 'wastage-revert', referenceId: wastage._id });
};

const commitStockUpdates = async (updates, metadata) => {
  if (!updates.length) return;

  const ingredientIds = [...new Set(updates.map(update => update.ingredientId.toString()))];
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } }).lean();
  const ingredientMap = new Map(ingredients.map(ingredient => [ingredient._id.toString(), ingredient]));

  const bulkOperations = updates.map(update => {
    const ingredient = ingredientMap.get(update.ingredientId.toString());
    if (!ingredient) {
      return null;
    }

    return {
      updateOne: {
        filter: { _id: update.ingredientId },
        update: { $inc: { stock: update.delta } }
      }
    };
  }).filter(Boolean);

  if (!bulkOperations.length) return;

  const result = await Ingredient.bulkWrite(bulkOperations);
  logger.info('Stock updated', { result, ...metadata });

  return result;
};

const stockService = {
  applySaleToStock,
  applyPurchaseToStock,
  applyWastageToStock,
  revertWastageFromStock
};

export default stockService;

