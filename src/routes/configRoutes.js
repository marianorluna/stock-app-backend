import { Router } from 'express';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import {
    updateBearer, getBearer,
    getSchedule, updateSchedule,
    getSalesSchedule, updateSalesSchedule,
    getNotificationEmails, addNotificationEmail, updateNotificationEmail, deleteNotificationEmail
} from '../controllers/configController.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener el bearer actual - requiere permiso config:read
router.get('/bearer', hasPermission('config', 'read'), getBearer);

// Actualizar el bearer - requiere permiso config:update
router.put('/bearer', hasPermission('config', 'update'), updateBearer);

// Obtener el horario de actualización diaria - requiere permiso config:read
router.get('/schedule', hasPermission('config', 'read'), getSchedule);

// Actualizar el horario de actualización diaria - requiere permiso config:update
router.put('/schedule', hasPermission('config', 'update'), updateSchedule);

// Obtener el horario de cierre de ventas del TPV - requiere permiso config:read
router.get('/sales-schedule', hasPermission('config', 'read'), getSalesSchedule);

// Actualizar el horario de cierre de ventas del TPV - requiere permiso config:update
router.put('/sales-schedule', hasPermission('config', 'update'), updateSalesSchedule);

// Obtener emails de notificación - requiere permiso config:read
router.get('/notification-emails', hasPermission('config', 'read'), getNotificationEmails);

// Agregar email de notificación - requiere permiso config:update
router.post('/notification-emails', hasPermission('config', 'update'), addNotificationEmail);

// Actualizar email de notificación - requiere permiso config:update
router.put('/notification-emails/:id', hasPermission('config', 'update'), updateNotificationEmail);

// Eliminar email de notificación - requiere permiso config:update
router.delete('/notification-emails/:id', hasPermission('config', 'update'), deleteNotificationEmail);

export default router;
