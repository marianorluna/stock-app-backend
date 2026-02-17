import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import logger from '../config/logger.js';

/**
 * Crea y guarda una notificación en la base de datos para un usuario específico
 * @param {string} userId - ID del usuario
 * @param {object} payload - Datos de la notificación
 * @param {string} payload.title - Título de la notificación
 * @param {string} payload.message - Mensaje de la notificación
 * @param {string} payload.type - Tipo de notificación (stock, sale, purchase, wastage, etc.)
 * @param {object} payload.data - Datos adicionales de la notificación
 */
export const createNotification = async (userId, payload) => {
  try {
    const notification = await Notification.create({
      userId,
      title: payload.title || 'Stockearly',
      message: payload.message || 'Tienes una nueva notificación',
      type: payload.type || 'info',
      data: payload.data || {},
    });

    logger.debug('Notificación guardada en BD', {
      notificationId: notification._id,
      userId,
      type: notification.type,
      title: notification.title,
    });

    return notification;
  } catch (error) {
    logger.error('Error creando notificación:', error);
    throw error;
  }
};

/**
 * Crea y guarda notificaciones para múltiples usuarios
 * @param {string[]} userIds - Array de IDs de usuarios
 * @param {object} payload - Datos de la notificación
 */
export const createNotificationForUsers = async (userIds, payload) => {
  if (!userIds || userIds.length === 0) {
    logger.warn('No se proporcionaron userIds para crear notificaciones');
    return [];
  }

  try {
    const notifications = await Promise.all(
      userIds.map((userId) => createNotification(userId, payload))
    );

    logger.info(`Notificaciones creadas para ${notifications.length} usuarios`, {
      type: payload.type,
      title: payload.title,
    });

    return notifications;
  } catch (error) {
    logger.error('Error creando notificaciones para múltiples usuarios:', error);
    throw error;
  }
};

/**
 * Crea y guarda notificaciones para todos los usuarios con un rol específico
 * @param {string} roleName - Nombre del rol (admin, manager, operator, guest)
 * @param {object} payload - Datos de la notificación
 */
export const createNotificationForRole = async (roleName, payload) => {
  try {
    // Buscar el rol
    const role = await Role.findOne({ name: roleName });
    if (!role) {
      logger.warn(`Rol ${roleName} no encontrado`);
      return [];
    }

    // Buscar todos los usuarios activos con ese rol
    const users = await User.find({ role: role._id, isActive: true });
    const userIds = users.map((user) => user._id.toString());

    if (userIds.length === 0) {
      logger.warn(`No hay usuarios activos con el rol ${roleName}`);
      return [];
    }

    logger.info(`Creando notificaciones para usuarios con rol ${roleName}`, {
      count: userIds.length,
      type: payload.type,
    });

    return await createNotificationForUsers(userIds, payload);
  } catch (error) {
    logger.error(`Error creando notificaciones para rol ${roleName}:`, error);
    throw error;
  }
};

/**
 * Crea y guarda notificaciones para todos los usuarios con roles admin o manager
 * @param {object} payload - Datos de la notificación
 */
export const createNotificationForAdminsAndManagers = async (payload) => {
  try {
    const adminRole = await Role.findOne({ name: 'admin' });
    const managerRole = await Role.findOne({ name: 'manager' });

    if (!adminRole || !managerRole) {
      logger.warn('Roles admin o manager no encontrados');
      return [];
    }

    // Buscar todos los usuarios activos con rol admin o manager
    const users = await User.find({
      role: { $in: [adminRole._id, managerRole._id] },
      isActive: true,
    });

    const userIds = users.map((user) => user._id.toString());

    if (userIds.length === 0) {
      logger.warn('No hay usuarios activos con rol admin o manager');
      return [];
    }

    logger.info(`Creando notificaciones para admins y managers`, {
      count: userIds.length,
      type: payload.type,
    });

    return await createNotificationForUsers(userIds, payload);
  } catch (error) {
    logger.error('Error creando notificaciones para admins y managers:', error);
    throw error;
  }
};
