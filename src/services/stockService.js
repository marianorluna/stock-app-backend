import Ingredient from '../models/Ingredient.js';
import Dish from '../models/Dish.js';
import logger from '../config/logger.js';
import { sendPushNotificationToRole } from './pushService.js';
import { createNotificationForRole } from './notificationService.js';

//aplica una venta al inventario restando los ingredientes según las recetas
const applySaleToStock = async (sale) => {
  const dishIds = sale.lines.map(line => line.dish);
  const dishes = await Dish.find({ _id: { $in: dishIds } }).populate('recipe.ingredient');

  const updates = [];

  dishes.forEach(dish => {
    const saleLine = sale.lines.find(line => line.dish.toString() === dish._id.toString());
    if (!saleLine) return;

    dish.recipe.forEach(recipeItem => {
      const totalQuantity = recipeItem.quantityInGrams * saleLine.quantity;
      updates.push({
        ingredientId: recipeItem.ingredient._id,
        delta: -totalQuantity
      });
    });
  });

  await commitStockUpdates(updates, { context: 'sale', referenceId: sale._id });
};

//aplica una compra al inventario sumando los ingredientes comprados
const applyPurchaseToStock = async (purchase) => {
  const updates = purchase.items.map(item => ({
    ingredientId: item.ingredient,
    delta: item.quantityInGrams
  }));
  await commitStockUpdates(updates, { context: 'purchase', referenceId: purchase._id });
};

//aplica una merma al inventario restando los ingredientes desperdiciados
const applyWastageToStock = async (wastage) => {
  const updates = wastage.items.map(item => ({
    ingredientId: item.ingredient,
    delta: -Math.abs(item.quantityInGrams)
  }));
  await commitStockUpdates(updates, { context: 'wastage', referenceId: wastage._id });
};

//revierte una merma del inventario sumando los ingredientes previamente restados
const revertWastageFromStock = async (wastage) => {
  const updates = wastage.items.map(item => ({
    ingredientId: item.ingredient,
    delta: Math.abs(item.quantityInGrams)
  }));
  await commitStockUpdates(updates, { context: 'wastage-revert', referenceId: wastage._id });
};

//ejecuta actualizaciones masivas de stock en la base de datos
const commitStockUpdates = async (updates, metadata) => {
  if (!updates.length) return;

  const ingredientIds = [...new Set(updates.map(update => update.ingredientId.toString()))];
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } }).lean();
  const ingredientMap = new Map(ingredients.map(ingredient => [ingredient._id.toString(), ingredient]));

  // Guardar el stock anterior para detectar cambios a stock bajo
  const previousStockMap = new Map(
    ingredients.map(ing => [ing._id.toString(), {
      stock: ing.stock,
      stockMerma: ing.stockMerma,
      reorderPoint: ing.reorderPoint
    }])
  );

  const isPurchase = metadata?.context === 'purchase';

  const bulkOperations = updates.map(update => {
    const ingredient = ingredientMap.get(update.ingredientId.toString());
    if (!ingredient) {
      return null;
    }

    // stockMerma: en compras se aplica el factor de merma natural al delta entrante
    // en ventas/mermas/reversiones se usa el mismo delta
    const stockMermaDelta = isPurchase && ingredient.factorMermaNat > 0
      ? update.delta * (1 - ingredient.factorMermaNat)
      : update.delta;

    return {
      updateOne: {
        filter: { _id: update.ingredientId },
        update: { $inc: { stock: update.delta, stockMerma: stockMermaDelta } }
      }
    };
  }).filter(Boolean);

  if (!bulkOperations.length) return;

  const result = await Ingredient.bulkWrite(bulkOperations);
  logger.info('Stock updated', { result, ...metadata });

  // Verificar productos que pasaron a stock bajo después de la actualización
  await checkLowStockAndNotify(ingredientIds, previousStockMap);

  return result;
};

// Verifica productos en stock bajo y notifica a managers
const checkLowStockAndNotify = async (ingredientIds, previousStockMap) => {
  try {
    logger.info('Verificando stock bajo', { ingredientIds: ingredientIds.length });

    // Obtener los ingredientes actualizados
    const updatedIngredients = await Ingredient.find({ _id: { $in: ingredientIds } }).lean();
    logger.info('Ingredientes actualizados obtenidos', { count: updatedIngredients.length });

    // Identificar ingredientes que pasaron a stock bajo
    const lowStockIngredients = updatedIngredients.filter(ingredient => {
      const previous = previousStockMap.get(ingredient._id.toString());
      if (!previous) {
        logger.debug(`No se encontró stock anterior para ${ingredient.name}`);
        return false;
      }

      // Usar stockMerma como stock efectivo si el ingrediente tiene factor de merma natural
      const effectiveStock = ingredient.factorMermaNat > 0 ? ingredient.stockMerma : ingredient.stock;
      const previousEffectiveStock = ingredient.factorMermaNat > 0 ? (previous.stockMerma ?? previous.stock) : previous.stock;

      // Verificar si ahora está en stock bajo pero antes no lo estaba
      const wasAboveReorderPoint = previousEffectiveStock > previous.reorderPoint;
      const isNowBelowReorderPoint = effectiveStock <= ingredient.reorderPoint;

      logger.debug(`Verificando ${ingredient.name}:`, {
        stockAnterior: previousEffectiveStock,
        stockActual: effectiveStock,
        reorderPoint: ingredient.reorderPoint,
        wasAbove: wasAboveReorderPoint,
        isNowBelow: isNowBelowReorderPoint,
      });

      return wasAboveReorderPoint && isNowBelowReorderPoint;
    });

    logger.info('Ingredientes en stock bajo detectados', { count: lowStockIngredients.length });

    // Si hay productos en stock bajo, notificar a managers
    if (lowStockIngredients.length > 0) {
      for (const ingredient of lowStockIngredients) {
        const unit = ingredient.stockUnit || 'g';
        const effectiveStockValue = ingredient.factorMermaNat > 0 ? ingredient.stockMerma : ingredient.stock;
        const stockDisplay = `${effectiveStockValue} ${unit}`;
        const reorderDisplay = `${ingredient.reorderPoint} ${unit}`;

        const notification = {
          title: 'Stock Bajo Detectado',
          message: `${ingredient.name} está en stock bajo (Stock Real: ${stockDisplay}). Punto de reorden: ${reorderDisplay}. Es necesario hacer una compra.`,
          type: 'stock',
          data: {
            type: 'low_stock',
            ingredientId: ingredient._id.toString(),
            ingredientName: ingredient.name,
            stock: effectiveStockValue,
            reorderPoint: ingredient.reorderPoint,
            unit: unit,
          },
        };

        logger.info(`Enviando notificación de stock bajo para ${ingredient.name}`, {
          ingredientId: ingredient._id,
          stock: ingredient.stock,
          reorderPoint: ingredient.reorderPoint,
        });

        // Guardar notificación en la base de datos para todos los managers
        try {
          await createNotificationForRole('manager', notification);
          logger.info(`Notificación guardada en BD para ${ingredient.name}`);
        } catch (error) {
          logger.error(`Error guardando notificación en BD para ${ingredient.name}:`, error);
        }

        // Enviar notificación push a todos los managers
        try {
          await sendPushNotificationToRole('manager', notification);
          logger.info(`Notificación push enviada para ${ingredient.name}`);
        } catch (error) {
          logger.error(`Error enviando notificación push para ${ingredient.name}:`, error);
        }

        // Enviar notificación vía WebSocket si está disponible
        if (global.broadcastNotification) {
          global.broadcastNotification(notification);
          logger.info(`Notificación WebSocket enviada para ${ingredient.name}`);
        } else {
          logger.warn('global.broadcastNotification no está disponible');
        }
      }
    } else {
      logger.debug('No se detectaron ingredientes que pasaron a stock bajo');
    }
  } catch (error) {
    logger.error('Error verificando stock bajo y enviando notificaciones:', error);
  }
};

const stockService = {
  applySaleToStock,
  applyPurchaseToStock,
  applyWastageToStock,
  revertWastageFromStock
};

export default stockService;

