import asyncHandler from 'express-async-handler';
import Ingredient from '../models/Ingredient.js';

//obtiene el snapshot del inventario con categorías y productos con stock bajo
export const getStockSnapshot = asyncHandler(async (req, res) => {
  const ingredients = await Ingredient.find().sort({ name: 1 });
  const inventory = ingredients.map(ingredient => {
    // Categorías que tradicionalmente usan gramos
    const isBulkCategory = ['condimentos', 'frutas', 'cereales', 'lacteos', 'otros', 'proteinas', 'vegetales'].includes(ingredient.category);
    const unit = isBulkCategory && ingredient.stockUnit === 'g' ? 'g' : ingredient.stockUnit ?? ingredient.productUnit ?? 'u';
    return {
      id: ingredient._id,
      name: ingredient.name,
      category: ingredient.category,
      stock: ingredient.stock,
      reorderPoint: ingredient.reorderPoint,
      unit
    };
  });

  // Mapear categorías nuevas a categorías antiguas para compatibilidad con frontend
  const categoryMapping = {
    'bebida': 'beverage',
    'cafe': 'coffee',
    'condimentos': 'ingredient',
    'frutas': 'ingredient',
    'cereales': 'ingredient',
    'lacteos': 'ingredient',
    'otros': 'ingredient',
    'proteinas': 'ingredient',
    'vegetales': 'ingredient'
  };

  const categories = ['ingredient', 'beverage', 'coffee'];
  const categoryTotals = categories.reduce((acc, oldCategory) => {
    const items = inventory.filter(item => {
      const mappedCategory = categoryMapping[item.category] || 'ingredient';
      return mappedCategory === oldCategory;
    });
    const lowStockCount = items.filter(item => item.stock <= item.reorderPoint).length;
    acc[oldCategory] = {
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

