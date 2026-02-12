import admin from 'firebase-admin';
import logger from './logger.js';

let firebaseApp = null;

//inicializa Firebase Admin SDK con las credenciales del servicio
export const initializeFirebase = () => {
    if (firebaseApp) {
        return firebaseApp;
    }

    try {
        //usar variables de entorno para configuración
        if (process.env.FIREBASE_PROJECT_ID) {
            //procesar el private key para manejar diferentes formatos de saltos de línea
            let privateKey = process.env.FIREBASE_PRIVATE_KEY;
            if (privateKey) {
                //reemplazar \n literales con saltos de línea reales
                privateKey = privateKey.replace(/\\n/g, '\n');
                //si aún no tiene saltos de línea, intentar agregarlos en las posiciones correctas
                if (!privateKey.includes('\n') && privateKey.includes('-----')) {
                    //formato sin saltos de línea, intentar agregarlos
                    privateKey = privateKey.replace(/(-----BEGIN[^-]+-----)/, '$1\n')
                        .replace(/(-----END[^-]+-----)/, '\n$1')
                        .replace(/(.{64})/g, '$1\n')
                        .replace(/\n\n/g, '\n');
                }
            }

            if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
                throw new Error('Firebase credentials incomplete. Check FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL');
            }

            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
        } else {
            throw new Error('Firebase configuration not found. Set FIREBASE_PROJECT_ID in .env');
        }

        logger.info('Firebase Admin initialized successfully 🔥');
        return firebaseApp;
    } catch (error) {
        logger.error('Firebase initialization error', {
            error: error.message,
            hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
            hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
            hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY
        });
        throw error;
    }
};

//verifica el token de Firebase y retorna el payload decodificado
export const verifyIdToken = async (idToken) => {
    try {
        if (!firebaseApp) {
            throw new Error('Firebase Admin not initialized. Make sure initializeFirebase() was called.');
        }
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        logger.error('Token verification failed', {
            error: error.message,
            code: error.code,
            errorInfo: error.errorInfo
        });
        throw error;
    }
};

export default firebaseApp;

