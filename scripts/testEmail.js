/**
 * Script de prueba de envío de email
 * Uso: npm run test:email
 *      npm run test:email -- --to otro@correo.com
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// ── Destinatario: argumento --to=email o EMAIL_USER por defecto ──────────────
const toArgInline = process.argv.find(a => a.startsWith('--to='))?.split('=')[1];
const toArgIdx = process.argv.indexOf('--to');
const toArgSpace = toArgIdx !== -1 ? process.argv[toArgIdx + 1] : undefined;
const TO = toArgInline ?? toArgSpace ?? process.env.EMAIL_USER;

// ── Configuración SMTP ────────────────────────────────────────────────────────
const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM } = process.env;

if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    console.error('❌ Faltan variables de entorno: EMAIL_HOST, EMAIL_USER, EMAIL_PASS');
    process.exit(1);
}

const port = Number(EMAIL_PORT) || 465;

console.log('\n📧 Configuración SMTP detectada:');
console.log(`   HOST : ${EMAIL_HOST}`);
console.log(`   PORT : ${port}`);
console.log(`   SSL  : ${port === 465 ? 'sí (secure: true)' : 'no (STARTTLS)'}`);
console.log(`   USER : ${EMAIL_USER}`);
console.log(`   FROM : ${EMAIL_FROM || EMAIL_USER}`);
console.log(`   TO   : ${TO}`);
console.log('');

const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port,
    secure: port === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: { rejectUnauthorized: false },
});

// ── Verificar conexión ────────────────────────────────────────────────────────
console.log('🔌 Verificando conexión con el servidor SMTP...');
try {
    await transporter.verify();
    console.log('✅ Conexión SMTP OK\n');
} catch (err) {
    console.error(`❌ Error de conexión SMTP: ${err.message}`);
    console.error(`   Código: ${err.code || 'N/A'}`);
    process.exit(1);
}

// ── Enviar email de prueba ────────────────────────────────────────────────────
console.log(`📨 Enviando email de prueba a ${TO}...`);
try {
    const info = await transporter.sendMail({
        from: EMAIL_FROM || EMAIL_USER,
        to: TO,
        subject: '✅ Test SMTP — Stockearly',
        html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <div style="background:#1e293b;border-radius:8px 8px 0 0;padding:20px 24px;">
            <h2 style="margin:0;color:#fff;font-size:18px;">✅ Email de prueba</h2>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Stockearly · ${new Date().toLocaleString('es-ES')}</p>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
            <p style="margin:0 0 12px;color:#374151;">La configuración SMTP funciona correctamente.</p>
            <table style="font-size:13px;color:#6b7280;border-collapse:collapse;width:100%;">
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Host</td><td>${EMAIL_HOST}</td></tr>
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Puerto</td><td>${port}</td></tr>
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Usuario</td><td>${EMAIL_USER}</td></tr>
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Destino</td><td>${TO}</td></tr>
            </table>
          </div>
        </div>`,
        text: `Email de prueba de Stockearly. SMTP: ${EMAIL_HOST}:${port} | Usuario: ${EMAIL_USER} | Destino: ${TO}`,
    });

    console.log(`✅ Email enviado correctamente`);
    console.log(`   Message-ID : ${info.messageId}`);
    console.log(`   Respuesta  : ${info.response}`);
} catch (err) {
    console.error(`❌ Error al enviar: ${err.message}`);
    console.error(`   Código: ${err.code || 'N/A'}`);
    process.exit(1);
}
