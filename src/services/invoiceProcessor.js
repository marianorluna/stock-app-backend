/**
 * Procesador de facturas PDF a JSON
 */

import { Storage } from '@google-cloud/storage';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ProcessedInvoice from '../models/ProcessedInvoice.js';
import logger from '../config/logger.js';
import { getPrompt } from './promptService.js';

// Cargar variables de entorno si no están cargadas
if (!process.env.GEMINI_API_KEY) {
    dotenv.config();
    logger.debug('Variables de entorno cargadas con dotenv');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para construir credenciales desde variables de entorno
const buildCredentials = (prefix) => {
    try {
        const projectId = process.env[`${prefix}_PROJECT_ID`];
        const privateKeyId = process.env[`${prefix}_PRIVATE_KEY_ID`];
        let privateKey = process.env[`${prefix}_PRIVATE_KEY`];
        const clientEmail = process.env[`${prefix}_CLIENT_EMAIL`];
        const clientId = process.env[`${prefix}_CLIENT_ID`];
        const authUri = process.env[`${prefix}_AUTH_URI`];
        const tokenUri = process.env[`${prefix}_TOKEN_URI`];
        const authProviderCertUrl = process.env[`${prefix}_AUTH_PROVIDER_CERT_URL`] ||
            process.env[`${prefix}_AUTH_PROVIDER_X509_CERT_URL`];
        const clientCertUrl = process.env[`${prefix}_CLIENT_CERT_URL`] ||
            process.env[`${prefix}_CLIENT_X509_CERT_URL`];
        const universeDomain = process.env[`${prefix}_UNIVERSE_DOMAIN`];

        // Validar variables requeridas
        const missingVars = [];
        if (!projectId) missingVars.push(`${prefix}_PROJECT_ID`);
        if (!privateKey) missingVars.push(`${prefix}_PRIVATE_KEY`);
        if (!clientEmail) missingVars.push(`${prefix}_CLIENT_EMAIL`);

        if (missingVars.length > 0) {
            throw new Error(`Faltan variables de entorno para ${prefix}: ${missingVars.join(', ')}`);
        }

        // Procesar private key para manejar saltos de línea
        if (privateKey) {
            // Reemplazar \n literales con saltos de línea reales
            privateKey = privateKey.replace(/\\n/g, '\n');
            // Si está entre comillas, removerlas
            privateKey = privateKey.replace(/^["']|["']$/g, '');
            // Asegurar que tenga el formato correcto
            if (!privateKey.includes('BEGIN PRIVATE KEY')) {
                throw new Error(`La clave privada de ${prefix} no tiene el formato correcto`);
            }
        }

        const credentials = {
            type: 'service_account',
            project_id: projectId,
            private_key_id: privateKeyId,
            private_key: privateKey,
            client_email: clientEmail,
            client_id: clientId,
            auth_uri: authUri || 'https://accounts.google.com/o/oauth2/auth',
            token_uri: tokenUri || 'https://oauth2.googleapis.com/token',
            auth_provider_x509_cert_url: authProviderCertUrl || 'https://www.googleapis.com/oauth2/v1/certs',
            client_x509_cert_url: clientCertUrl,
            universe_domain: universeDomain || 'googleapis.com'
        };

        logger.debug(`Credenciales de ${prefix} construidas correctamente`, {
            projectId,
            clientEmail,
            hasPrivateKey: !!privateKey
        });

        return credentials;
    } catch (error) {
        logger.error(`Error construyendo credenciales de ${prefix}:`, error);
        throw error;
    }
};

// Configuración desde variables de entorno
const getConfig = () => {
    try {
        // Para Cloud Storage/Bucket (usando GCS_ como prefijo)
        const bucketProjectId = process.env.GCS_PROJECT_ID || process.env.GCP_PROJECT_ID || 'stockearly-app';

        // Nombre del bucket
        const bucketName = process.env.GCS_BUCKET_NAME || 'etama-facturas-pdf-gmail';

        // Gemini API Key
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
            logger.warn('⚠️  GEMINI_API_KEY no está configurada en las variables de entorno');
            logger.debug('Variables de entorno disponibles:', {
                hasGeminiKey: !!process.env.GEMINI_API_KEY,
                geminiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
                geminiKeyPreview: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : 'no definida'
            });
        } else {
            logger.debug('✅ GEMINI_API_KEY encontrada', {
                keyLength: geminiApiKey.length,
                keyPreview: `${geminiApiKey.substring(0, 10)}...`
            });
        }

        const config = {
            bucket: {
                projectId: bucketProjectId,
                name: bucketName,
                // Intentar primero con GCS_, luego con GCP_
                credentials: () => {
                    try {
                        return buildCredentials('GCS');
                    } catch (error) {
                        logger.warn('No se encontraron credenciales GCS_, intentando con GCP_...');
                        return buildCredentials('GCP');
                    }
                }
            },
            gemini: {
                apiKey: geminiApiKey
            }
        };

        logger.info('✅ Configuración cargada correctamente', {
            bucketProjectId: config.bucket.projectId,
            bucketName: config.bucket.name,
            hasGeminiKey: !!config.gemini.apiKey
        });

        return config;
    } catch (error) {
        logger.error('❌ Error cargando configuración:', error);
        throw error;
    }
};

const config = getConfig();

// Inicializar clientes
let storage = null;
let genAI = null;

const initializeClients = () => {
    const errors = [];

    // Inicializar Cloud Storage
    if (!storage) {
        try {
            const bucketCredentials = config.bucket.credentials();
            storage = new Storage({
                credentials: bucketCredentials,
                projectId: config.bucket.projectId
            });
            logger.info('✅ Cloud Storage inicializado correctamente');
        } catch (error) {
            logger.error('❌ Error inicializando Cloud Storage:', error);
            errors.push(`Cloud Storage: ${error.message}`);
        }
    }

    // Inicializar Gemini API
    if (!genAI) {
        if (config.gemini.apiKey) {
            try {
                logger.debug('Inicializando Gemini API...', {
                    apiKeyLength: config.gemini.apiKey.length,
                    apiKeyPreview: `${config.gemini.apiKey.substring(0, 10)}...`
                });
                genAI = new GoogleGenerativeAI(config.gemini.apiKey);
                logger.info('✅ Gemini API inicializado correctamente');
            } catch (error) {
                logger.error('❌ Error inicializando Gemini API:', error);
                errors.push(`Gemini API: ${error.message}`);
            }
        } else {
            logger.error('❌ GEMINI_API_KEY no está disponible en config.gemini.apiKey');
            logger.debug('Estado de config:', {
                hasGeminiConfig: !!config.gemini,
                hasApiKey: !!config.gemini?.apiKey,
                envVar: !!process.env.GEMINI_API_KEY
            });
            errors.push('Gemini API: GEMINI_API_KEY no configurada');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Errores en inicialización: ${errors.join('; ')}`);
    }
};

/**
 * Verifica si un archivo ya fue procesado
 */
export async function isFileProcessed(bucketName, fileName) {
    try {
        logger.debug(`Verificando si archivo fue procesado: ${fileName}`);
        const processed = await ProcessedInvoice.findOne({
            bucketName,
            fileName,
            status: 'success'
        });
        const wasProcessed = !!processed;
        logger.debug(`Archivo ${fileName} ${wasProcessed ? 'ya fue procesado' : 'no ha sido procesado'}`);
        return wasProcessed;
    } catch (error) {
        logger.error(`Error verificando si archivo fue procesado (${fileName}):`, error);
        // En caso de error, asumimos que no fue procesado para intentar procesarlo
        return false;
    }
}

/**
 * Marca un archivo como procesado en la BD
 */
export async function markAsProcessed(bucketName, fileName, jsonPath, invoiceData, error = null) {
    try {
        logger.debug(`Marcando archivo como procesado: ${fileName}`, {
            status: error ? 'failed' : 'success',
            hasJsonPath: !!jsonPath,
            hasData: !!invoiceData
        });

        const result = await ProcessedInvoice.findOneAndUpdate(
            { fileName, bucketName },
            {
                fileName,
                bucketName,
                jsonPath: jsonPath || '',
                invoiceData: invoiceData || {},
                status: error ? 'failed' : 'success',
                error: error || null,
                processedAt: new Date()
            },
            { upsert: true, new: true }
        );

        logger.info(`✅ Archivo marcado como procesado en MongoDB: ${fileName}`, {
            status: error ? 'failed' : 'success',
            id: result._id
        });

        return result;
    } catch (err) {
        logger.error(`❌ Error marcando archivo como procesado (${fileName}):`, {
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
}

/**
 * Descarga un PDF del bucket de Cloud Storage
 */
async function downloadPDFFromBucket(bucketName, fileName) {
    try {
        initializeClients();

        if (!storage) {
            throw new Error('Cloud Storage no está inicializado');
        }

        logger.info(`📥 Iniciando descarga de ${fileName} del bucket ${bucketName}...`);

        const bucket = storage.bucket(bucketName);

        // Verificar que el bucket existe
        const [bucketExists] = await bucket.exists();
        if (!bucketExists) {
            throw new Error(`El bucket ${bucketName} no existe o no tienes permisos para acceder`);
        }

        logger.debug(`Bucket ${bucketName} verificado correctamente`);

        const file = bucket.file(fileName);

        // Verificar que el archivo existe
        const [fileExists] = await file.exists();
        if (!fileExists) {
            throw new Error(`El archivo ${fileName} no existe en el bucket ${bucketName}`);
        }

        logger.debug(`Archivo ${fileName} encontrado en el bucket`);

        const tempPath = path.join(__dirname, '../../temp', fileName);
        const tempDir = path.dirname(tempPath);

        // Crear directorio temp si no existe
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            logger.debug(`Directorio temporal creado: ${tempDir}`);
        }

        logger.debug(`Descargando a: ${tempPath}`);
        await file.download({ destination: tempPath });

        // Verificar que el archivo se descargó correctamente
        if (!fs.existsSync(tempPath)) {
            throw new Error(`El archivo no se descargó correctamente a ${tempPath}`);
        }

        const stats = fs.statSync(tempPath);
        logger.info(`✅ PDF descargado correctamente: ${tempPath} (${(stats.size / 1024).toFixed(2)} KB)`);

        return tempPath;
    } catch (error) {
        logger.error(`❌ Error descargando PDF del bucket:`, {
            bucketName,
            fileName,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Procesa un PDF directamente con Gemini 2.5 Flash para extraer información estructurada
 */
async function processPdfWithGeminiDirectly(pdfPath) {
    try {
        initializeClients();

        if (!genAI) {
            throw new Error('Gemini API no está configurada. Verifica GEMINI_API_KEY en las variables de entorno.');
        }

        logger.info(`🤖 Iniciando procesamiento directo del PDF con Gemini 2.5 Flash: ${pdfPath}`);

        // Verificar que el archivo existe
        if (!fs.existsSync(pdfPath)) {
            throw new Error(`El archivo PDF no existe: ${pdfPath}`);
        }

        // Leer el archivo PDF como buffer
        const pdfBuffer = fs.readFileSync(pdfPath);
        const fileSize = pdfBuffer.length;

        logger.debug(`Archivo PDF leído: ${(fileSize / 1024).toFixed(2)} KB`);

        // Verificar tamaño máximo (Gemini tiene límites, típicamente 20MB)
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (fileSize > maxSize) {
            throw new Error(`El archivo PDF es demasiado grande: ${(fileSize / 1024 / 1024).toFixed(2)} MB (máximo: 20 MB)`);
        }

        // Convertir a base64
        const pdfBase64 = pdfBuffer.toString('base64');
        logger.debug(`PDF convertido a base64: ${(pdfBase64.length / 1024).toFixed(2)} KB`);

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Cargar prompt desde Cloud Storage
        const geminiPrompt = await getPrompt('invoice-extraction.md');
        const prompt = `${geminiPrompt}\n\nAnaliza el siguiente PDF de factura:`;

        logger.debug('Enviando PDF directamente a Gemini API...');

        // Enviar PDF directamente a Gemini
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: pdfBase64,
                    mimeType: 'application/pdf'
                }
            }
        ]);

        const response = await result.response;
        const text = response.text();

        logger.debug(`Respuesta de Gemini recibida: ${text.length} caracteres`);

        // Limpiar la respuesta para extraer solo el JSON
        let jsonText = text.trim();

        // Eliminar markdown code blocks si existen
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Parsear JSON
        let jsonData;
        try {
            jsonData = JSON.parse(jsonText);
            logger.debug('JSON parseado correctamente desde la respuesta de Gemini');
        } catch (parseError) {
            logger.warn('⚠️  Error parseando JSON de Gemini, intentando extraer JSON del texto...', {
                parseError: parseError.message,
                jsonTextPreview: jsonText.substring(0, 200)
            });

            // Intentar extraer JSON del texto si está embebido
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    jsonData = JSON.parse(jsonMatch[0]);
                    logger.info('✅ JSON extraído y parseado correctamente del texto');
                } catch (extractError) {
                    throw new Error(`No se pudo parsear el JSON extraído: ${extractError.message}`);
                }
            } else {
                throw new Error(`No se pudo extraer JSON válido de la respuesta de Gemini. Respuesta: ${jsonText.substring(0, 500)}`);
            }
        }

        // Validar estructura básica del JSON
        if (typeof jsonData !== 'object' || jsonData === null) {
            throw new Error('El JSON parseado no es un objeto válido');
        }

        logger.info(`✅ Datos estructurados obtenidos correctamente de Gemini`, {
            hasListaItems: Array.isArray(jsonData.lista_items),
            itemsCount: Array.isArray(jsonData.lista_items) ? jsonData.lista_items.length : 0,
            hasProveedor: !!jsonData.proveedor,
            hasFecha: !!jsonData.fecha
        });

        return jsonData;
    } catch (error) {
        logger.error(`❌ Error procesando PDF con Gemini:`, {
            pdfPath,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Genera el nombre del archivo JSON con formato invoice-YYYYMMDD-NN
 */
async function generateInvoiceFileName(fecha, outputDir = './output/invoices') {
    try {
        // Si no hay fecha, usar fecha actual
        let date = fecha ? new Date(fecha) : new Date();

        if (isNaN(date.getTime())) {
            logger.warn(`Fecha inválida proporcionada: ${fecha}, usando fecha actual`);
            date = new Date();
        }

        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

        logger.debug(`Generando nombre de archivo para fecha: ${dateStr}`);

        // Buscar en la BD los archivos procesados de ese día
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const processedToday = await ProcessedInvoice.find({
            processedAt: {
                $gte: startOfDay,
                $lte: endOfDay
            },
            jsonPath: new RegExp(`invoice-${dateStr}-\\d+\\.json$`)
        }).sort({ jsonPath: -1 }).limit(1);

        let nextNumber = 1;
        if (processedToday.length > 0) {
            const lastFile = processedToday[0].jsonPath;
            const match = lastFile.match(new RegExp(`invoice-${dateStr}-(\\d+)\\.json$`));
            if (match) {
                nextNumber = parseInt(match[1], 10) + 1;
                logger.debug(`Último archivo del día: ${lastFile}, siguiente número: ${nextNumber}`);
            }
        }

        const numberStr = String(nextNumber).padStart(2, '0');
        const fileName = `invoice-${dateStr}-${numberStr}.json`;

        logger.debug(`Nombre de archivo generado: ${fileName}`);

        return fileName;
    } catch (error) {
        logger.error('Error generando nombre de archivo:', error);
        // Fallback: usar timestamp si hay error
        const timestamp = Date.now();
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const fileName = `invoice-${dateStr}-${String(timestamp).slice(-2)}.json`;
        logger.warn(`Usando nombre de archivo de fallback: ${fileName}`);
        return fileName;
    }
}

/**
 * Guarda el JSON procesado en el sistema de archivos
 */
async function saveInvoiceJSON(data, outputDir = './output/invoices') {
    try {
        logger.info(`💾 Guardando JSON procesado...`);

        // Crear directorio si no existe
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            logger.debug(`Directorio de salida creado: ${outputDir}`);
        }

        // Obtener fecha de los datos o usar fecha actual
        const fecha = data.fecha || new Date().toISOString().split('T')[0];

        logger.debug(`Fecha de factura: ${fecha}`);

        // Generar nombre de archivo
        const fileName = await generateInvoiceFileName(fecha, outputDir);
        const filePath = path.join(outputDir, fileName);

        // Validar que el directorio existe antes de escribir
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Guardar JSON
        const jsonContent = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonContent, 'utf-8');

        // Verificar que se guardó correctamente
        if (!fs.existsSync(filePath)) {
            throw new Error(`El archivo JSON no se guardó correctamente: ${filePath}`);
        }

        const stats = fs.statSync(filePath);
        logger.info(`✅ JSON guardado correctamente: ${filePath} (${(stats.size / 1024).toFixed(2)} KB)`);

        return filePath;
    } catch (error) {
        logger.error(`❌ Error guardando JSON:`, {
            error: error.message,
            stack: error.stack,
            outputDir
        });
        throw error;
    }
}

/**
 * Procesa una factura desde una ruta local o del bucket
 * Detecta automáticamente si es un archivo local o del bucket
 */
export async function processInvoiceFromPath(filePathOrName, bucketName = null) {
    const startTime = Date.now();
    let tempPdfPath = null;
    let isLocalFile = false;
    let actualFileName = '';
    let actualBucketName = bucketName || config.bucket.name;

    try {
        // Verificar si es un archivo local
        const scriptsPdfsDir = path.join(__dirname, '../../scripts/pdfs');
        const localPath = path.isAbsolute(filePathOrName)
            ? filePathOrName
            : path.join(scriptsPdfsDir, filePathOrName);

        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
            // Es un archivo local
            isLocalFile = true;
            actualFileName = path.basename(localPath);
            tempPdfPath = localPath;
            logger.info(`📁 Archivo local detectado: ${localPath}`);
        } else {
            // Asumir que es del bucket
            isLocalFile = false;
            actualFileName = filePathOrName;
            logger.info(`☁️  Archivo del bucket: ${actualFileName}`);
        }

        // Verificar si ya fue procesado (solo para archivos del bucket)
        if (!isLocalFile) {
            const alreadyProcessed = await isFileProcessed(actualBucketName, actualFileName);
            if (alreadyProcessed) {
                logger.info(`⏭️  Archivo ${actualFileName} ya fue procesado anteriormente, omitiendo...`);
                const processed = await ProcessedInvoice.findOne({
                    bucketName: actualBucketName,
                    fileName: actualFileName
                });
                return {
                    success: true,
                    skipped: true,
                    jsonPath: processed.jsonPath,
                    data: processed.invoiceData,
                    message: 'Archivo ya procesado anteriormente'
                };
            }
        }

        // Si es del bucket, descargarlo primero
        if (!isLocalFile) {
            logger.info(`📥 Paso 1/3: Descargando PDF del bucket...`);
            tempPdfPath = await downloadPDFFromBucket(actualBucketName, actualFileName);
        } else {
            logger.info(`📁 Paso 1/3: Usando archivo local...`);
        }

        // Procesar PDF directamente con Gemini
        logger.info(`🤖 Paso 2/3: Procesando PDF directamente con Gemini 2.5 Flash...`);
        const structuredData = await processPdfWithGeminiDirectly(tempPdfPath);

        // Guardar JSON
        logger.info(`💾 Paso 3/3: Guardando JSON...`);
        const jsonPath = await saveInvoiceJSON(structuredData);

        // Marcar como procesado en BD
        logger.info(`📝 Marcando como procesado en MongoDB...`);
        const bucketNameForDb = isLocalFile ? 'local' : actualBucketName;
        await markAsProcessed(bucketNameForDb, actualFileName, jsonPath, structuredData);

        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.info(`✅ Factura procesada exitosamente: ${actualFileName}`, {
            processingTime: `${processingTime}s`,
            jsonPath,
            itemsCount: Array.isArray(structuredData.lista_items) ? structuredData.lista_items.length : 0,
            source: isLocalFile ? 'local' : 'bucket'
        });

        return {
            success: true,
            jsonPath,
            data: structuredData,
            processingTime: `${processingTime}s`,
            source: isLocalFile ? 'local' : 'bucket'
        };

    } catch (error) {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.error(`❌ Error procesando factura ${actualFileName || filePathOrName}:`, {
            error: error.message,
            stack: error.stack,
            processingTime: `${processingTime}s`,
            isLocalFile,
            bucketName: actualBucketName
        });

        // Marcar como fallido en BD
        try {
            const bucketNameForDb = isLocalFile ? 'local' : actualBucketName;
            await markAsProcessed(bucketNameForDb, actualFileName || filePathOrName, '', null, error.message);
            logger.debug(`Estado de fallo guardado en MongoDB`);
        } catch (dbError) {
            logger.error(`Error guardando estado de fallo en MongoDB:`, {
                error: dbError.message,
                originalError: error.message
            });
        }

        throw error;
    } finally {
        // Limpiar archivo temporal solo si fue descargado del bucket
        if (tempPdfPath && !isLocalFile && fs.existsSync(tempPdfPath)) {
            try {
                // Solo eliminar si está en la carpeta temp (descargado del bucket)
                if (tempPdfPath.includes(path.join(__dirname, '../../temp'))) {
                    fs.unlinkSync(tempPdfPath);
                    logger.debug(`Archivo temporal eliminado: ${tempPdfPath}`);
                }
            } catch (cleanupError) {
                logger.warn(`⚠️  Error eliminando archivo temporal (${tempPdfPath}):`, cleanupError.message);
            }
        }
    }
}

/**
 * Procesa una factura completa: descarga, OCR, Gemini, guarda JSON
 */
export async function processInvoice(bucketName, fileName) {
    let tempPdfPath = null;
    const startTime = Date.now();

    try {
        logger.info(`🚀 Iniciando procesamiento de factura: ${fileName}`, {
            bucketName,
            fileName
        });

        // Verificar si ya fue procesado
        const alreadyProcessed = await isFileProcessed(bucketName, fileName);
        if (alreadyProcessed) {
            logger.info(`⏭️  Archivo ${fileName} ya fue procesado anteriormente, omitiendo...`);
            const processed = await ProcessedInvoice.findOne({ bucketName, fileName });
            return {
                success: true,
                skipped: true,
                jsonPath: processed.jsonPath,
                data: processed.invoiceData,
                message: 'Archivo ya procesado anteriormente'
            };
        }

        // 1. Descargar PDF del bucket
        logger.info(`📥 Paso 1/3: Descargando PDF del bucket...`);
        tempPdfPath = await downloadPDFFromBucket(bucketName, fileName);

        // 2. Procesar PDF directamente con Gemini
        logger.info(`🤖 Paso 2/3: Procesando PDF directamente con Gemini 2.5 Flash...`);
        const structuredData = await processPdfWithGeminiDirectly(tempPdfPath);

        // 3. Guardar JSON
        logger.info(`💾 Paso 3/3: Guardando JSON...`);
        const jsonPath = await saveInvoiceJSON(structuredData);

        // 5. Marcar como procesado en BD
        logger.info(`📝 Marcando como procesado en MongoDB...`);
        await markAsProcessed(bucketName, fileName, jsonPath, structuredData);

        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.info(`✅ Factura procesada exitosamente: ${fileName}`, {
            processingTime: `${processingTime}s`,
            jsonPath,
            itemsCount: Array.isArray(structuredData.lista_items) ? structuredData.lista_items.length : 0
        });

        return {
            success: true,
            jsonPath,
            data: structuredData,
            processingTime: `${processingTime}s`
        };

    } catch (error) {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.error(`❌ Error procesando factura ${fileName}:`, {
            error: error.message,
            stack: error.stack,
            processingTime: `${processingTime}s`,
            bucketName,
            fileName
        });

        // Marcar como fallido en BD
        try {
            await markAsProcessed(bucketName, fileName, '', null, error.message);
            logger.debug(`Estado de fallo guardado en MongoDB para: ${fileName}`);
        } catch (dbError) {
            logger.error(`Error guardando estado de fallo en MongoDB:`, {
                error: dbError.message,
                originalError: error.message
            });
        }

        throw error;
    } finally {
        // Limpiar archivo temporal
        if (tempPdfPath && fs.existsSync(tempPdfPath)) {
            try {
                fs.unlinkSync(tempPdfPath);
                logger.debug(`Archivo temporal eliminado: ${tempPdfPath}`);
            } catch (cleanupError) {
                logger.warn(`⚠️  Error eliminando archivo temporal (${tempPdfPath}):`, cleanupError.message);
            }
        }
    }
}

/**
 * Lista todos los PDFs en el bucket y procesa los nuevos
 */
export async function processNewInvoices(bucketName = null) {
    try {
        initializeClients();

        const targetBucket = bucketName || config.bucket.name;

        logger.info(`🔍 Buscando facturas nuevas en el bucket: ${targetBucket}`);

        if (!storage) {
            throw new Error('Cloud Storage no está inicializado');
        }

        const bucket = storage.bucket(targetBucket);

        // Verificar que el bucket existe
        const [bucketExists] = await bucket.exists();
        if (!bucketExists) {
            throw new Error(`El bucket ${targetBucket} no existe o no tienes permisos para acceder`);
        }

        logger.debug(`Bucket ${targetBucket} verificado correctamente`);

        // Listar archivos
        logger.debug('Listando archivos del bucket...');
        const [files] = await bucket.getFiles({ prefix: '' });

        logger.debug(`Total de archivos en bucket: ${files.length}`);

        // Filtrar solo PDFs
        const pdfFiles = files.filter(file =>
            file.name.toLowerCase().endsWith('.pdf')
        );

        logger.info(`📋 PDFs encontrados en el bucket: ${pdfFiles.length}`);

        // Obtener lista de archivos ya procesados desde MongoDB
        logger.debug('Consultando archivos procesados en MongoDB...');
        const processedFiles = await ProcessedInvoice.find({
            bucketName: targetBucket,
            status: 'success'
        }).select('fileName').lean();

        const processedFileNames = new Set(processedFiles.map(f => f.fileName));
        logger.debug(`Archivos ya procesados: ${processedFileNames.size}`);

        // Filtrar archivos no procesados
        const newFiles = pdfFiles.filter(file =>
            !processedFileNames.has(file.name)
        );

        logger.info(`📊 Resumen: ${pdfFiles.length} PDFs totales, ${newFiles.length} nuevos para procesar`);

        if (newFiles.length === 0) {
            logger.info('✅ No hay archivos nuevos para procesar');
            return {
                total: pdfFiles.length,
                processed: processedFileNames.size,
                new: 0,
                results: []
            };
        }

        const results = [];
        let successCount = 0;
        let failedCount = 0;

        logger.info(`🚀 Iniciando procesamiento de ${newFiles.length} archivos nuevos...`);

        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i];
            const fileNumber = i + 1;

            logger.info(`\n[${fileNumber}/${newFiles.length}] Procesando: ${file.name}`);

            try {
                const result = await processInvoice(targetBucket, file.name);
                results.push({
                    fileName: file.name,
                    ...result
                });
                successCount++;
                logger.info(`✅ [${fileNumber}/${newFiles.length}] ${file.name} procesado exitosamente`);
            } catch (error) {
                results.push({
                    fileName: file.name,
                    success: false,
                    error: error.message
                });
                failedCount++;
                logger.error(`❌ [${fileNumber}/${newFiles.length}] ${file.name} falló:`, error.message);
            }
        }

        logger.info(`\n📊 Procesamiento completado:`, {
            total: newFiles.length,
            successful: successCount,
            failed: failedCount
        });

        return {
            total: pdfFiles.length,
            processed: processedFileNames.size,
            new: newFiles.length,
            successful: successCount,
            failed: failedCount,
            results
        };
    } catch (error) {
        logger.error('❌ Error listando archivos del bucket:', {
            error: error.message,
            stack: error.stack,
            bucketName: targetBucket
        });
        throw error;
    }
}

/**
 * Obtiene el historial de facturas procesadas
 */
export async function getProcessedInvoicesHistory(limit = 50, skip = 0) {
    try {
        logger.debug(`Obteniendo historial de facturas procesadas`, { limit, skip });

        const invoices = await ProcessedInvoice.find()
            .sort({ processedAt: -1 })
            .limit(limit)
            .skip(skip)
            .lean();

        const total = await ProcessedInvoice.countDocuments();

        logger.info(`✅ Historial obtenido: ${invoices.length} facturas (total: ${total})`);

        return {
            invoices,
            total,
            limit,
            skip,
            hasMore: (skip + limit) < total
        };
    } catch (error) {
        logger.error('❌ Error obteniendo historial:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Verifica la configuración y conexiones
 */
export async function verifyConfiguration() {
    const status = {
        config: {
            bucket: false,
            gemini: false
        },
        connections: {
            storage: false,
            gemini: false
        },
        errors: []
    };

    try {
        // Verificar configuración
        logger.info('🔍 Verificando configuración...');

        try {
            const bucketCreds = config.bucket.credentials();
            status.config.bucket = true;
            logger.info('✅ Configuración de Cloud Storage: OK');
        } catch (error) {
            status.config.bucket = false;
            status.errors.push(`Cloud Storage config: ${error.message}`);
            logger.error('❌ Configuración de Cloud Storage: FALLO', error.message);
        }

        if (config.gemini.apiKey) {
            status.config.gemini = true;
            logger.info('✅ Configuración de Gemini: OK');
        } else {
            status.config.gemini = false;
            status.errors.push('Gemini API Key no configurada');
            logger.error('❌ Configuración de Gemini: FALLO - API Key no configurada');
        }

        // Verificar conexiones
        logger.info('🔍 Verificando conexiones...');

        try {
            initializeClients();

            if (storage) {
                // En lugar de listar todos los buckets, verificar acceso al bucket específico
                const bucketName = config.bucket.name;
                const bucket = storage.bucket(bucketName);

                // Verificar que el bucket existe y tenemos acceso
                const [bucketExists] = await bucket.exists();
                if (bucketExists) {
                    status.connections.storage = true;
                    logger.info(`✅ Conexión a Cloud Storage: OK (bucket ${bucketName} accesible)`);
                } else {
                    throw new Error(`El bucket ${bucketName} no existe o no tienes acceso`);
                }
            }
        } catch (error) {
            status.connections.storage = false;
            status.errors.push(`Cloud Storage connection: ${error.message}`);
            logger.error('❌ Conexión a Cloud Storage: FALLO', error.message);
        }

        if (genAI) {
            status.connections.gemini = true;
            logger.info('✅ Conexión a Gemini API: OK');
        } else {
            status.connections.gemini = false;
            status.errors.push('Gemini API no inicializado');
            logger.error('❌ Conexión a Gemini API: FALLO');
        }

        // MongoDB se verifica y conecta en el paso 2 del script, no aquí

        const allOk = Object.values(status.config).every(v => v) &&
            Object.values(status.connections).every(v => v);

        if (allOk) {
            logger.info('✅ Todas las verificaciones pasaron correctamente');
        } else {
            logger.warn('⚠️  Algunas verificaciones fallaron. Revisa los errores arriba.');
        }

        return status;
    } catch (error) {
        logger.error('❌ Error en verificación de configuración:', error);
        status.errors.push(`Verification error: ${error.message}`);
        return status;
    }
}
