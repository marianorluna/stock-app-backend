import { Router } from 'express';
import {
  recordManualSale,
  recordManualPurchase,
  recordManualWastage,
  listManualSales,
  listManualPurchases,
  listManualWastage,
  listWastagePresets,
  createWastagePreset,
  deleteWastagePreset,
  deleteManualWastage
} from '../controllers/manualEntryController.js';
import { authenticate } from '../middleware/authMiddleware.js';
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
  .get(listManualSales)
  .post(validateBody(manualSaleSchema), recordManualSale);

router
  .route('/purchases')
  .get(listManualPurchases)
  .post(validateBody(manualPurchaseSchema), recordManualPurchase);

router
  .route('/wastage')
  .get(listManualWastage)
  .post(validateBody(manualWastageSchema), recordManualWastage);

router.route('/wastage/:id').delete(deleteManualWastage);

router
  .route('/wastage/presets')
  .get(listWastagePresets)
  .post(validateBody(manualWastagePresetSchema), createWastagePreset);

router.route('/wastage/presets/:id').delete(deleteWastagePreset);

export default router;

