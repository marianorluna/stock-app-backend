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