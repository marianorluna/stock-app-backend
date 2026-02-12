/**
 * Script temporal para restablecer la contraseña de todos los usuarios de Firebase.
 * Uso: node scripts/resetAllPasswords.js <nuevaContraseña>
 * Ejemplo: node scripts/resetAllPasswords.js Etama123+
 *
 * IMPORTANTE: Eliminar este script después de usarlo por seguridad.
 */

import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const newPassword = process.argv[2];

if (!newPassword || newPassword.length < 6) {
    console.error('Uso: node scripts/resetAllPasswords.js <nuevaContraseña>');
    console.error('La contraseña debe tener al menos 6 caracteres.');
    process.exit(1);
}

const initFirebase = () => {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
        throw new Error('Faltan variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en .env');
    }
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey
        })
    });
};

const resetAllPasswords = async () => {
    initFirebase();

    let nextPageToken;
    let totalUpdated = 0;

    do {
        const listResult = await admin.auth().listUsers(1000, nextPageToken);

        for (const user of listResult.users) {
            if (user.email) {
                await admin.auth().updateUser(user.uid, { password: newPassword });
                console.log(`✅ ${user.email} (${user.uid})`);
                totalUpdated++;
            }
        }

        nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    console.log(`\n🎉 Contraseña actualizada para ${totalUpdated} usuario(s).`);
    process.exit(0);
};

resetAllPasswords().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});