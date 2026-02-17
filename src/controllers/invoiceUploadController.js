import asyncHandler from 'express-async-handler';
import logger from '../config/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ProcessedInvoice from '../models/ProcessedInvoice.js';
import { syncInvoiceToDatabase } from '../services/invoiceSyncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sube un archivo JSON de factura
 * POST /api/invoices/upload
 * Body: { invoiceData: {...} } (JSON object)
 */
export const uploadInvoiceJSON = asyncHandler(async (req, res) => {
  const invoiceData = req.body;

  // Validar que sea un objeto JSON válido
  if (!invoiceData || typeof invoiceData !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'El cuerpo de la petición debe ser un objeto JSON válido'
    });
  }

  // Validar estructura básica
  if (!invoiceData.lista_items || !Array.isArray(invoiceData.lista_items)) {
    return res.status(400).json({
      success: false,
      message: 'El JSON debe contener lista_items como array'
    });
  }

  // Validar tamaño (aproximado en bytes)
  const jsonString = JSON.stringify(invoiceData);
  const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
  const maxSize = 2 * 1024 * 1024; // 2MB

  if (sizeInBytes > maxSize) {
    return res.status(400).json({
      success: false,
      message: `El archivo JSON es demasiado grande (${(sizeInBytes / 1024 / 1024).toFixed(2)} MB). Máximo permitido: 2 MB`
    });
  }

  try {
    // Crear directorio si no existe
    const outputDir = path.join(__dirname, '../../output/invoices');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generar nombre de archivo único
    let fecha;
    if (invoiceData.fecha) {
      try {
        // Intentar parsear la fecha (puede venir en formato DD/MM/YYYY)
        let dateValue = invoiceData.fecha;

        // Si es string con formato DD/MM/YYYY, convertirlo a formato válido
        if (typeof dateValue === 'string' && dateValue.includes('/')) {
          const parts = dateValue.split('/');
          if (parts.length === 3) {
            // Formato DD/MM/YYYY -> YYYY-MM-DD
            dateValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        const parsedDate = new Date(dateValue);

        // Validar que la fecha sea válida
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Fecha inválida');
        }

        fecha = parsedDate.toISOString().split('T')[0].replace(/-/g, '');
      } catch (error) {
        // Si falla el parseo, usar fecha actual
        logger.warn(`Fecha inválida recibida: ${invoiceData.fecha}, usando fecha actual`);
        fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
      }
    } else {
      fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    }

    const timestamp = Date.now();
    const fileName = `invoice-${fecha}-upload-${timestamp}.json`;
    const filePath = path.join(outputDir, fileName);

    // Guardar archivo JSON
    fs.writeFileSync(filePath, JSON.stringify(invoiceData, null, 2), 'utf-8');

    logger.info(`✅ Archivo JSON guardado: ${fileName}`);

    // Guardar referencia en ProcessedInvoice con status 'processing'
    const processedInvoice = await ProcessedInvoice.create({
      fileName: fileName,
      bucketName: 'uploaded',
      jsonPath: filePath,
      invoiceData: invoiceData,
      status: 'processing',
      metadata: {
        uploadedAt: new Date(),
        sizeBytes: sizeInBytes,
        itemsCount: invoiceData.lista_items.length
      }
    });

    logger.info(`✅ Referencia guardada en BD: ${processedInvoice._id}`);

    res.json({
      success: true,
      message: 'Archivo JSON subido exitosamente',
      invoiceId: processedInvoice._id,
      fileName: fileName,
      filePath: filePath,
      preview: {
        numero_factura: invoiceData.numero_factura,
        proveedor: invoiceData.proveedor,
        fecha: invoiceData.fecha,
        total_factura: invoiceData.total_factura,
        itemsCount: invoiceData.lista_items.length
      }
    });

  } catch (error) {
    logger.error('Error subiendo archivo JSON:', error);
    res.status(500).json({
      success: false,
      message: 'Error subiendo archivo JSON',
      error: error.message
    });
  }
});

/**
 * Procesa una factura subida (preview sin aplicar cambios)
 * POST /api/invoices/preview/:invoiceId
 */
export const previewInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere el ID de la factura'
    });
  }

  let tempPreviewPath = null;

  try {
    const processedInvoice = await ProcessedInvoice.findById(invoiceId);

    if (!processedInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }

    if (!processedInvoice.jsonPath || !fs.existsSync(processedInvoice.jsonPath)) {
      return res.status(404).json({
        success: false,
        message: 'Archivo JSON no encontrado'
      });
    }

    logger.info(`📋 Generando preview de factura: ${invoiceId}`);

    // Leer el JSON original y establecer modo preview
    const invoiceData = JSON.parse(fs.readFileSync(processedInvoice.jsonPath, 'utf-8'));
    invoiceData._previewMode = true;

    // Crear archivo temporal con modo preview
    const tempDir = path.join(__dirname, '../../output/invoices');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    tempPreviewPath = path.join(tempDir, `preview-${invoiceId}-${Date.now()}.json`);
    fs.writeFileSync(tempPreviewPath, JSON.stringify(invoiceData, null, 2), 'utf-8');

    logger.info(`📝 Archivo temporal de preview creado: ${tempPreviewPath}`);

    // Procesar factura en modo preview (no aplicará cambios)
    const result = await syncInvoiceToDatabase(tempPreviewPath);

    // Limpiar archivo temporal
    try {
      if (tempPreviewPath && fs.existsSync(tempPreviewPath)) {
        fs.unlinkSync(tempPreviewPath);
        logger.debug(`🗑️  Archivo temporal de preview eliminado: ${tempPreviewPath}`);
      }
    } catch (cleanupError) {
      logger.warn(`⚠️  Error limpiando archivo temporal de preview: ${cleanupError.message}`);
    }

    // Mantener status en 'processing' hasta que se confirme
    await ProcessedInvoice.findByIdAndUpdate(invoiceId, {
      status: 'processing',
      invoiceData: processedInvoice.invoiceData
    });

    res.json({
      success: true,
      message: 'Preview generado exitosamente',
      invoiceId: invoiceId,
      ...result
    });

  } catch (error) {
    // Limpiar archivo temporal en caso de error
    try {
      if (tempPreviewPath && fs.existsSync(tempPreviewPath)) {
        fs.unlinkSync(tempPreviewPath);
        logger.debug(`🗑️  Archivo temporal de preview eliminado tras error: ${tempPreviewPath}`);
      }
    } catch (cleanupError) {
      logger.warn(`⚠️  Error limpiando archivo temporal tras error: ${cleanupError.message}`);
    }

    logger.error(`Error generando preview de factura ${invoiceId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error generando preview',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Confirma y aplica los cambios de una factura procesada
 * POST /api/invoices/confirm/:invoiceId
 */
export const confirmInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere el ID de la factura'
    });
  }

  try {
    const processedInvoice = await ProcessedInvoice.findById(invoiceId);

    if (!processedInvoice) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }

    if (processedInvoice.status === 'success') {
      return res.status(400).json({
        success: false,
        message: 'Esta factura ya fue procesada y confirmada'
      });
    }

    if (!processedInvoice.jsonPath || !fs.existsSync(processedInvoice.jsonPath)) {
      return res.status(404).json({
        success: false,
        message: 'Archivo JSON no encontrado'
      });
    }

    logger.info(`✅ Confirmando y aplicando cambios de factura: ${invoiceId}`);

    // Procesar factura nuevamente pero esta vez aplicando cambios (sin _previewMode)
    const result = await syncInvoiceToDatabase(processedInvoice.jsonPath);

    // Actualizar status a 'success'
    await ProcessedInvoice.findByIdAndUpdate(invoiceId, {
      status: 'success'
    });

    logger.info(`✅ Factura confirmada y aplicada: ${invoiceId}`);

    res.json({
      success: true,
      message: 'Factura confirmada y aplicada exitosamente',
      invoiceId: invoiceId,
      ...result
    });

  } catch (error) {
    logger.error(`Error confirmando factura ${invoiceId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error confirmando factura',
      error: error.message
    });
  }
});
