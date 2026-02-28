import { Router } from 'express';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import { updateBearer, getBearer, getSchedule, updateSchedule } from '../controllers/configController.js';

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

export default router;
