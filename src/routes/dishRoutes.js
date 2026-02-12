import { Router } from 'express';
import { listDishes, createDish, updateDish, deleteDish } from '../controllers/dishController.js';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .get(hasPermission('recipes', 'read'), listDishes)
  .post(hasPermission('recipes', 'create'), createDish);

router
  .route('/:id')
  .put(hasPermission('recipes', 'update'), updateDish)
  .delete(hasPermission('recipes', 'delete'), deleteDish);

export default router;

