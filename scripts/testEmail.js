/**
 * Script de prueba de envío de email con Resend
 * Uso: npm run test:email
 *      npm run test:email -- --to otro@correo.com
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// ── Destinatario: argumento --to=email o EMAIL_USER por defecto ──────────────
const toArgInline = process.argv.find(a => a.startsWith('--to='))?.split('=')[1];
const toArgIdx = process.argv.indexOf('--to');
const toArgSpace = toArgIdx !== -1 ? process.argv[toArgIdx + 1] : undefined;
const TO = toArgInline ?? toArgSpace ?? process.env.EMAIL_USER;

// ── Configuración Resend ──────────────────────────────────────────────────────
const { RESEND_API_KEY, EMAIL_FROM, EMAIL_USER } = process.env;

if (!RESEND_API_KEY) {
  console.error('❌ Falta variable de entorno: RESEND_API_KEY');
  process.exit(1);
}

if (!TO) {
  console.error('❌ No se ha podido determinar el destinatario. Define EMAIL_USER o pasa --to correo@ejemplo.com');
  process.exit(1);
}

const from = EMAIL_FROM || EMAIL_USER || 'Stockearly <onboarding@resend.dev>';

console.log('\n📧 Configuración Resend detectada:');
console.log(`   FROM : ${from}`);
console.log(`   TO   : ${TO}`);
console.log('');

const resend = new Resend(RESEND_API_KEY);

// ── Enviar email de prueba ────────────────────────────────────────────────────
console.log(`📨 Enviando email de prueba a ${TO} via Resend...`);
try {
  const { data, error } = await resend.emails.send({
    from,
    to: [TO],
    subject: '✅ Test Resend — Stockearly',
    html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <div style="background:#1e293b;border-radius:8px 8px 0 0;padding:20px 24px;">
            <h2 style="margin:0;color:#fff;font-size:18px;">✅ Email de prueba</h2>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Stockearly · ${new Date().toLocaleString('es-ES')}</p>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
            <p style="margin:0 0 12px;color:#374151;">La configuración de Resend funciona correctamente.</p>
            <table style="font-size:13px;color:#6b7280;border-collapse:collapse;width:100%;">
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Proveedor</td><td>Resend API</td></tr>
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Remitente</td><td>${from}</td></tr>
              <tr><td style="padding:4px 8px 4px 0;font-weight:600;">Destino</td><td>${TO}</td></tr>
            </table>
          </div>
        </div>`,
    text: `Email de prueba de Stockearly via Resend. Remitente: ${from} | Destino: ${TO}`,
  });

  if (error) {
    console.error(`❌ Error devuelto por Resend: ${error.message}`);
    console.error(`   Nombre: ${error.name}`);
    process.exit(1);
  }

  console.log(`✅ Email enviado correctamente`);
  console.log(`   ID Resend : ${data?.id}`);
} catch (err) {
  console.error(`❌ Error al enviar: ${err.message}`);
  process.exit(1);
}
