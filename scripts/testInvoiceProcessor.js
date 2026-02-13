/**
 * Script para procesar facturas PDF desde Cloud Storage o archivos locales
 * 
 * DESCRIPCIÓN:
 * Este script puede funcionar en dos modos:
 * 
 * 1. MODO MASIVO (sin argumentos):
 *    Procesa todos los archivos PDF nuevos del bucket de Cloud Storage.
 *    - Lista todos los PDFs en el bucket
 *    - Filtra los que ya fueron procesados (usando MongoDB)
 *    - Procesa solo los archivos nuevos
 *    - Muestra un resumen con totales, exitosos y fallidos
 * 
 *    Uso: npm run test:invoices
 *         node scripts/testInvoiceProcessor.js
 * 
 * 2. MODO INDIVIDUAL (con argumento):
 *    Procesa un archivo específico, ya sea del bucket o local.
 *    - Si el archivo existe en la carpeta `scripts/pdfs/`, lo procesa como archivo local
 *    - Si no existe localmente, lo busca en el bucket
 *    - Muestra información detallada del archivo procesado
 * 
 *    Uso: npm run test:invoices archivo.pdf
 *         node scripts/testInvoiceProcessor.js archivo.pdf
 *         node scripts/testInvoiceProcessor.js ruta/completa/archivo.pdf
 * 
 * PROCESAMIENTO:
 * - Descarga el PDF (si es del bucket) o usa el archivo local
 * - Procesa el PDF directamente con Gemini 2.5 Flash (sin OCR previo)
 * - Extrae información estructurada (proveedor, items, totales, etc.)
 * - Guarda el resultado en JSON en `output/invoices/`
 * - Registra el procesamiento en MongoDB para evitar reprocesar
 * 
 * ARCHIVOS LOCALES:
 * - Los archivos locales deben estar en la carpeta `scripts/pdfs/`
 * - También se pueden pasar rutas absolutas
 * - Los archivos locales se marcan con bucketName='local' en MongoDB
 * 
 * REQUISITOS:
 * - Variables de entorno configuradas (.env):
 *   - GCS_* (Cloud Storage credentials)
 *   - GEMINI_API_KEY
 *   - MONGODB_URI o MONGODB_URI_ATLAS (según NODE_ENV)
 * 
 * EJEMPLOS:
 *   # Procesar todos los archivos nuevos del bucket
 *   npm run test:invoices
 * 
 *   # Procesar un archivo específico del bucket
 *   npm run test:invoices factura-2024.pdf
 * 
 *   # Procesar un archivo local (debe estar en scripts/pdfs/)
 *   npm run test:invoices mi-factura.pdf
 * 
 *   # Procesar un archivo con ruta absoluta
 *   npm run test:invoices /ruta/completa/factura.pdf
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import connectDatabase from '../src/config/database.js';
import {
    verifyConfiguration,
    processNewInvoices,
    processInvoiceFromPath
} from '../src/services/invoiceProcessor.js';
import logger from '../src/config/logger.js';

// Cargar variables de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    try {
        const fileName = process.argv[2];
        const bucketName = process.argv[3] || process.env.GCS_BUCKET_NAME || 'etama-facturas-pdf-gmail';

        logger.info('🚀 Iniciando procesador de facturas...\n');

        // 1. Verificación rápida de configuración (solo errores críticos)
        const configStatus = await verifyConfiguration();
        if (configStatus.errors.length > 0) {
            const criticalErrors = configStatus.errors.filter(err =>
                !err.includes('no crítico') &&
                !err.includes('puede funcionar al procesar') &&
                !err.includes('se conectará después')
            );

            if (criticalErrors.length > 0) {
                logger.error('❌ Errores críticos en la configuración:');
                criticalErrors.forEach((error, index) => {
                    logger.error(`  ${index + 1}. ${error}`);
                });
                process.exit(1);
            }
        }

        // 2. Conectar MongoDB
        const nodeEnv = process.env.NODE_ENV || 'development';
        const mongoUri = nodeEnv === 'production'
            ? process.env.MONGODB_URI_ATLAS
            : process.env.MONGODB_URI;

        if (!mongoUri) {
            throw new Error(`MongoDB URI no configurada para entorno ${nodeEnv}`);
        }

        await connectDatabase(mongoUri);
        logger.info('✅ MongoDB conectado\n');

        // 3. Procesar según modo
        if (fileName) {
            // MODO INDIVIDUAL
            logger.info(`📄 Procesando archivo: ${fileName}\n`);

            // Verificar si es un archivo local
            const scriptsPdfsDir = path.join(__dirname, '../scripts/pdfs');
            const localPath = path.isAbsolute(fileName)
                ? fileName
                : path.join(scriptsPdfsDir, fileName);

            if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
                logger.info(`📁 Archivo local detectado\n`);
            }

            const result = await processInvoiceFromPath(fileName, bucketName);

            if (result.success) {
                if (result.skipped) {
                    logger.info(`⏭️  Ya procesado anteriormente`);
                    logger.info(`JSON: ${result.jsonPath}`);
                } else {
                    logger.info(`✅ Factura procesada exitosamente!`);
                    logger.info(`JSON: ${result.jsonPath}`);
                    if (result.data) {
                        const itemsCount = Array.isArray(result.data.lista_items) ? result.data.lista_items.length : 0;
                        logger.info(`Proveedor: ${result.data.proveedor || 'N/A'} | Items: ${itemsCount} | Total: ${result.data.total_factura || 'N/A'}`);
                    }
                }
            } else {
                logger.error(`❌ Error: ${result.error || 'Error desconocido'}`);
                process.exit(1);
            }

        } else {
            // MODO MASIVO
            logger.info(`📦 Procesando archivos nuevos del bucket: ${bucketName}\n`);
            const results = await processNewInvoices(bucketName);

            logger.info(`📊 Resumen: ${results.new} nuevos, ${results.successful || 0} exitosos, ${results.failed || 0} fallidos`);

            if (results.results && results.results.length > 0) {
                results.results.forEach((result) => {
                    if (result.success) {
                        logger.info(`✅ ${result.fileName}`);
                    } else {
                        logger.error(`❌ ${result.fileName}: ${result.error}`);
                    }
                });
            }
        }

        logger.info('\n✅ Completado');
        process.exit(0);

    } catch (error) {
        logger.error('❌ Error:', error.message);
        if (process.env.LOG_LEVEL === 'debug') {
            logger.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

main();
