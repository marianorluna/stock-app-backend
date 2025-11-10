import asyncHandler from 'express-async-handler';
import Ingredient from '../models/Ingredient.js';

export const getStockSnapshot = asyncHandler(async (req, res) => {
  const ingredients = await Ingredient.find().sort({ name: 1 });
  const inventory = ingredients.map(ingredient => {
    const isBulk = ingredient.category === 'ingredient';
    const unit = isBulk ? 'g' : ingredient.productUnit ?? ingredient.purchaseUnit ?? 'u';
    return {
      id: ingredient._id,
      name: ingredient.name,
      category: ingredient.category,
      stock: ingredient.stock,
      reorderPoint: ingredient.reorderPoint,
      unit
    };
  });

  const categories = ['ingredient', 'beverage', 'coffee'];
  const categoryTotals = categories.reduce((acc, category) => {
    const items = inventory.filter(item => item.category === category);
    const lowStockCount = items.filter(item => item.stock <= item.reorderPoint).length;
    acc[category] = {
      total: items.length,
      lowStock: lowStockCount
    };
    return acc;
  }, {});

  res.json({
    generatedAt: new Date(),
    inventory,
    lowStock: inventory.filter(item => item.stock <= item.reorderPoint),
    categoryTotals
  });
});

