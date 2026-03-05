import asyncHandler from 'express-async-handler';
import Ingredient from '../models/Ingredient.js';
import logger from '../config/logger.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import { createNotificationForAdminsAndManagers } from '../services/notificationService.js';

//obtiene la lista de ingredientes ordenada por nombre
export const listIngredients = asyncHandler(async (req, res) => {
  const ingredients = await Ingredient.find().sort({ name: 1 });
  res.json(ingredients);
});

//crea un nuevo ingrediente
export const createIngredient = asyncHandler(async (req, res) => {
  try {
    logger.info('Creating ingredient', { body: req.body });
    
    // Validar que pesoUnitarioGramos no sea 0
    if (req.body.pesoUnitarioGramos === 0 || !req.body.pesoUnitarioGramos) {
      req.body.pesoUnitarioGramos = 1000;
    }
    
    const ingredient = await Ingredient.create(req.body);
    logger.info('Ingredient created successfully', { id: ingredient._id, sku: ingredient.sku });
    
    // Emitir evento para notificar creación (actualización en tiempo real)
    eventBus.emit(EVENT_TYPES.INGREDIENT_UPDATED, ingredient);
    
    // Crear notificación para admins y managers
    try {
      const notification = {
        title: 'Nuevo Ingrediente Creado',
        message: `Se creó el ingrediente "${ingredient.name}" (SKU: ${ingredient.sku})`,
        type: 'info',
        data: {
          ingredientId: ingredient._id.toString(),
          ingredientName: ingredient.name,
          ingredientSku: ingredient.sku,
          action: 'created',
          createdBy: req.user?.id || req.user?._id?.toString(),
        },
      };

      const savedNotifications = await createNotificationForAdminsAndManagers(notification);
      
      // Enviar notificaciones vía WebSocket
      if (savedNotifications && savedNotifications.length > 0) {
        const sendNotificationToUser = global.sendNotificationToUser;
        if (typeof sendNotificationToUser === 'function') {
          savedNotifications.forEach((savedNotif) => {
            const userId = savedNotif.userId.toString();
            sendNotificationToUser(userId, {
              title: savedNotif.title,
              message: savedNotif.message,
              type: savedNotif.type,
              data: savedNotif.data,
            });
          });
        }
      }
    } catch (notifError) {
      logger.error('Error creando notificación de ingrediente:', notifError);
      // No fallar la operación si la notificación falla
    }
    
    res.status(201).json(ingredient);
  } catch (error) {
    logger.error('Error creating ingredient', { 
      error: error.message, 
      stack: error.stack,
      body: req.body,
      errorName: error.name,
      errorCode: error.code
    });
    
    // Si es un error de validación de Mongoose, devolver detalles
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json({
        message: 'Validation error',
        errors
      });
    }
    
    // Si es un error de duplicado
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        message: `${field} already exists`,
        field
      });
    }
    
    // Re-lanzar el error para que el errorMiddleware lo maneje
    throw error;
  }
});

//actualiza un ingrediente existente
export const updateIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ingredient = await Ingredient.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!ingredient) {
    res.status(404);
    throw new Error('Ingredient not found');
  }
  
  // Emitir evento para notificar cambio de stock (actualización en tiempo real)
  eventBus.emit(EVENT_TYPES.INGREDIENT_UPDATED, ingredient);
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Ingrediente Actualizado',
      message: `Se actualizó el ingrediente "${ingredient.name}" (SKU: ${ingredient.sku})`,
      type: 'info',
      data: {
        ingredientId: ingredient._id.toString(),
        ingredientName: ingredient.name,
        ingredientSku: ingredient.sku,
        action: 'updated',
        updatedBy: req.user?.id || req.user?._id?.toString(),
      },
    };

    const savedNotifications = await createNotificationForAdminsAndManagers(notification);
    
    // Enviar notificaciones vía WebSocket
    if (savedNotifications && savedNotifications.length > 0) {
      const sendNotificationToUser = global.sendNotificationToUser;
      if (typeof sendNotificationToUser === 'function') {
        savedNotifications.forEach((savedNotif) => {
          const userId = savedNotif.userId.toString();
          sendNotificationToUser(userId, {
            title: savedNotif.title,
            message: savedNotif.message,
            type: savedNotif.type,
            data: savedNotif.data,
          });
        });
      }
    }
  } catch (notifError) {
    logger.error('Error creando notificación de ingrediente:', notifError);
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
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Ingrediente Eliminado',
      message: `Se eliminó el ingrediente "${ingredient.name}" (SKU: ${ingredient.sku})`,
      type: 'warning',
      data: {
        ingredientId: id,
        ingredientName: ingredient.name,
        ingredientSku: ingredient.sku,
        action: 'deleted',
        deletedBy: req.user?.id || req.user?._id?.toString(),
      },
    };

    const savedNotifications = await createNotificationForAdminsAndManagers(notification);
    
    // Enviar notificaciones vía WebSocket
    if (savedNotifications && savedNotifications.length > 0) {
      const sendNotificationToUser = global.sendNotificationToUser;
      if (typeof sendNotificationToUser === 'function') {
        savedNotifications.forEach((savedNotif) => {
          const userId = savedNotif.userId.toString();
          sendNotificationToUser(userId, {
            title: savedNotif.title,
            message: savedNotif.message,
            type: savedNotif.type,
            data: savedNotif.data,
          });
        });
      }
    }
  } catch (notifError) {
    logger.error('Error creando notificación de ingrediente:', notifError);
  }
  
  res.status(204).end();
});

