import { syncInvoiceToDatabase, syncInvoiceByFileName } from '../services/invoiceSyncService.js';
import asyncHandler from 'express-async-handler';
import logger from '../config/logger.js';

/**
 * Sincroniza una factura específica por nombre de archivo
 * GET /api/invoices/sync/:fileName
 */
export const syncInvoice = asyncHandler(async (req, res) => {
  const { fileName } = req.params;
  
  if (!fileName) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere el nombre del archivo'
    });
  }

  logger.info(`Sincronizando factura: ${fileName}`);
  
  try {
    const result = await syncInvoiceByFileName(fileName);
    
    res.json({
      success: true,
      message: 'Factura sincronizada exitosamente',
      ...result
    });
  } catch (error) {
    logger.error(`Error sincronizando factura ${fileName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error sincronizando factura',
      error: error.message
    });
  }
});

/**
 * Sincroniza una factura desde una ruta completa
 * POST /api/invoices/sync
 * Body: { jsonPath: "ruta/completa/al/archivo.json" }
 */
export const syncInvoiceFromPath = asyncHandler(async (req, res) => {
  const { jsonPath } = req.body;
  
  if (!jsonPath) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere la ruta del archivo JSON (jsonPath)'
    });
  }

  logger.info(`Sincronizando factura desde ruta: ${jsonPath}`);
  
  try {
    const result = await syncInvoiceToDatabase(jsonPath);
    
    res.json({
      success: true,
      message: 'Factura sincronizada exitosamente',
      ...result
    });
  } catch (error) {
    logger.error(`Error sincronizando factura desde ${jsonPath}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error sincronizando factura',
      error: error.message
    });
  }
});
