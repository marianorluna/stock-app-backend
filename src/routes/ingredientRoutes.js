import { Router } from 'express';
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient
} from '../controllers/ingredientController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .get(listIngredients)
  .post(authorize('owner'), createIngredient);

router
  .route('/:id')
  .put(authorize('owner'), updateIngredient)
  .delete(authorize('owner'), deleteIngredient);

export default router;

