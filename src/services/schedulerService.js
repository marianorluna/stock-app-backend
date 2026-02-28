/**
 * Servicio de tareas programadas (cron jobs).
 *
 * Responsabilidades:
 *   - Leer el horario de actualización diaria desde la colección Config.
 *   - Ejecutar la actualización automática de stock (misma lógica que el botón
 *     "Actualizar" del frontend) cada día a la hora configurada.
 *   - Enviar notificaciones de tipo "info" a admins y managers con el resultado
 *     (éxito, sin facturas nuevas o error), sin mostrar ningún diálogo en el frontend.
 *   - Reprogramar el job si el horario cambia en base de datos (recarga cada minuto).
 */

import cron from 'node-cron';
import Config from '../models/Config.js';
import logger from '../config/logger.js';
import { updateStockFromNewInvoices } from './stockUpdateService.js';
import { createNotificationForAdminsAndManagers } from './notificationService.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';

// ─── Estado interno del scheduler ────────────────────────────────────────────

/** Tarea cron que ejecuta la actualización de stock. Puede ser null si no está activa. */
let stockUpdateTask = null;

/** Último horario con el que se configuró la tarea (HH:MM). */
let currentSchedule = null;

/** Flag que indica si hay una actualización automática de stock en curso. */
let _isStockUpdateInProgress = false;

/**
 * Retorna true si la actualización automática de stock está en curso.
 * @returns {boolean}
 */
export const isStockUpdateInProgress = () => _isStockUpdateInProgress;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convierte un horario "HH:MM" a una expresión cron "MM HH * * *".
 * @param {string} time – Horario en formato HH:MM
 * @returns {string} Expresión cron
 */
function timeToCron(time) {
  const [hour, minute] = time.split(':');
  return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
}

/**
 * Ejecuta la actualización de stock y notifica a admins y managers.
 */
async function runDailyStockUpdate() {
  logger.info('🕐 [Scheduler] Iniciando actualización automática diaria de stock...');

  _isStockUpdateInProgress = true;
  eventBus.emit(EVENT_TYPES.STOCK_UPDATE_STARTED);

  try {
    const result = await updateStockFromNewInvoices();

    if (result.noNewInvoices) {
      // Sin facturas nuevas — notificación informativa
      const payload = {
        title: 'Actualización Diaria de Stock',
        message: 'Actualización diaria completada: no se encontraron facturas nuevas en el bucket.',
        type: 'info',
        data: { trigger: 'scheduler', noNewInvoices: true }
      };

      const saved = await createNotificationForAdminsAndManagers(payload);
      _broadcastNotifications(saved, 'info');

      logger.info('[Scheduler] Actualización diaria: sin facturas nuevas.');
      return;
    }

    // Éxito con facturas procesadas
    const { summary = {} } = result;
    const parts = [];

    if (summary.facturasNuevas > 0) parts.push(`${summary.facturasNuevas} factura(s) procesada(s)`);
    if (summary.ingredientesActualizados > 0) parts.push(`${summary.ingredientesActualizados} ingrediente(s) actualizados`);
    if (summary.bebidasActualizadas > 0) parts.push(`${summary.bebidasActualizadas} bebida(s) actualizadas`);
    if (summary.itemsSinMatch > 0) parts.push(`${summary.itemsSinMatch} ítem(s) sin coincidencia`);

    const message = parts.length > 0
      ? `Actualización diaria completada: ${parts.join(', ')}.`
      : 'Actualización diaria de stock completada correctamente.';

    const payload = {
      title: 'Actualización Diaria de Stock',
      message,
      type: 'info',
      data: { trigger: 'scheduler', summary }
    };

    const saved = await createNotificationForAdminsAndManagers(payload);
    _broadcastNotifications(saved, 'info');

    logger.info(`[Scheduler] Actualización diaria completada. ${message}`);

  } catch (err) {
    logger.error('[Scheduler] Error en la actualización diaria de stock:', err);

    const errorMessage = err?.error || err?.message || 'Error desconocido';
    const payload = {
      title: 'Error en Actualización Diaria de Stock',
      message: `La actualización automática diaria ha fallado: ${errorMessage}`,
      type: 'error',
      data: { trigger: 'scheduler', error: errorMessage }
    };

    try {
      const saved = await createNotificationForAdminsAndManagers(payload);
      _broadcastNotifications(saved, 'error');
    } catch (notifErr) {
      logger.error('[Scheduler] Adicionalmente, falló el envío de notificación de error:', notifErr);
    }
  } finally {
    _isStockUpdateInProgress = false;
    eventBus.emit(EVENT_TYPES.STOCK_UPDATE_COMPLETED);
    logger.info('[Scheduler] Lock de actualización de stock liberado.');
  }
}

/**
 * Envía las notificaciones guardadas vía WebSocket a cada usuario.
 * @param {Array} savedNotifications
 * @param {string} wsType – Tipo para el cliente WebSocket
 */
function _broadcastNotifications(savedNotifications, wsType) {
  if (!savedNotifications || savedNotifications.length === 0) return;

  const sendFn = global.sendNotificationToUser;
  if (typeof sendFn !== 'function') return;

  savedNotifications.forEach((notif) => {
    sendFn(notif.userId.toString(), {
      title: notif.title,
      message: notif.message,
      type: wsType,
      data: notif.data
    });
  });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicia (o reinicia) el cron job de actualización diaria con el horario dado.
 *
 * @param {string} schedule – Horario en formato HH:MM (ej: "18:00")
 */
export function startDailyStockUpdateJob(schedule) {
  const cronExpr = timeToCron(schedule);

  // Detener tarea anterior si existe
  if (stockUpdateTask) {
    stockUpdateTask.stop();
    stockUpdateTask = null;
    logger.info(`[Scheduler] Tarea anterior detenida (horario: ${currentSchedule})`);
  }

  if (!cron.validate(cronExpr)) {
    logger.error(`[Scheduler] Expresión cron inválida para horario "${schedule}": ${cronExpr}`);
    return;
  }

  stockUpdateTask = cron.schedule(cronExpr, runDailyStockUpdate, {
    scheduled: true,
    timezone: 'Europe/Madrid'
  });

  currentSchedule = schedule;
  logger.info(`[Scheduler] Actualización diaria de stock programada a las ${schedule} (${cronExpr}) — zona: Europe/Madrid`);
}

/**
 * Inicializa el scheduler leyendo el horario desde la BD.
 * También lanza un job de "vigilancia" cada minuto para detectar cambios de horario.
 */
export async function initScheduler() {
  try {
    const config = await Config.findOne().lean();
    const schedule = config?.dailyUpdateSchedule ?? '18:00';

    // Arrancar el job principal
    startDailyStockUpdateJob(schedule);

    // Job de vigilancia: cada minuto comprueba si el horario cambió en BD
    cron.schedule('* * * * *', async () => {
      try {
        const latestConfig = await Config.findOne().lean();
        const latestSchedule = latestConfig?.dailyUpdateSchedule ?? '18:00';

        if (latestSchedule !== currentSchedule) {
          logger.info(`[Scheduler] Horario cambiado en BD: ${currentSchedule} → ${latestSchedule}. Reprogramando...`);
          startDailyStockUpdateJob(latestSchedule);
        }
      } catch (err) {
        logger.error('[Scheduler] Error al comprobar cambio de horario:', err);
      }
    }, { scheduled: true });

    logger.info('[Scheduler] Servicio de tareas programadas inicializado ✅');
  } catch (err) {
    logger.error('[Scheduler] Error al inicializar el scheduler:', err);
  }
}
