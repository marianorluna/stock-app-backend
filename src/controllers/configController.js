import asyncHandler from 'express-async-handler';
import Config from '../models/Config.js';
import logger from '../config/logger.js';

/**
 * Actualiza el valor del bearer en la configuración
 * PUT /api/config/bearer
 * Body: { value: "nuevo_bearer_token" }
 * 
 * Si existe un documento, reemplaza el valor de value_qm_bearer.
 * Si no existe, crea un nuevo documento con value_qm_bearer y el valor proporcionado.
 */
export const updateBearer = asyncHandler(async (req, res) => {
    const { value } = req.body;

    if (!value || typeof value !== 'string' || !value.trim()) {
        res.status(400);
        throw new Error('El valor del bearer es requerido');
    }

    const trimmedValue = value.trim();

    // Buscar si existe algún documento en la colección Config
    const existingConfig = await Config.findOne();

    if (existingConfig) {
        // Si existe, reemplazar el valor de value_qm_bearer
        logger.info('Reemplazando valor existente de value_qm_bearer');
        existingConfig.value_qm_bearer = trimmedValue;
        existingConfig.description = 'Bearer token para la API de Qamarero';
        await existingConfig.save();

        logger.info('Bearer reemplazado exitosamente');

        res.json({
            success: true,
            message: 'Bearer reemplazado exitosamente',
            config: {
                value_qm_bearer: existingConfig.value_qm_bearer,
                updatedAt: existingConfig.updatedAt
            }
        });
    } else {
        // Si no existe, crear un nuevo documento con value_qm_bearer
        logger.info('Creando nuevo documento con value_qm_bearer');
        const newConfig = await Config.create({
            value_qm_bearer: trimmedValue,
            description: 'Bearer token para la API de Qamarero'
        });

        logger.info('Bearer creado exitosamente');

        res.json({
            success: true,
            message: 'Bearer creado exitosamente',
            config: {
                value_qm_bearer: newConfig.value_qm_bearer,
                createdAt: newConfig.createdAt,
                updatedAt: newConfig.updatedAt
            }
        });
    }
});

/**
 * Obtiene el valor actual del bearer
 * GET /api/config/bearer
 */
export const getBearer = asyncHandler(async (req, res) => {
    const config = await Config.findOne();

    if (!config || !config.value_qm_bearer) {
        return res.json({
            success: true,
            value: null,
            message: 'No hay bearer configurado'
        });
    }

    res.json({
        success: true,
        value: config.value_qm_bearer
    });
});

/**
 * Obtiene el horario de actualización diaria configurado
 * GET /api/config/schedule
 */
export const getSchedule = asyncHandler(async (req, res) => {
    const config = await Config.findOne();

    res.json({
        success: true,
        dailyUpdateSchedule: config?.dailyUpdateSchedule ?? '18:00'
    });
});

/**
 * Actualiza el horario de actualización diaria
 * PUT /api/config/schedule
 * Body: { dailyUpdateSchedule: "18:00" }
 */
export const updateSchedule = asyncHandler(async (req, res) => {
    const { dailyUpdateSchedule } = req.body;

    if (!dailyUpdateSchedule || typeof dailyUpdateSchedule !== 'string') {
        res.status(400);
        throw new Error('El horario es requerido');
    }

    const trimmed = dailyUpdateSchedule.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
        res.status(400);
        throw new Error('El formato de horario debe ser HH:MM (ej: 18:00)');
    }

    const config = await Config.findOneAndUpdate(
        {},
        { dailyUpdateSchedule: trimmed },
        { upsert: true, new: true }
    );

    logger.info(`Horario de actualización diaria actualizado a ${trimmed}`);

    res.json({
        success: true,
        dailyUpdateSchedule: config.dailyUpdateSchedule,
        message: `Horario actualizado a ${trimmed}`
    });
});

/**
 * Obtiene el horario de cierre de ventas del TPV
 * GET /api/config/sales-schedule
 */
export const getSalesSchedule = asyncHandler(async (req, res) => {
    const config = await Config.findOne();

    res.json({
        success: true,
        salesCloseTime: config?.salesCloseTime ?? '17:30'
    });
});

/**
 * Actualiza el horario de cierre de ventas del TPV
 * PUT /api/config/sales-schedule
 * Body: { salesCloseTime: "17:30" }
 */
export const updateSalesSchedule = asyncHandler(async (req, res) => {
    const { salesCloseTime } = req.body;

    if (!salesCloseTime || typeof salesCloseTime !== 'string') {
        res.status(400);
        throw new Error('El horario de cierre de ventas es requerido');
    }

    const trimmed = salesCloseTime.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
        res.status(400);
        throw new Error('El formato de horario debe ser HH:MM (ej: 17:30)');
    }

    const config = await Config.findOneAndUpdate(
        {},
        { salesCloseTime: trimmed },
        { upsert: true, new: true }
    );

    logger.info(`Horario de cierre de ventas actualizado a ${trimmed}`);

    res.json({
        success: true,
        salesCloseTime: config.salesCloseTime,
        message: `Horario de cierre de ventas actualizado a ${trimmed}`
    });
});

// ─── Emails de notificación ───────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Obtiene todos los emails de notificación
 * GET /api/config/notification-emails
 */
export const getNotificationEmails = asyncHandler(async (req, res) => {
    const config = await Config.findOne();
    res.json({
        success: true,
        emails: config?.notificationEmails ?? []
    });
});

/**
 * Agrega un nuevo email de notificación
 * POST /api/config/notification-emails
 * Body: { email: "ejemplo@correo.com" }
 */
export const addNotificationEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
        res.status(400);
        throw new Error('El email es requerido');
    }

    const trimmed = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmed)) {
        res.status(400);
        throw new Error('El formato del email no es válido');
    }

    // Verificar duplicado
    const existing = await Config.findOne({ 'notificationEmails.email': trimmed });
    if (existing) {
        res.status(400);
        throw new Error('El email ya está registrado');
    }

    const config = await Config.findOneAndUpdate(
        {},
        { $push: { notificationEmails: { email: trimmed } } },
        { upsert: true, new: true }
    );

    const addedEmail = config.notificationEmails[config.notificationEmails.length - 1];
    logger.info(`Email de notificación agregado: ${trimmed}`);

    res.status(201).json({
        success: true,
        message: 'Email agregado exitosamente',
        emailEntry: addedEmail
    });
});

/**
 * Actualiza un email de notificación existente
 * PUT /api/config/notification-emails/:id
 * Body: { email: "nuevo@correo.com" }
 */
export const updateNotificationEmail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
        res.status(400);
        throw new Error('El email es requerido');
    }

    const trimmed = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmed)) {
        res.status(400);
        throw new Error('El formato del email no es válido');
    }

    // Verificar que no exista otro con ese email (excepto el mismo)
    const duplicate = await Config.findOne({
        'notificationEmails.email': trimmed,
        'notificationEmails._id': { $ne: id }
    });
    if (duplicate) {
        res.status(400);
        throw new Error('El email ya está registrado');
    }

    const config = await Config.findOneAndUpdate(
        { 'notificationEmails._id': id },
        { $set: { 'notificationEmails.$.email': trimmed } },
        { new: true }
    );

    if (!config) {
        res.status(404);
        throw new Error('Email no encontrado');
    }

    const updatedEmail = config.notificationEmails.find(e => String(e._id) === String(id));
    logger.info(`Email de notificación actualizado: ${trimmed}`);

    res.json({
        success: true,
        message: 'Email actualizado exitosamente',
        emailEntry: updatedEmail
    });
});

/**
 * Elimina un email de notificación
 * DELETE /api/config/notification-emails/:id
 */
export const deleteNotificationEmail = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const config = await Config.findOneAndUpdate(
        { 'notificationEmails._id': id },
        { $pull: { notificationEmails: { _id: id } } },
        { new: true }
    );

    if (!config) {
        res.status(404);
        throw new Error('Email no encontrado');
    }

    logger.info(`Email de notificación eliminado: ${id}`);

    res.json({
        success: true,
        message: 'Email eliminado exitosamente'
    });
});