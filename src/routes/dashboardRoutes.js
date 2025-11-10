import { Router } from 'express';
import { getStockSnapshot } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.get('/snapshot', getStockSnapshot);

export default router;

