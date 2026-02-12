import asyncHandler from 'express-async-handler';
import Dish from '../models/Dish.js';

//obtiene la lista de platos con sus recetas pobladas
export const listDishes = asyncHandler(async (req, res) => {
  const dishes = await Dish.find().populate('recipe.ingredient').sort({ name: 1 });
  res.json(dishes);
});

//crea un nuevo plato/receta
export const createDish = asyncHandler(async (req, res) => {
  const dish = await Dish.create(req.body);
  res.status(201).json(dish);
});

//actualiza un plato existente
export const updateDish = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const dish = await Dish.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!dish) {
    res.status(404);
    throw new Error('Dish not found');
  }
  res.json(dish);
});

//elimina un plato
export const deleteDish = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const dish = await Dish.findByIdAndDelete(id);
  if (!dish) {
    res.status(404);
    throw new Error('Dish not found');
  }
  res.status(204).end();
});

