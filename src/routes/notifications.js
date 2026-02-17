import express from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import Notification from '../models/Notification.js';
import UserSubscription from '../models/UserSubscription.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { sendPushNotification } from '../services/pushService.js';
import logger from '../config/logger.js';

const router = express.Router();

// Suscribirse a notificaciones push
router.post(
  '/subscribe',
  authenticate,
  asyncHandler(async (req, res) => {
    const { subscription } = req.body;
    const userId = req.user.id; // Usar el userId del usuario autenticado

    if (!subscription) {
      return res.status(400).json({
        message: 'Subscription es requerida',
      });
    }

    // Guardar o actualizar suscripción en la base de datos
    const subscriptionData = {
      userId,
      subscription,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth,
      },
    };

    const result = await UserSubscription.findOneAndUpdate(
      { userId, endpoint: subscription.endpoint },
      subscriptionData,
      { upsert: true, new: true }
    );

    logger.info('Suscripción push registrada', {
      userId,
      endpoint: subscription.endpoint,
      isNew: !result._id || result.createdAt === result.updatedAt,
    });

    res.json({
      message: 'Suscripción registrada exitosamente',
    });
  })
);

// Obtener notificaciones del usuario
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ notifications });
  })
);

// Obtener contador de notificaciones no leídas
router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const count = await Notification.countDocuments({ userId, read: false });

    res.json({ unreadCount: count });
  })
);

// Marcar notificación como leída
router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notificación no encontrada' });
    }

    res.json({ notification });
  })
);

// Marcar todas las notificaciones del usuario como leídas
router.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true }
    );

    res.json({ 
      message: 'Todas las notificaciones marcadas como leídas',
      updatedCount: result.modifiedCount
    });
  })
);

// Enviar notificación de prueba
router.post(
  '/test',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId, title, message } = req.body;

    // Enviar push notification
    await sendPushNotification(userId, {
      title: title || 'Notificación de Prueba',
      message: message || 'Esta es una notificación de prueba',
      data: { type: 'test' },
    });

    res.json({ message: 'Notificación enviada' });
  })
);

// Obtener notificaciones del usuario autenticado (solo admin y manager)
router.get(
  '/all',
  authenticate,
  authorize(['admin', 'manager']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { search, dateFrom, dateTo } = req.query;
    
    // Obtener todos los usuarios con rol admin o manager para mostrar todas sus notificaciones
    const adminRole = await Role.findOne({ name: 'admin' });
    const managerRole = await Role.findOne({ name: 'manager' });
    
    if (!adminRole || !managerRole) {
      logger.warn('Roles admin o manager no encontrados');
      return res.status(500).json({ message: 'Error en la configuración de roles' });
    }
    
    // Buscar todos los usuarios activos con rol admin o manager
    const adminAndManagerUsers = await User.find({
      role: { $in: [adminRole._id, managerRole._id] },
      isActive: true,
    }).select('_id').lean();
    
    const adminAndManagerUserIds = adminAndManagerUsers.map(u => u._id);
    
    // Construir query de búsqueda - notificaciones de todos los usuarios admin y manager
    const query = {
      userId: { $in: adminAndManagerUserIds }
    };
    
    // Búsqueda por palabra en título o mensaje
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtro por fecha
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Agregar un día completo para incluir el día seleccionado
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }
    
    // Log para debugging
    logger.debug('Consultando notificaciones', {
      userId,
      adminAndManagerUserIds: adminAndManagerUserIds.map(id => id.toString()),
      query,
      search,
      dateFrom,
      dateTo
    });
    
    // Obtener notificaciones sin populate primero para asegurar que todas se devuelvan
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    
    // Log para debugging
    logger.debug('Notificaciones encontradas', {
      count: notifications.length,
      types: [...new Set(notifications.map(n => n.type))],
      userIds: [...new Set(notifications.map(n => n.userId?.toString()))]
    });
    
    // Poblar userIds de forma segura
    const userIds = [...new Set(notifications.map(n => n.userId?.toString()).filter(Boolean))];
    let userMap = new Map();
    
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select('name email')
        .lean();
      userMap = new Map(users.map(u => [u._id.toString(), u]));
    }
    
    // Formatear notificaciones con userId poblado
    const formattedNotifications = notifications.map(notif => {
      const userIdStr = notif.userId?.toString();
      const user = userIdStr ? userMap.get(userIdStr) : null;
      
      return {
        ...notif,
        userId: user ? {
          _id: user._id.toString(),
          name: user.name,
          email: user.email
        } : null
      };
    });
    
    logger.debug('Notificaciones formateadas', {
      count: formattedNotifications.length,
      types: [...new Set(formattedNotifications.map(n => n.type))]
    });
    
    res.json({ notifications: formattedNotifications });
  })
);

// Eliminar todas las notificaciones leídas del usuario (solo admin y manager)
router.delete(
  '/read',
  authenticate,
  authorize(['admin', 'manager']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const result = await Notification.deleteMany({
      userId: userId,
      read: true
    });
    
    res.json({ 
      message: 'Notificaciones leídas eliminadas exitosamente',
      deletedCount: result.deletedCount
    });
  })
);

// Eliminar notificación (solo admin y manager, y solo sus propias notificaciones)
router.delete(
  '/:id',
  authenticate,
  authorize(['admin', 'manager']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await Notification.findOneAndDelete({
      _id: id,
      userId: userId
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notificación no encontrada o no tienes permiso para eliminarla' });
    }
    
    res.json({ message: 'Notificación eliminada exitosamente' });
  })
);

export default router;
