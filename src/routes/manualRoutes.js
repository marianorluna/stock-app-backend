import { Router } from 'express';
import {
  recordManualSale,
  recordManualPurchase,
  recordManualWastage,
  deleteManualPurchase,
  listManualSales,
  listManualPurchases,
  listManualWastage,
  listWastagePresets,
  createWastagePreset,
  deleteWastagePreset,
  deleteManualWastage
} from '../controllers/manualEntryController.js';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import { validateBody } from '../utils/validation.js';
import {
  manualSaleSchema,
  manualPurchaseSchema,
  manualWastageSchema,
  manualWastagePresetSchema
} from '../validators/manualSchemas.js';

const router = Router();

router.use(authenticate);

router
  .route('/sales')
  .get(hasPermission('manual', 'read'), listManualSales)
  .post(hasPermission('manual', 'create'), validateBody(manualSaleSchema), recordManualSale);

router
  .route('/purchases')
  .get(hasPermission('manual', 'read'), listManualPurchases)
  .post(hasPermission('manual', 'create'), validateBody(manualPurchaseSchema), recordManualPurchase);

router.route('/purchases/:id').delete(hasPermission('inventory', 'delete'), deleteManualPurchase);

router
  .route('/wastage')
  .get(hasPermission('manual', 'read'), listManualWastage)
  .post(hasPermission('manual', 'create'), validateBody(manualWastageSchema), recordManualWastage);

router.route('/wastage/:id').delete(hasPermission('manual', 'delete'), deleteManualWastage);

router
  .route('/wastage/presets')
  .get(hasPermission('manual', 'read'), listWastagePresets)
  .post(hasPermission('manual', 'create'), validateBody(manualWastagePresetSchema), createWastagePreset);

router.route('/wastage/presets/:id').delete(hasPermission('manual', 'delete'), deleteWastagePreset);

export default router;

