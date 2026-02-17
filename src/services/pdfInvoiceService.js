import { processNewInvoices, processInvoiceFromPath } from './invoiceProcessor.js';
import { syncInvoiceToDatabase } from './invoiceSyncService.js';
import ProcessedInvoice from '../models/ProcessedInvoice.js';
import logger from '../config/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Procesa facturas PDF nuevas desde Cloud Storage y genera previews
 * Similar a testInvoiceProcessor.js pero adaptado para uso en API
 * 
 * @param {string} bucketName - Nombre del bucket (opcional, usa el de config por defecto)
 * @returns {Promise<Object>} - Resultado con facturas procesadas y sus previews
 */
export async function processNewPdfInvoices(bucketName = null) {
    try {
        logger.info('🚀 Iniciando procesamiento de facturas PDF desde Cloud Storage...');

        // Procesar facturas nuevas del bucket
        const results = await processNewInvoices(bucketName);

        if (results.new === 0) {
            logger.info('✅ No hay facturas nuevas para procesar');
            return {
                success: true,
                message: 'No hay facturas nuevas para procesar',
                total: results.total || 0,
                processed: results.processed || 0,
                new: 0,
                invoices: []
            };
        }

        logger.info(`📊 Procesando ${results.new} facturas nuevas...`);

        const processedInvoices = [];

        // Para cada factura procesada exitosamente, generar preview
        for (const result of results.results || []) {
            if (result.success && result.jsonPath) {
                try {
                    logger.info(`📋 Generando preview para: ${result.fileName}`);

                    // Leer el JSON procesado
                    const invoiceData = JSON.parse(fs.readFileSync(result.jsonPath, 'utf-8'));

                    // Establecer modo preview
                    invoiceData._previewMode = true;

                    // Crear archivo temporal para preview
                    const tempDir = path.join(__dirname, '../../output/invoices');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }

                    const tempPreviewPath = path.join(tempDir, `preview-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
                    fs.writeFileSync(tempPreviewPath, JSON.stringify(invoiceData, null, 2), 'utf-8');

                    // Generar preview (no aplica cambios)
                    const previewResult = await syncInvoiceToDatabase(tempPreviewPath);

                    // Limpiar archivo temporal
                    try {
                        if (fs.existsSync(tempPreviewPath)) {
                            fs.unlinkSync(tempPreviewPath);
                        }
                    } catch (cleanupError) {
                        logger.warn(`⚠️  Error limpiando archivo temporal: ${cleanupError.message}`);
                    }

                    // Buscar el registro en ProcessedInvoice
                    const processedInvoice = await ProcessedInvoice.findOne({
                        fileName: result.fileName,
                        bucketName: bucketName || process.env.GCS_BUCKET_NAME || 'etama-facturas-pdf-gmail'
                    });

                    processedInvoices.push({
                        invoiceId: processedInvoice?._id?.toString() || null,
                        fileName: result.fileName,
                        jsonPath: result.jsonPath,
                        invoiceData: invoiceData,
                        preview: {
                            summary: previewResult.summary,
                            nuevosIngredientes: previewResult.nuevosIngredientes || [],
                            ingredientesActualizados: previewResult.ingredientesActualizados || [],
                            errors: previewResult.errors || []
                        },
                        processingTime: result.processingTime
                    });

                    logger.info(`✅ Preview generado para: ${result.fileName}`);

                } catch (previewError) {
                    logger.error(`❌ Error generando preview para ${result.fileName}:`, previewError);
                    processedInvoices.push({
                        fileName: result.fileName,
                        jsonPath: result.jsonPath,
                        error: previewError.message,
                        preview: null
                    });
                }
            } else if (result.success === false) {
                logger.error(`❌ Error procesando factura ${result.fileName}: ${result.error}`);
                processedInvoices.push({
                    fileName: result.fileName,
                    error: result.error,
                    preview: null
                });
            }
        }

        logger.info(`✅ Procesamiento completado: ${processedInvoices.length} facturas procesadas`);

        return {
            success: true,
            message: `${processedInvoices.length} factura(s) procesada(s) exitosamente`,
            total: results.total || 0,
            processed: results.processed || 0,
            new: results.new || 0,
            successful: results.successful || 0,
            failed: results.failed || 0,
            invoices: processedInvoices
        };

    } catch (error) {
        logger.error('❌ Error procesando facturas PDF:', error);
        throw error;
    }
}

/**
 * Procesa una factura PDF específica desde Cloud Storage
 * 
 * @param {string} fileName - Nombre del archivo PDF en el bucket
 * @param {string} bucketName - Nombre del bucket (opcional)
 * @returns {Promise<Object>} - Resultado con factura procesada y preview
 */
export async function processSinglePdfInvoice(fileName, bucketName = null) {
    try {
        logger.info(`📄 Procesando factura PDF: ${fileName}`);

        // Procesar la factura
        const result = await processInvoiceFromPath(fileName, bucketName);

        if (!result.success) {
            throw new Error(result.error || 'Error procesando factura');
        }

        if (result.skipped) {
            // Ya fue procesada anteriormente
            logger.info(`⏭️  Factura ${fileName} ya fue procesada anteriormente`);

            // Leer el JSON existente
            const invoiceData = result.data || JSON.parse(fs.readFileSync(result.jsonPath, 'utf-8'));

            // Buscar el registro en ProcessedInvoice
            const processedInvoice = await ProcessedInvoice.findOne({
                fileName: fileName,
                bucketName: bucketName || process.env.GCS_BUCKET_NAME || 'etama-facturas-pdf-gmail'
            });

            return {
                success: true,
                skipped: true,
                message: 'Factura ya procesada anteriormente',
                invoiceId: processedInvoice?._id?.toString() || null,
                fileName: fileName,
                jsonPath: result.jsonPath,
                invoiceData: invoiceData
            };
        }

        // Leer el JSON procesado
        const invoiceData = JSON.parse(fs.readFileSync(result.jsonPath, 'utf-8'));

        // Establecer modo preview
        invoiceData._previewMode = true;

        // Crear archivo temporal para preview
        const tempDir = path.join(__dirname, '../../output/invoices');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempPreviewPath = path.join(tempDir, `preview-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
        fs.writeFileSync(tempPreviewPath, JSON.stringify(invoiceData, null, 2), 'utf-8');

        // Generar preview (no aplica cambios)
        let previewResult;
        try {
            previewResult = await syncInvoiceToDatabase(tempPreviewPath);
        } finally {
            // Limpiar archivo temporal
            try {
                if (fs.existsSync(tempPreviewPath)) {
                    fs.unlinkSync(tempPreviewPath);
                }
            } catch (cleanupError) {
                logger.warn(`⚠️  Error limpiando archivo temporal: ${cleanupError.message}`);
            }
        }

        // Buscar el registro en ProcessedInvoice y actualizar status a 'processing'
        const actualBucketName = bucketName || process.env.GCS_BUCKET_NAME || 'etama-facturas-pdf-gmail';
        let processedInvoice = await ProcessedInvoice.findOne({
            fileName: fileName,
            bucketName: actualBucketName
        });

        // Si existe, actualizar status a 'processing' para permitir cancelación
        if (processedInvoice) {
            processedInvoice = await ProcessedInvoice.findByIdAndUpdate(
                processedInvoice._id,
                { status: 'processing' },
                { new: true }
            );
        } else {
            // Si no existe, crearlo con status 'processing'
            processedInvoice = await ProcessedInvoice.create({
                fileName: fileName,
                bucketName: actualBucketName,
                jsonPath: result.jsonPath,
                invoiceData: invoiceData,
                status: 'processing'
            });
        }

        logger.info(`✅ Factura procesada y preview generado: ${fileName}`);

        return {
            success: true,
            invoiceId: processedInvoice._id.toString(),
            fileName: fileName,
            jsonPath: result.jsonPath,
            invoiceData: invoiceData,
            preview: {
                summary: previewResult.summary,
                nuevosIngredientes: previewResult.nuevosIngredientes || [],
                ingredientesActualizados: previewResult.ingredientesActualizados || [],
                errors: previewResult.errors || []
            },
            processingTime: result.processingTime
        };

    } catch (error) {
        logger.error(`❌ Error procesando factura PDF ${fileName}:`, error);
        throw error;
    }
}

/**
 * Cancela el procesamiento de una factura (elimina JSON y registro en BD)
 * 
 * @param {string} invoiceId - ID del registro ProcessedInvoice
 * @returns {Promise<Object>} - Resultado de la cancelación
 */
export async function cancelPdfInvoiceProcessing(invoiceId) {
    try {
        logger.info(`🗑️  Cancelando procesamiento de factura: ${invoiceId}`);

        const processedInvoice = await ProcessedInvoice.findById(invoiceId);

        if (!processedInvoice) {
            throw new Error('Factura no encontrada');
        }

        // Si ya fue confirmada (status = 'success'), no se puede cancelar
        if (processedInvoice.status === 'success') {
            throw new Error('No se puede cancelar una factura ya confirmada');
        }

        // Eliminar archivo JSON si existe
        if (processedInvoice.jsonPath && fs.existsSync(processedInvoice.jsonPath)) {
            try {
                fs.unlinkSync(processedInvoice.jsonPath);
                logger.info(`🗑️  Archivo JSON eliminado: ${processedInvoice.jsonPath}`);
            } catch (fileError) {
                logger.warn(`⚠️  Error eliminando archivo JSON: ${fileError.message}`);
            }
        }

        // Eliminar registro de la BD
        await ProcessedInvoice.findByIdAndDelete(invoiceId);

        logger.info(`✅ Procesamiento cancelado: ${invoiceId}`);

        return {
            success: true,
            message: 'Procesamiento cancelado exitosamente',
            invoiceId: invoiceId
        };

    } catch (error) {
        logger.error(`❌ Error cancelando procesamiento de factura ${invoiceId}:`, error);
        throw error;
    }
}
