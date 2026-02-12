import { Router } from 'express';
import { getStockSnapshot } from '../controllers/dashboardController.js';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);
//ruta para obtener el snapshot del inventario (accesible para usuarios con permiso inventory:read)
router.get('/snapshot', hasPermission('inventory', 'read'), getStockSnapshot);

export default router;

