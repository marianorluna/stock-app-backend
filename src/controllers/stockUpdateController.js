/**
 * Controlador para la actualización de stock desde facturas PDF del bucket
 *
 * POST /api/suppliers/update-stock
 * Body (opcional): { bucketName: "nombre-del-bucket" }
 */

import asyncHandler from 'express-async-handler';
import logger from '../config/logger.js';
import { updateStockFromNewInvoices, updateStockFromUploadedPdf } from '../services/stockUpdateService.js';

/**
 * Recibe un PDF en base64, lo procesa con Gemini y actualiza el stock.
 * POST /api/suppliers/upload-pdf-stock
 * Body: { pdfBase64: string, fileName: string }
 */
export const uploadPdfAndUpdateStock = asyncHandler(async (req, res) => {
  const { pdfBase64, fileName } = req.body || {};

  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    res.status(400);
    throw new Error('Se requiere el campo pdfBase64 con el contenido del PDF en base64');
  }

  const originalFileName = (fileName && typeof fileName === 'string')
    ? fileName
    : `invoice-${Date.now()}.pdf`;

  logger.info(`📤 Procesando PDF cargado manualmente: ${originalFileName}`);

  try {
    const result = await updateStockFromUploadedPdf(pdfBase64, originalFileName);
    res.json({ success: true, ...result });
  } catch (err) {
    // Factura duplicada → 409 Conflict con flag especial para el frontend
    if (err && err.isDuplicateInvoice) {
      logger.warn('⚠️  Factura duplicada rechazada:', err.message);
      return res.status(409).json({
        success: false,
        isDuplicateInvoice: true,
        message: err.message
      });
    }

    const message = typeof err === 'object' && err.error ? err.error : String(err);
    const steps   = typeof err === 'object' && err.steps  ? err.steps  : [];

    logger.error('❌ Error procesando PDF cargado:', message);

    res.status(500).json({
      success: false,
      message,
      steps,
      updatedIngredients: [],
      updatedBeverages: [],
      unmatchedItems: []
    });
  }
});

export const updateStockFromInvoices = asyncHandler(async (req, res) => {
  const { bucketName } = req.body || {};

  logger.info('🚀 Iniciando actualización de stock desde facturas PDF...');

  try {
    const result = await updateStockFromNewInvoices(bucketName || null);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    // err puede ser un objeto { steps, error } lanzado desde el servicio
    const message = typeof err === 'object' && err.error ? err.error : String(err);
    const steps = typeof err === 'object' && err.steps ? err.steps : [];

    logger.error('❌ Error en actualización de stock:', message);

    res.status(500).json({
      success: false,
      message,
      steps,
      updatedIngredients: [],
      updatedBeverages: [],
      unmatchedItems: []
    });
  }
});
