import { Router } from 'express';
import { syncUser, getProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

//sincroniza usuario de Firebase con la BD
router.post('/sync', syncUser);
//obtiene el perfil del usuario autenticado
router.get('/profile', authenticate, getProfile);

export default router;

