import { Router } from 'express';
import { authenticate, hasPermission } from '../middleware/authMiddleware.js';
import { syncInvoice, syncInvoiceFromPath } from '../controllers/invoiceSyncController.js';
import { uploadInvoiceJSON, previewInvoice, confirmInvoice } from '../controllers/invoiceUploadController.js';
import { processPdfInvoices, processSinglePdf, cancelPdfInvoice } from '../controllers/pdfInvoiceController.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Subir archivo JSON de factura
// POST /api/invoices/upload
router.post(
  '/upload',
  hasPermission('inventory', 'create'),
  uploadInvoiceJSON
);

// Preview de factura (procesa sin aplicar cambios)
// POST /api/invoices/preview/:invoiceId
router.post(
  '/preview/:invoiceId',
  hasPermission('inventory', 'create'),
  previewInvoice
);

// Confirmar y aplicar cambios de factura
// POST /api/invoices/confirm/:invoiceId
router.post(
  '/confirm/:invoiceId',
  hasPermission('inventory', 'create'),
  confirmInvoice
);

// Sincronizar factura por nombre de archivo
// GET /api/invoices/sync/:fileName
router.get(
  '/sync/:fileName',
  hasPermission('inventory', 'create'),
  syncInvoice
);

// Sincronizar factura desde ruta completa
// POST /api/invoices/sync
router.post(
  '/sync',
  hasPermission('inventory', 'create'),
  syncInvoiceFromPath
);

// Procesar facturas PDF nuevas desde Cloud Storage
// POST /api/invoices/process-pdfs
router.post(
  '/process-pdfs',
  hasPermission('inventory', 'create'),
  processPdfInvoices
);

// Procesar una factura PDF específica
// POST /api/invoices/process-pdf/:fileName
router.post(
  '/process-pdf/:fileName',
  hasPermission('inventory', 'create'),
  processSinglePdf
);

// Cancelar procesamiento de factura PDF
// DELETE /api/invoices/cancel-pdf/:invoiceId
router.delete(
  '/cancel-pdf/:invoiceId',
  hasPermission('inventory', 'create'),
  cancelPdfInvoice
);

export default router;
