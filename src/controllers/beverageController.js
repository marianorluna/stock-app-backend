import asyncHandler from 'express-async-handler';
import Beverage from '../models/Beverage.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import { createNotificationForAdminsAndManagers } from '../services/notificationService.js';
import logger from '../config/logger.js';

// Obtiene la lista de bebidas ordenada por nombre
export const listBeverages = asyncHandler(async (req, res) => {
  const beverages = await Beverage.find().sort({ name: 1 });
  res.json(beverages);
});

// Crea una nueva bebida
export const createBeverage = asyncHandler(async (req, res) => {
  const beverage = await Beverage.create(req.body);
  
  // Emitir evento para notificar creación (actualización en tiempo real)
  eventBus.emit(EVENT_TYPES.BEVERAGE_UPDATED, beverage);
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Nueva Bebida Creada',
      message: `Se creó la bebida "${beverage.name}" (SKU: ${beverage.sku})`,
      type: 'info',
      data: {
        beverageId: beverage._id.toString(),
        beverageName: beverage.name,
        beverageSku: beverage.sku,
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
    logger.error('Error creando notificación de bebida:', notifError);
  }
  
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
  
  // Emitir evento para notificar cambio de stock (actualización en tiempo real)
  eventBus.emit(EVENT_TYPES.BEVERAGE_UPDATED, beverage);
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Bebida Actualizada',
      message: `Se actualizó la bebida "${beverage.name}" (SKU: ${beverage.sku})`,
      type: 'info',
      data: {
        beverageId: beverage._id.toString(),
        beverageName: beverage.name,
        beverageSku: beverage.sku,
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
    logger.error('Error creando notificación de bebida:', notifError);
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
  
  // Crear notificación para admins y managers
  try {
    const notification = {
      title: 'Bebida Eliminada',
      message: `Se eliminó la bebida "${beverage.name}" (SKU: ${beverage.sku})`,
      type: 'warning',
      data: {
        beverageId: id,
        beverageName: beverage.name,
        beverageSku: beverage.sku,
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
    logger.error('Error creando notificación de bebida:', notifError);
  }
  
  res.status(204).end();
});
