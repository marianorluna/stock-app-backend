import { Router } from 'express';
import { listDishes, createDish, updateDish, deleteDish } from '../controllers/dishController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .get(listDishes)
  .post(authorize('owner'), createDish);

router
  .route('/:id')
  .put(authorize('owner'), updateDish)
  .delete(authorize('owner'), deleteDish);

export default router;

