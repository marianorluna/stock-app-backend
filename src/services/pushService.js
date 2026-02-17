import webpush from 'web-push';
import logger from '../config/logger.js';
import UserSubscription from '../models/UserSubscription.js';

// Función para obtener las claves VAPID (lazy loading)
let vapidConfigured = false;
const getVapidKeys = () => {
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@stockearly.com';

  // Configurar VAPID solo una vez
  if (!vapidConfigured && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    logger.info('VAPID keys configuradas correctamente');
  } else if (!vapidConfigured && (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)) {
    logger.warn('VAPID keys no configuradas. Las notificaciones push no funcionarán.');
    vapidConfigured = true; // Marcar como configurado para no mostrar el warning repetidamente
  }

  return { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT };
};

/**
 * Envía una notificación push a un usuario
 * @param {string} userId - ID del usuario
 * @param {object} payload - Datos de la notificación
 */
export const sendPushNotification = async (userId, payload) => {
  try {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = getVapidKeys();
    
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      logger.warn('VAPID keys no configuradas, saltando push notification');
      return;
    }

    // Obtener las suscripciones del usuario desde la BD
    // Asegurarse de que userId sea un ObjectId o string válido
    const subscriptions = await UserSubscription.find({ userId });

    logger.debug(`Suscripciones encontradas para usuario ${userId}:`, { count: subscriptions.length });

    if (subscriptions.length === 0) {
      logger.warn(`No hay suscripciones push para el usuario ${userId}. El usuario debe suscribirse primero desde el frontend.`);
      return;
    }

    const notificationPayload = JSON.stringify({
      title: payload.title || 'Stockearly',
      message: payload.message || 'Tienes una nueva notificación',
      icon: payload.icon || '/logo-stockearly.png',
      badge: payload.badge || '/logo-stockearly.png',
      tag: payload.tag || payload.id || 'stockearly-notification',
      data: payload.data || {},
    });

    const promises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          subscription.subscription,
          notificationPayload
        );
        logger.info(`Push notification enviada a usuario ${userId}`);
      } catch (error) {
        logger.error(`Error enviando push notification:`, error);

        // Si la suscripción es inválida, eliminarla
        if (error.statusCode === 410 || error.statusCode === 404) {
          await UserSubscription.deleteOne({ _id: subscription._id });
          logger.warn(`Suscripción inválida eliminada: ${subscription._id}`);
        }
      }
    });

    await Promise.allSettled(promises);
  } catch (error) {
    logger.error('Error en sendPushNotification:', error);
    throw error;
  }
};

/**
 * Envía notificación push a múltiples usuarios
 */
export const sendPushNotificationToUsers = async (userIds, payload) => {
  const promises = userIds.map((userId) => sendPushNotification(userId, payload));
  await Promise.allSettled(promises);
};

/**
 * Envía notificación push a todos los usuarios con un rol específico
 */
export const sendPushNotificationToRole = async (roleName, payload) => {
  try {
    logger.info(`Buscando usuarios con rol ${roleName} para enviar notificación push`);
    
    const User = (await import('../models/User.js')).default;
    const Role = (await import('../models/Role.js')).default;

    // Buscar el rol
    const role = await Role.findOne({ name: roleName });
    if (!role) {
      logger.warn(`Rol ${roleName} no encontrado`);
      return;
    }

    logger.info(`Rol ${roleName} encontrado`, { roleId: role._id });

    // Buscar todos los usuarios con ese rol
    const users = await User.find({ role: role._id, isActive: true });
    const userIds = users.map((user) => user._id.toString());

    logger.info(`Usuarios con rol ${roleName} encontrados`, { 
      count: userIds.length,
      userIds: userIds 
    });

    if (userIds.length === 0) {
      logger.warn(`No hay usuarios activos con el rol ${roleName}`);
      return;
    }

    // Verificar suscripciones antes de enviar
    const totalSubscriptions = await UserSubscription.countDocuments({ 
      userId: { $in: userIds } 
    });
    logger.info(`Total de suscripciones push encontradas para usuarios ${roleName}:`, { 
      count: totalSubscriptions 
    });

    if (totalSubscriptions === 0) {
      logger.warn(`No hay suscripciones push para usuarios con rol ${roleName}. Los usuarios deben suscribirse primero.`);
    }

    await sendPushNotificationToUsers(userIds, payload);
    logger.info(`Notificaciones push enviadas a usuarios con rol ${roleName}`);
  } catch (error) {
    logger.error('Error en sendPushNotificationToRole:', error);
    throw error;
  }
};
