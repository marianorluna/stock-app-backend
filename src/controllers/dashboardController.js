import asyncHandler from 'express-async-handler';
import Ingredient from '../models/Ingredient.js';
import Beverage from '../models/Beverage.js';

// Categorías de ingredientes (no bebidas)
const INGREDIENT_CATEGORY_NAMES = [
  'Condimentos', 'Frutas', 'Cereales', 'Lacteos', 'Proteinas',
  'Vegetales', 'Aceites', 'Frutos secos', 'Gases', 'Dulces', 'Cafe', 'Bebidas'
];

// Categorías de bebidas
const BEVERAGE_CATEGORY_NAMES = ['Bebidas', 'Copa de vino', 'Bebida premium', 'Botella'];

// Obtiene el snapshot del inventario con categorías y productos con stock bajo
export const getStockSnapshot = asyncHandler(async (req, res) => {
  const [ingredients, beverages] = await Promise.all([
    Ingredient.find().sort({ name: 1 }),
    Beverage.find().sort({ name: 1 })
  ]);

  const ingredientItems = ingredients.map(ingredient => ({
    id: ingredient._id,
    name: ingredient.name,
    categoryName: ingredient.categoryName,
    itemType: 'ingredient',
    stock: ingredient.stock,
    reorderPoint: ingredient.reorderPoint,
    unit: 'g'
  }));

  const beverageItems = beverages.map(beverage => ({
    id: beverage._id,
    name: beverage.name,
    categoryName: beverage.categoryName,
    itemType: 'beverage',
    stock: beverage.stock,
    reorderPoint: beverage.reorderPoint,
    unit: 'ml'
  }));

  const inventory = [...ingredientItems, ...beverageItems];

  const categoryTotals = {
    ingredient: {
      total: ingredientItems.length,
      lowStock: ingredientItems.filter(item => item.stock <= item.reorderPoint).length
    },
    beverage: {
      total: beverageItems.length,
      lowStock: beverageItems.filter(item => item.stock <= item.reorderPoint).length
    }
  };

  res.json({
    generatedAt: new Date(),
    inventory,
    lowStock: inventory.filter(item => item.stock <= item.reorderPoint),
    categoryTotals
  });
});
