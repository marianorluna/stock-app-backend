import { Router } from 'express';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import { updateStockFromPOSController } from '../controllers/posController.js';

const router = Router();

router.use(authenticate);

// Actualizar stock desde TPV Qamarero - requiere permiso inventory:update
router.post('/update-stock', hasPermission('inventory', 'update'), updateStockFromPOSController);

export default router;
