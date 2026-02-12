import { Router } from 'express';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import {
  listSuppliers,
  updateSupplier,
  deleteSupplier,
  duplicateSupplier
} from '../controllers/supplierController.js';

const router = Router();

router.use(authenticate);

router.get('/', hasPermission('suppliers', 'read'), listSuppliers);
router.put('/:supplierName', hasPermission('suppliers', 'update'), updateSupplier);
router.delete('/:supplierName', hasPermission('suppliers', 'delete'), deleteSupplier);
router.post('/:supplierName/duplicate', hasPermission('suppliers', 'create'), duplicateSupplier);

export default router;


