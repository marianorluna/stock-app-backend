import asyncHandler from 'express-async-handler';
import Beverage from '../models/Beverage.js';

// Obtiene la lista de bebidas ordenada por nombre
export const listBeverages = asyncHandler(async (req, res) => {
  const beverages = await Beverage.find().sort({ name: 1 });
  res.json(beverages);
});

// Crea una nueva bebida
export const createBeverage = asyncHandler(async (req, res) => {
  const beverage = await Beverage.create(req.body);
  res.status(201).json(beverage);
});

// Actualiza una bebida existente
export const updateBeverage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const beverage = await Beverage.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!beverage) {
    res.status(404);
    throw new Error('Beverage not found');
  }
  res.json(beverage);
});

// Elimina una bebida
export const deleteBeverage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const beverage = await Beverage.findByIdAndDelete(id);
  if (!beverage) {
    res.status(404);
    throw new Error('Beverage not found');
  }
  res.status(204).end();
});
