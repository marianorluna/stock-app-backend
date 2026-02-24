import { Storage } from '@google-cloud/storage';
import logger from '../config/logger.js';
import dotenv from 'dotenv';

// Cargar variables de entorno si no están cargadas
if (!process.env.GCS_PROJECT_ID) {
    dotenv.config();
}

// Configuración del bucket de prompts
const PROMPTS_BUCKET_NAME = process.env.GCS_BUCKET_PROMPTS_NAME || 'etama-prompts';
const PROMPTS_BUCKET_PROJECT_ID = process.env.GCS_PROJECT_ID || 'stockearly-app';

// Cache de prompts con metadatos: { content: string, etag: string, updated: string, timestamp: number }
const promptsCache = new Map();

// TTL del cache como respaldo (en milisegundos) - por defecto 24 horas
const CACHE_TTL_MS = parseInt(process.env.PROMPTS_CACHE_TTL_MS || '86400000', 10); // 24 horas

// Cliente de Storage (se inicializa cuando sea necesario)
let storage = null;

/**
 * Construye credenciales desde variables de entorno
 */
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

        const missingVars = [];
        if (!projectId) missingVars.push(`${prefix}_PROJECT_ID`);
        if (!privateKey) missingVars.push(`${prefix}_PRIVATE_KEY`);
        if (!clientEmail) missingVars.push(`${prefix}_CLIENT_EMAIL`);

        if (missingVars.length > 0) {
            throw new Error(`Faltan variables de entorno para ${prefix}: ${missingVars.join(', ')}`);
        }

        if (privateKey) {
            privateKey = privateKey.replace(/\\n/g, '\n');
            privateKey = privateKey.replace(/^["']|["']$/g, '');
            if (!privateKey.includes('BEGIN PRIVATE KEY')) {
                throw new Error(`La clave privada de ${prefix} no tiene el formato correcto`);
            }
        }

        return {
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
    } catch (error) {
        logger.error(`Error construyendo credenciales de ${prefix}:`, error);
        throw error;
    }
};

/**
 * Inicializa el cliente de Storage
 */
const initializeStorage = () => {
    if (storage) {
        return storage;
    }

    try {
        let credentials;
        try {
            credentials = buildCredentials('GCS');
        } catch (error) {
            logger.warn('No se encontraron credenciales GCS_, intentando con GCP_...');
            credentials = buildCredentials('GCP');
        }

        storage = new Storage({
            credentials,
            projectId: PROMPTS_BUCKET_PROJECT_ID
        });

        logger.info('✅ Cliente de Storage para prompts inicializado correctamente');
        return storage;
    } catch (error) {
        logger.error('❌ Error inicializando Storage para prompts:', error);
        throw error;
    }
};

/**
 * Verifica si un prompt en cache está actualizado comparando ETag y fecha de actualización
 */
const isCacheValid = (cached, currentETag, currentUpdated) => {
    // Verificar ETag (más confiable)
    if (cached.etag === currentETag) {
        return true;
    }

    // Si el ETag cambió, el archivo fue modificado
    if (cached.etag !== currentETag) {
        return false;
    }

    // Verificar TTL como respaldo (por si acaso el ETag no está disponible)
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL_MS) {
        logger.debug(`Cache expirado por TTL (edad: ${Math.round(age / 1000 / 60)} minutos)`);
        return false;
    }

    return true;
};

/**
 * Carga un prompt desde Cloud Storage
 * @param {string} promptName - Nombre del archivo del prompt (ej: 'invoice-extraction.md')
 * @param {boolean} forceRefresh - Si es true, fuerza la recarga desde Cloud Storage
 * @returns {Promise<string>} El contenido del prompt
 */
export async function getPrompt(promptName, forceRefresh = false) {
    try {
        // Inicializar Storage si no está inicializado
        const storageClient = initializeStorage();

        // Obtener metadatos del archivo para verificar si cambió
        const bucket = storageClient.bucket(PROMPTS_BUCKET_NAME);

        // Verificar que el bucket existe
        const [bucketExists] = await bucket.exists();
        if (!bucketExists) {
            throw new Error(`El bucket ${PROMPTS_BUCKET_NAME} no existe o no tienes permisos para acceder`);
        }

        const file = bucket.file(promptName);
        const [fileExists] = await file.exists();

        if (!fileExists) {
            throw new Error(`El archivo de prompt '${promptName}' no existe en el bucket ${PROMPTS_BUCKET_NAME}`);
        }

        // Obtener metadatos del archivo
        const [metadata] = await file.getMetadata();
        const currentETag = metadata.etag;
        const currentUpdated = metadata.updated;

        // Verificar cache (solo si no se fuerza refresh)
        if (!forceRefresh && promptsCache.has(promptName)) {
            const cached = promptsCache.get(promptName);

            // Verificar si el cache es válido comparando ETag y fecha
            if (isCacheValid(cached, currentETag, currentUpdated)) {
                const age = Math.round((Date.now() - cached.timestamp) / 1000);
                logger.debug(`📋 Prompt '${promptName}' cargado desde cache (edad: ${age}s, ETag: ${currentETag.substring(0, 8)}...)`);
                return cached.content;
            } else {
                logger.info(`🔄 Prompt '${promptName}' actualizado en bucket (ETag cambió), recargando...`);
                promptsCache.delete(promptName);
            }
        }

        // Descargar prompt desde Cloud Storage
        if (forceRefresh) {
            logger.info(`🔄 Recargando prompt '${promptName}' desde Cloud Storage (forzado)...`);
        } else {
            logger.info(`📥 Cargando prompt '${promptName}' desde Cloud Storage...`);
        }

        // Descargar el contenido del archivo
        const [contents] = await file.download();
        const promptText = contents.toString('utf-8');

        // Guardar en cache con metadatos
        promptsCache.set(promptName, {
            content: promptText,
            etag: currentETag,
            updated: currentUpdated,
            timestamp: Date.now()
        });

        logger.info(`✅ Prompt '${promptName}' cargado correctamente desde Cloud Storage (${promptText.length} caracteres, ETag: ${currentETag.substring(0, 8)}...)`);
        return promptText;

    } catch (error) {
        logger.error(`❌ Error cargando prompt '${promptName}':`, error);
        throw error;
    }
}

/**
 * Limpia el cache de prompts
 */
export function clearPromptsCache() {
    const count = promptsCache.size;
    promptsCache.clear();
    logger.info(`🗑️  Cache de prompts limpiado (${count} prompts eliminados)`);
    return count;
}

/**
 * Obtiene información del cache actual
 */
export function getCacheInfo() {
    const info = {
        total: promptsCache.size,
        prompts: []
    };

    for (const [name, cached] of promptsCache.entries()) {
        const age = Date.now() - cached.timestamp;
        info.prompts.push({
            name,
            size: cached.content.length,
            ageSeconds: Math.round(age / 1000),
            ageMinutes: Math.round(age / 1000 / 60),
            etag: cached.etag?.substring(0, 16) + '...',
            updated: cached.updated
        });
    }

    return info;
}

/**
 * Recarga un prompt específico desde Cloud Storage
 */
export async function reloadPrompt(promptName) {
    return await getPrompt(promptName, true);
}

/**
 * Recarga todos los prompts en cache
 */
export async function reloadAllPrompts() {
    const promptNames = Array.from(promptsCache.keys());
    logger.info(`🔄 Recargando ${promptNames.length} prompts desde Cloud Storage...`);

    const results = {};
    for (const promptName of promptNames) {
        try {
            const prompt = await getPrompt(promptName, true);
            results[promptName] = { success: true, length: prompt.length };
        } catch (error) {
            results[promptName] = { success: false, error: error.message };
            logger.error(`❌ Error recargando '${promptName}':`, error);
        }
    }

    const successCount = Object.values(results).filter(r => r.success).length;
    logger.info(`✅ Recarga completada: ${successCount}/${promptNames.length} prompts recargados correctamente`);

    return results;
}

/**
 * Precarga todos los prompts necesarios
 */
export async function preloadPrompts() {
    const requiredPrompts = [
        'invoice-extraction.md',      // GEMINI_PROMPT
        'item-interpretation.md',     // ITEM_INTERPRETATION_PROMPT
        'matching.md',                // MATCHING_PROMPT
        'batch-processing.md'         // BATCH_PROCESSING_PROMPT
    ];

    logger.info(`🔄 Precargando ${requiredPrompts.length} prompts desde Cloud Storage...`);

    const results = {};
    for (const promptName of requiredPrompts) {
        try {
            const prompt = await getPrompt(promptName);
            results[promptName] = { success: true, length: prompt.length };
        } catch (error) {
            results[promptName] = { success: false, error: error.message };
            logger.error(`❌ Error precargando '${promptName}':`, error);
        }
    }

    const successCount = Object.values(results).filter(r => r.success).length;
    logger.info(`✅ Precarga completada: ${successCount}/${requiredPrompts.length} prompts cargados correctamente`);

    return results;
}

/**
 * Obtiene el nombre del archivo de prompt según el tipo
 */
export function getPromptFileName(promptType) {
    const promptMap = {
        'invoice-extraction': 'invoice-extraction.md',
        'item-interpretation': 'item-interpretation.md',
        'matching': 'matching.md',
        'batch-processing': 'batch-processing.md'
    };

    return promptMap[promptType] || null;
}