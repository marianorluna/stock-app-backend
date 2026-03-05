import { Router } from 'express';
import {
  listBeverages,
  createBeverage,
  updateBeverage,
  deleteBeverage
} from '../controllers/beverageController.js';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .get(hasPermission('ingredients', 'read'), listBeverages)
  .post(hasPermission('ingredients', 'create'), createBeverage);

router
  .route('/:id')
  .put(hasPermission('ingredients', 'update'), updateBeverage)
  .delete(hasPermission('ingredients', 'delete'), deleteBeverage);

export default router;
