import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import {
  listSuppliers,
  updateSupplier,
  deleteSupplier,
  duplicateSupplier
} from '../controllers/supplierController.js';

const router = Router();

router.use(authenticate);

router.get('/', listSuppliers);
router.put('/:supplierName', authorize('owner'), updateSupplier);
router.delete('/:supplierName', authorize('owner'), deleteSupplier);
router.post('/:supplierName/duplicate', authorize('owner'), duplicateSupplier);

export default router;


