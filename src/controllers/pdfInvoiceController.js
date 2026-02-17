import asyncHandler from 'express-async-handler';
import logger from '../config/logger.js';
import {
    processNewPdfInvoices,
    processSinglePdfInvoice,
    cancelPdfInvoiceProcessing
} from '../services/pdfInvoiceService.js';

/**
 * Procesa facturas PDF nuevas desde Cloud Storage
 * POST /api/invoices/process-pdfs
 * Body (opcional): { bucketName: "nombre-del-bucket" }
 */
export const processPdfInvoices = asyncHandler(async (req, res) => {
    const { bucketName } = req.body;

    logger.info('📦 Procesando facturas PDF desde Cloud Storage...');

    try {
        const result = await processNewPdfInvoices(bucketName);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Error procesando facturas PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error procesando facturas PDF',
            error: error.message
        });
    }
});

/**
 * Procesa una factura PDF específica desde Cloud Storage
 * POST /api/invoices/process-pdf/:fileName
 * Body (opcional): { bucketName: "nombre-del-bucket" }
 */
export const processSinglePdf = asyncHandler(async (req, res) => {
    const { fileName } = req.params;
    const { bucketName } = req.body;

    if (!fileName) {
        return res.status(400).json({
            success: false,
            message: 'Se requiere el nombre del archivo'
        });
    }

    logger.info(`📄 Procesando factura PDF: ${fileName}`);

    try {
        const result = await processSinglePdfInvoice(fileName, bucketName);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error(`Error procesando factura PDF ${fileName}:`, error);
        res.status(500).json({
            success: false,
            message: 'Error procesando factura PDF',
            error: error.message
        });
    }
});

/**
 * Cancela el procesamiento de una factura PDF
 * DELETE /api/invoices/cancel-pdf/:invoiceId
 */
export const cancelPdfInvoice = asyncHandler(async (req, res) => {
    const { invoiceId } = req.params;

    if (!invoiceId) {
        return res.status(400).json({
            success: false,
            message: 'Se requiere el ID de la factura'
        });
    }

    logger.info(`🗑️  Cancelando procesamiento de factura: ${invoiceId}`);

    try {
        const result = await cancelPdfInvoiceProcessing(invoiceId);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error(`Error cancelando procesamiento de factura ${invoiceId}:`, error);
        res.status(500).json({
            success: false,
            message: 'Error cancelando procesamiento',
            error: error.message
        });
    }
});
