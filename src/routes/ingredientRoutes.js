import { Router } from 'express';
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient
} from '../controllers/ingredientController.js';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .get(hasPermission('ingredients', 'read'), listIngredients)
  .post(hasPermission('ingredients', 'create'), createIngredient);

router
  .route('/:id')
  .put(hasPermission('ingredients', 'update'), updateIngredient)
  .delete(hasPermission('ingredients', 'delete'), deleteIngredient);

export default router;

