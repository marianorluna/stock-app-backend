import http from 'node:http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import createApp from './app.js';
import connectDatabase from './config/database.js';
import logger from './config/logger.js';
import { initializeFirebase } from './config/firebase.js';
import eventBus, { EVENT_TYPES } from './core/eventBus.js';
import { createNotificationForAdminsAndManagers } from './services/notificationService.js';
import { initScheduler } from './services/schedulerService.js';
import './subscribers/inventorySubscriber.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const getDatabaseUri = () => {
  if (NODE_ENV === 'production') {
    return process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI;
  }

  return process.env.MONGODB_URI;
};
const MONGODB_URI = getDatabaseUri();

//inicializa la conexión a la base de datos, crea el servidor http y configura websocket
const bootstrap = async () => {
  if (!MONGODB_URI) {
    logger.error('Database URI is not configured', { NODE_ENV });
    process.exit(1);
  }

  await connectDatabase(MONGODB_URI);

  //inicializar Firebase Admin SDK
  initializeFirebase();

  const app = createApp();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN?.split(',') ?? '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info('Client connected to WebSocket', { socketId: socket.id });

    // Unirse a la sala del usuario
    socket.on('join:user', ({ userId }) => {
      socket.join(`user:${userId}`);
      logger.info(`Usuario ${userId} se unió a su sala`, { socketId: socket.id });
    });

    // Desconexión
    socket.on('disconnect', () => {
      logger.info('Client disconnected from WebSocket', { socketId: socket.id });
    });
  });

  // Función helper para enviar notificaciones vía WebSocket
  const sendNotificationToUser = (userId, notification) => {
    io.to(`user:${userId}`).emit('notification', notification);
  };

  // Función helper para enviar notificaciones a todos
  const broadcastNotification = (notification) => {
    io.emit('notification', notification);
  };

  // Exportar funciones para uso en otros módulos
  global.io = io;
  global.sendNotificationToUser = sendNotificationToUser;
  global.broadcastNotification = broadcastNotification;

  eventBus.on(EVENT_TYPES.SALE_RECORDED, async (sale) => {
    io.emit('inventory:sale', sale);

    // Si el evento es de eliminación, no crear notificación de "nueva venta"
    if (sale.deleted) return;

    // Guardar notificación en BD para admins y managers
    try {
      const notification = {
        title: 'Nueva Venta Registrada',
        message: `Se registró una venta de ${sale.lines?.length || 0} items`,
        type: 'sale',
        data: {
          saleId: sale._id?.toString() || sale.id,
          linesCount: sale.lines?.length || 0,
          sale: sale,
        },
      };

      const savedNotifications = await createNotificationForAdminsAndManagers(notification);
      logger.info('Notificación de venta guardada en BD');

      // Enviar notificaciones vía WebSocket a los usuarios que las recibieron
      if (savedNotifications && savedNotifications.length > 0) {
        savedNotifications.forEach((savedNotif) => {
          const userId = savedNotif.userId.toString();
          sendNotificationToUser(userId, {
            title: savedNotif.title,
            message: savedNotif.message,
            type: savedNotif.type === 'sale' ? 'success' : savedNotif.type,
            data: savedNotif.data,
          });
        });
        logger.info(`Notificaciones WebSocket enviadas a ${savedNotifications.length} usuarios`);
      }
    } catch (error) {
      logger.error('Error guardando notificación de venta en BD:', error);
    }
  });

  eventBus.on(EVENT_TYPES.PURCHASE_RECORDED, async (purchase) => {
    io.emit('inventory:purchase', purchase);

    // Guardar notificación en BD para admins y managers
    try {
      const notification = {
        title: 'Nueva Compra Registrada',
        message: `Se registró una compra de ${purchase.items?.length || 0} items`,
        type: 'purchase',
        data: {
          purchaseId: purchase._id?.toString() || purchase.id,
          itemsCount: purchase.items?.length || 0,
          purchase: purchase,
        },
      };

      const savedNotifications = await createNotificationForAdminsAndManagers(notification);
      logger.info('Notificación de compra guardada en BD');

      // Enviar notificaciones vía WebSocket a los usuarios que las recibieron
      if (savedNotifications && savedNotifications.length > 0) {
        savedNotifications.forEach((savedNotif) => {
          const userId = savedNotif.userId.toString();
          sendNotificationToUser(userId, {
            title: savedNotif.title,
            message: savedNotif.message,
            type: savedNotif.type === 'purchase' ? 'info' : savedNotif.type,
            data: savedNotif.data,
          });
        });
        logger.info(`Notificaciones WebSocket enviadas a ${savedNotifications.length} usuarios`);
      }
    } catch (error) {
      logger.error('Error guardando notificación de compra en BD:', error);
    }
  });

  eventBus.on(EVENT_TYPES.WASTAGE_RECORDED, async (wastage) => {
    // Ignorar eventos de eliminación
    if (wastage.deleted) {
      return;
    }

    io.emit('inventory:wastage', wastage);

    // Guardar notificación en BD para admins y managers
    try {
      // Poblar ingredientes y usuario que reportó para obtener sus nombres
      const Wastage = (await import('./models/Wastage.js')).default;
      const populatedWastage = await Wastage.findById(wastage._id || wastage.id)
        .populate('items.ingredient', 'name stockUnit')
        .populate('reportedBy', 'name')
        .lean();

      if (!populatedWastage || !populatedWastage.items || populatedWastage.items.length === 0) {
        return;
      }

      // Crear mensaje descriptivo con el ingrediente y motivo
      const item = populatedWastage.items[0];
      const ingredient = item.ingredient;
      const unit = ingredient?.stockUnit || 'g';
      const quantity = item.quantityInGrams;
      const ingredientName = ingredient?.name || 'Ingrediente desconocido';

      let message = `Merma de ${ingredientName}: ${quantity} ${unit}`;
      if (item.reason) {
        message += `. Motivo: ${item.reason}`;
      }

      const notification = {
        title: 'Merma Registrada',
        message: message,
        type: 'wastage',
        data: {
          wastageId: wastage._id?.toString() || wastage.id,
          itemsCount: populatedWastage.items.length,
          wastage: populatedWastage,
          reportedBy: populatedWastage.reportedBy ? {
            name: populatedWastage.reportedBy.name
          } : null,
        },
      };

      const savedNotifications = await createNotificationForAdminsAndManagers(notification);
      logger.info('Notificación de merma guardada en BD');

      // Enviar notificaciones vía WebSocket a los usuarios que las recibieron
      if (savedNotifications && savedNotifications.length > 0) {
        savedNotifications.forEach((savedNotif) => {
          const userId = savedNotif.userId.toString();
          sendNotificationToUser(userId, {
            title: savedNotif.title,
            message: savedNotif.message,
            type: savedNotif.type === 'wastage' ? 'warning' : savedNotif.type,
            data: savedNotif.data,
          });
        });
        logger.info(`Notificaciones WebSocket enviadas a ${savedNotifications.length} usuarios`);
      }
    } catch (error) {
      logger.error('Error guardando notificación de merma en BD:', error);
    }
  });

  // Eventos de actualización automática de stock (para bloquear operaciones manuales e informar al frontend)
  eventBus.on(EVENT_TYPES.STOCK_UPDATE_STARTED, () => {
    io.emit('stock_update_started');
    logger.info('WebSocket: Emitido stock_update_started');
  });

  eventBus.on(EVENT_TYPES.STOCK_UPDATE_COMPLETED, () => {
    io.emit('stock_update_completed');
    logger.info('WebSocket: Emitido stock_update_completed');
  });

  // Inicializar scheduler de tareas programadas (actualización diaria de stock)
  await initScheduler();

  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} ✅`);
  });
};

bootstrap().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

