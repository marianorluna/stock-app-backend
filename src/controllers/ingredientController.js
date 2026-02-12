import asyncHandler from 'express-async-handler';
import Ingredient from '../models/Ingredient.js';

//obtiene la lista de ingredientes ordenada por nombre
export const listIngredients = asyncHandler(async (req, res) => {
  const ingredients = await Ingredient.find().sort({ name: 1 });
  res.json(ingredients);
});

//crea un nuevo ingrediente
export const createIngredient = asyncHandler(async (req, res) => {
  const ingredient = await Ingredient.create(req.body);
  res.status(201).json(ingredient);
});

//actualiza un ingrediente existente
export const updateIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ingredient = await Ingredient.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!ingredient) {
    res.status(404);
    throw new Error('Ingredient not found');
  }
  res.json(ingredient);
});

//elimina un ingrediente
export const deleteIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ingredient = await Ingredient.findByIdAndDelete(id);
  if (!ingredient) {
    res.status(404);
    throw new Error('Ingredient not found');
  }
  res.status(204).end();
});

