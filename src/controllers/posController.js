/**
 * Controlador para la actualización de stock desde el TPV (Qamarero).
 * POST /api/pos/update-stock
 */

import asyncHandler from 'express-async-handler';
import logger from '../config/logger.js';
import { updateStockFromPOS } from '../services/posStockUpdateService.js';

/**
 * Obtiene los tickets del día del TPV Qamarero y descuenta el stock correspondiente.
 * POST /api/pos/update-stock
 */
export const updateStockFromPOSController = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { date } = req.body || {}; // Fecha opcional en formato YYYY-MM-DD

    logger.info(`📲 Iniciando actualización de stock desde TPV por usuario ${userId}${date ? ` para fecha ${date}` : ' (día de hoy)'}`);

    try {
        const result = await updateStockFromPOS({ userId, date });
        res.json({ success: true, ...result });
    } catch (err) {
        // Importación duplicada → 409 Conflict
        if (err && err.isDuplicateImport) {
            logger.warn('⚠️  Importación duplicada rechazada:', err.error);
            return res.status(409).json({
                success: false,
                isDuplicateImport: true,
                message: err.error,
                steps: err.steps || []
            });
        }

        const message = err?.error || (err instanceof Error ? err.message : 'Error desconocido');
        const steps   = err?.steps || [];

        logger.error('❌ Error en actualización de stock desde TPV:', message);

        res.status(500).json({
            success: false,
            message,
            steps,
            updatedIngredients: [],
            updatedBeverages: [],
            unmatchedItems: []
        });
    }
});
