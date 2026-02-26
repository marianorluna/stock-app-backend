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

// TTL del cache (por defecto 1 hora). Configurable con PROMPTS_CACHE_TTL_MS.
const CACHE_TTL_MS = parseInt(process.env.PROMPTS_CACHE_TTL_MS || '3600000', 10);

// Cache principal: Map<promptName, { content: string, timestamp: number }>
const promptsCache = new Map();

// Request deduplication: Map<promptName, Promise<string>>
// Evita que múltiples llamadas concurrentes descarguen el mismo prompt a la vez.
const inFlightRequests = new Map();

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
 * Inicializa el cliente de Storage (singleton)
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
 * Descarga un prompt desde Cloud Storage y lo guarda en cache.
 * Función interna — 1 sola llamada de red.
 * @param {string} promptName
 * @returns {Promise<string>}
 */
async function _downloadPrompt(promptName) {
    const storageClient = initializeStorage();
    const bucket = storageClient.bucket(PROMPTS_BUCKET_NAME);
    const file = bucket.file(promptName);

    logger.info(`📥 Cargando prompt '${promptName}' desde Cloud Storage...`);

    try {
        const [contents] = await file.download();
        const promptText = contents.toString('utf-8');

        promptsCache.set(promptName, {
            content: promptText,
            timestamp: Date.now()
        });

        logger.info(`✅ Prompt '${promptName}' cargado correctamente desde Cloud Storage (${promptText.length} caracteres)`);
        return promptText;
    } catch (error) {
        logger.error(`❌ Error cargando prompt '${promptName}':`, error);
        throw error;
    }
}

/**
 * Lanza un refresco en background (patrón SWR).
 * Retorna inmediatamente; los errores no se propagan al caller.
 * @param {string} promptName
 */
function _backgroundRefresh(promptName) {
    if (inFlightRequests.has(promptName)) return; // ya hay un refresco en curso

    logger.debug(`🔄 Refrescando prompt '${promptName}' en background (cache vencido)...`);

    const promise = _downloadPrompt(promptName)
        .then(() => logger.debug(`✅ Background refresh completado: '${promptName}'`))
        .catch(err => logger.warn(`⚠️ Background refresh fallido para '${promptName}': ${err.message}`))
        .finally(() => inFlightRequests.delete(promptName));

    inFlightRequests.set(promptName, promise);
}

/**
 * Obtiene el contenido de un prompt.
 *
 * Estrategia (Lazy + TTL Cache + Stale-While-Revalidate):
 *  - Cache fresco (dentro del TTL)  → retorna inmediatamente, 0 llamadas de red.
 *  - Cache vencido (pasado el TTL)  → retorna el contenido viejo inmediatamente
 *                                     y lanza un refresco en background.
 *  - Sin cache (primera vez)        → descarga lazy, con request deduplication
 *                                     para evitar descargas duplicadas concurrentes.
 *
 * @param {string} promptName - Nombre del archivo (ej: 'invoice-extraction.md')
 * @param {boolean} forceRefresh - Si true, invalida el cache y fuerza descarga inmediata
 * @returns {Promise<string>} El contenido del prompt
 */
export async function getPrompt(promptName, forceRefresh = false) {
    if (forceRefresh) {
        promptsCache.delete(promptName);
        inFlightRequests.delete(promptName);
    }

    // 1. Cache hit fresco → 0 llamadas de red
    if (promptsCache.has(promptName)) {
        const cached = promptsCache.get(promptName);
        const age = Date.now() - cached.timestamp;

        if (age < CACHE_TTL_MS) {
            logger.debug(`📋 Prompt '${promptName}' servido desde cache (edad: ${Math.round(age / 1000)}s)`);
            return cached.content;
        }

        // Cache vencido → SWR: devolver contenido viejo + refrescar en background sin bloquear
        logger.debug(`⏳ Cache vencido para '${promptName}', lanzando refresh en background`);
        _backgroundRefresh(promptName);
        return cached.content;
    }

    // 2. Request deduplication: si ya hay una descarga en curso, esperar la misma Promise
    if (inFlightRequests.has(promptName)) {
        logger.debug(`⏳ Prompt '${promptName}' ya se está descargando, esperando...`);
        return inFlightRequests.get(promptName);
    }

    // 3. Primera carga (lazy) — registrar Promise para deduplication
    const promise = _downloadPrompt(promptName).finally(() => inFlightRequests.delete(promptName));
    inFlightRequests.set(promptName, promise);
    return promise;
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
        ttlMs: CACHE_TTL_MS,
        prompts: []
    };

    for (const [name, cached] of promptsCache.entries()) {
        const age = Date.now() - cached.timestamp;
        const remainingTtl = Math.max(0, CACHE_TTL_MS - age);
        info.prompts.push({
            name,
            size: cached.content.length,
            ageSeconds: Math.round(age / 1000),
            ageMinutes: Math.round(age / 1000 / 60),
            remainingTtlSeconds: Math.round(remainingTtl / 1000),
            fresh: age < CACHE_TTL_MS
        });
    }

    return info;
}

/**
 * Recarga un prompt específico desde Cloud Storage (fuerza descarga inmediata)
 */
export async function reloadPrompt(promptName) {
    return await getPrompt(promptName, true);
}

/**
 * Recarga todos los prompts que están actualmente en cache
 */
export async function reloadAllPrompts() {
    const promptNames = Array.from(promptsCache.keys());

    if (promptNames.length === 0) {
        logger.info('ℹ️  No hay prompts en cache para recargar');
        return {};
    }

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
