import asyncHandler from 'express-async-handler';
import Dish from '../models/Dish.js';
import { createNotificationForAdminsAndManagers } from '../services/notificationService.js';
import logger from '../config/logger.js';

//obtiene la lista de platos con sus recetas pobladas
export const listDishes = asyncHandler(async (req, res) => {
  const dishes = await Dish.find().populate('recipe.ingredient').sort({ name: 1 });
  res.json(dishes);
});

//crea un nuevo plato/receta
export const createDish = asyncHandler(async (req, res) => {
  const dish = await Dish.create(req.body);
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Nueva Receta Creada',
      message: `Se creó la receta "${dish.name}" (SKU: ${dish.sku})`,
      type: 'info',
      data: {
        dishId: dish._id.toString(),
        dishName: dish.name,
        dishSku: dish.sku,
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
    logger.error('Error creando notificación de receta:', notifError);
  }
  
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
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Receta Actualizada',
      message: `Se actualizó la receta "${dish.name}" (SKU: ${dish.sku})`,
      type: 'info',
      data: {
        dishId: dish._id.toString(),
        dishName: dish.name,
        dishSku: dish.sku,
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
    logger.error('Error creando notificación de receta:', notifError);
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
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Receta Eliminada',
      message: `Se eliminó la receta "${dish.name}" (SKU: ${dish.sku})`,
      type: 'warning',
      data: {
        dishId: id,
        dishName: dish.name,
        dishSku: dish.sku,
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
    logger.error('Error creando notificación de receta:', notifError);
  }
  
  res.status(204).end();
});

