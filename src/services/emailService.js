import { Resend } from 'resend';
import logger from '../config/logger.js';

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn('[emailService] RESEND_API_KEY no configurada. Define RESEND_API_KEY en el .env');
        return null;
    }
    return new Resend(apiKey);
};

const getFromAddress = () =>
    process.env.EMAIL_FROM || process.env.EMAIL_USER || 'Stockearly <onboarding@resend.dev>';

/**
 * Envía un email de alerta de stock bajo a los destinatarios configurados en BD.
 *
 * @param {Array<{ name, stock, stockMerma, stockUnit, reorderPoint, factorMermaNat }>} ingredients
 * @param {string[]} toEmails
 */
export const sendLowStockAlert = async (ingredients, toEmails) => {
    if (!toEmails || toEmails.length === 0) {
        logger.info('[emailService] Sin destinatarios configurados, se omite el email de stock bajo');
        return;
    }

    const resend = getResendClient();
    if (!resend) return;

    // ── Construir filas de la tabla ────────────────────────────────────────────
    const rows = ingredients.map(ing => {
        const unit = ing.stockUnit || 'g';
        const effectiveStock = ing.factorMermaNat > 0 ? ing.stockMerma : ing.stock;
        const percent = ing.reorderPoint > 0
            ? Math.round((effectiveStock / ing.reorderPoint) * 100)
            : null;
        const percentText = percent !== null ? ` (${percent}%)` : '';

        return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:500;color:#111827;">
            ${ing.name}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;color:#dc2626;font-weight:600;">
            ${effectiveStock} ${unit}${percentText}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;">
            ${ing.reorderPoint} ${unit}
          </td>
        </tr>`;
    }).join('');

    // ── Template HTML ──────────────────────────────────────────────────────────
    const now = new Date().toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Cabecera -->
          <tr>
            <td style="background:#1e293b;padding:24px 28px;">
              <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">
                ⚠️ Alerta de Stock Bajo
              </h1>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Stockearly · ${now}</p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;">
                ${ingredients.length === 1
                    ? `El siguiente ingrediente ha cruzado su punto de reorden y requiere atención inmediata:`
                    : `Los siguientes <strong>${ingredients.length} ingredientes</strong> han cruzado su punto de reorden y requieren atención:`
                }
              </p>

              <!-- Tabla de ingredientes -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 14px;text-align:left;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">
                      Ingrediente
                    </th>
                    <th style="padding:10px 14px;text-align:right;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">
                      Stock actual
                    </th>
                    <th style="padding:10px 14px;text-align:right;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">
                      Punto de reorden
                    </th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>

              <!-- CTA -->
              <div style="margin-top:24px;padding:14px 16px;background:#fef9c3;border-left:4px solid #eab308;border-radius:4px;">
                <p style="margin:0;color:#854d0e;font-size:14px;">
                  <strong>Acción recomendada:</strong> Revisar y gestionar una compra para los ingredientes listados lo antes posible.
                </p>
              </div>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Este mensaje fue generado automáticamente por Stockearly · No responder a este correo
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // ── Asunto ─────────────────────────────────────────────────────────────────
    const subject = ingredients.length === 1
        ? `⚠️ Stock bajo: ${ingredients[0].name}`
        : `⚠️ Stock bajo: ${ingredients.length} ingredientes requieren reposición`;

    // ── Envío ─────────────────────────────────────────────────────────────────
    try {
        const { data, error } = await resend.emails.send({
            from: getFromAddress(),
            to: toEmails,
            subject,
            html,
        });

        if (error) {
            logger.error('[emailService] Error enviando email de stock bajo:', {
                message: error.message,
                name: error.name,
            });
            return;
        }

        logger.info('[emailService] Email de stock bajo enviado', {
            id: data?.id,
            to: toEmails,
            ingredients: ingredients.map(i => i.name),
        });
    } catch (error) {
        logger.error('[emailService] Error enviando email de stock bajo:', {
            message: error.message,
        });
    }
};

/**
 * Envía un email de alerta de stock bajo de bebidas a los destinatarios configurados en BD.
 *
 * @param {Array<{ name, stock, stockUnit, reorderPoint }>} beverages
 * @param {string[]} toEmails
 */
export const sendLowBeverageStockAlert = async (beverages, toEmails) => {
    if (!toEmails || toEmails.length === 0) {
        logger.info('[emailService] Sin destinatarios configurados, se omite el email de stock bajo de bebidas');
        return;
    }

    const resend = getResendClient();
    if (!resend) return;

    // ── Construir filas de la tabla ────────────────────────────────────────────
    const rows = beverages.map(bev => {
        const unit = bev.stockUnit || 'u';
        const percent = bev.reorderPoint > 0
            ? Math.round((bev.stock / bev.reorderPoint) * 100)
            : null;
        const percentText = percent !== null ? ` (${percent}%)` : '';

        return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:500;color:#111827;">
            ${bev.name}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;color:#dc2626;font-weight:600;">
            ${bev.stock} ${unit}${percentText}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;color:#6b7280;">
            ${bev.reorderPoint} ${unit}
          </td>
        </tr>`;
    }).join('');

    // ── Template HTML ──────────────────────────────────────────────────────────
    const now = new Date().toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Cabecera -->
          <tr>
            <td style="background:#1e293b;padding:24px 28px;">
              <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;">
                ⚠️ Alerta de Stock Bajo
              </h1>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Stockearly · ${now}</p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;">
                ${beverages.length === 1
                    ? `La siguiente bebida ha cruzado su punto de reorden y requiere atención inmediata:`
                    : `Las siguientes <strong>${beverages.length} bebidas</strong> han cruzado su punto de reorden y requieren atención:`
                }
              </p>

              <!-- Tabla de bebidas -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 14px;text-align:left;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">
                      Bebida
                    </th>
                    <th style="padding:10px 14px;text-align:right;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">
                      Stock actual
                    </th>
                    <th style="padding:10px 14px;text-align:right;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">
                      Punto de reorden
                    </th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>

              <!-- CTA -->
              <div style="margin-top:24px;padding:14px 16px;background:#fef9c3;border-left:4px solid #eab308;border-radius:4px;">
                <p style="margin:0;color:#854d0e;font-size:14px;">
                  <strong>Acción recomendada:</strong> Revisar y gestionar una compra para las bebidas listadas lo antes posible.
                </p>
              </div>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Este mensaje fue generado automáticamente por Stockearly · No responder a este correo
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // ── Asunto ─────────────────────────────────────────────────────────────────
    const subject = beverages.length === 1
        ? `⚠️ Stock bajo: ${beverages[0].name}`
        : `⚠️ Stock bajo: ${beverages.length} bebidas requieren reposición`;

    // ── Envío ─────────────────────────────────────────────────────────────────
    try {
        const { data, error } = await resend.emails.send({
            from: getFromAddress(),
            to: toEmails,
            subject,
            html,
        });

        if (error) {
            logger.error('[emailService] Error enviando email de stock bajo de bebidas:', {
                message: error.message,
                name: error.name,
            });
            return;
        }

        logger.info('[emailService] Email de stock bajo de bebidas enviado', {
            id: data?.id,
            to: toEmails,
            beverages: beverages.map(b => b.name),
        });
    } catch (error) {
        logger.error('[emailService] Error enviando email de stock bajo de bebidas:', {
            message: error.message,
        });
    }
};
