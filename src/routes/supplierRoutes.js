import { Router } from 'express';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  duplicateSupplier
} from '../controllers/supplierController.js';

const router = Router();

router.use(authenticate);

router.get('/', hasPermission('suppliers', 'read'), listSuppliers);
router.post('/', hasPermission('suppliers', 'create'), createSupplier);
router.put('/:supplierSku', hasPermission('suppliers', 'update'), updateSupplier);
router.delete('/:supplierSku', hasPermission('suppliers', 'delete'), deleteSupplier);
router.post('/:supplierSku/duplicate', hasPermission('suppliers', 'create'), duplicateSupplier);

export default router;


