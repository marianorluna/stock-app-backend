import Ingredient from '../models/Ingredient.js';
import Beverage from '../models/Beverage.js';
import Dish from '../models/Dish.js';
import logger from '../config/logger.js';
import { sendPushNotificationToRole } from './pushService.js';
import { createNotificationForRole } from './notificationService.js';
import { sendLowStockAlert, sendLowBeverageStockAlert } from './emailService.js';
import Config from '../models/Config.js';

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

//aplica una merma al inventario restando ingredientes o bebidas desperdiciadas
const applyWastageToStock = async (wastage) => {
  const ingredientUpdates = wastage.items
    .filter(item => item.ingredient)
    .map(item => ({ ingredientId: item.ingredient, delta: -Math.abs(item.quantityInGrams) }));

  const beverageUpdates = wastage.items
    .filter(item => item.beverage)
    .map(item => ({ beverageId: item.beverage, delta: -Math.abs(item.quantityInUnits ?? 1) }));

  if (ingredientUpdates.length) {
    await commitStockUpdates(ingredientUpdates, { context: 'wastage', referenceId: wastage._id });
  }
  if (beverageUpdates.length) {
    await commitBeverageStockUpdates(beverageUpdates, { context: 'wastage', referenceId: wastage._id });
  }
};

//revierte una compra del inventario restando los ingredientes que se sumaron
const revertPurchaseFromStock = async (purchase) => {
  const updates = purchase.items
    .filter(item => item.ingredient)
    .map(item => ({
      ingredientId: item.ingredient._id ?? item.ingredient,
      delta: -Math.abs(item.quantityInGrams)
    }));
  if (updates.length) {
    // Usar contexto 'purchase' para que stockMerma se revierta con el mismo factor
    await commitStockUpdates(updates, { context: 'purchase', referenceId: purchase._id });
  }
};

//revierte una merma del inventario sumando ingredientes o bebidas previamente restados
const revertWastageFromStock = async (wastage) => {
  const ingredientUpdates = wastage.items
    .filter(item => item.ingredient)
    .map(item => ({ ingredientId: item.ingredient, delta: Math.abs(item.quantityInGrams) }));

  const beverageUpdates = wastage.items
    .filter(item => item.beverage)
    .map(item => ({ beverageId: item.beverage, delta: Math.abs(item.quantityInUnits ?? 1) }));

  if (ingredientUpdates.length) {
    await commitStockUpdates(ingredientUpdates, { context: 'wastage-revert', referenceId: wastage._id });
  }
  if (beverageUpdates.length) {
    await commitBeverageStockUpdates(beverageUpdates, { context: 'wastage-revert', referenceId: wastage._id });
  }
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

//ejecuta actualizaciones masivas de stock en la base de datos para bebidas
const commitBeverageStockUpdates = async (updates, metadata) => {
  if (!updates.length) return;

  const beverageIds = [...new Set(updates.map(update => update.beverageId.toString()))];
  const beverages = await Beverage.find({ _id: { $in: beverageIds } }).lean();
  const beverageMap = new Map(beverages.map(beverage => [beverage._id.toString(), beverage]));

  // Guardar el stock anterior para detectar cambios a stock bajo
  const previousStockMap = new Map(
    beverages.map(bev => [bev._id.toString(), {
      stock: bev.stock,
      reorderPoint: bev.reorderPoint
    }])
  );

  const bulkOperations = updates.map(update => {
    const beverage = beverageMap.get(update.beverageId.toString());
    if (!beverage) {
      return null;
    }

    return {
      updateOne: {
        filter: { _id: update.beverageId },
        update: { $inc: { stock: update.delta } }
      }
    };
  }).filter(Boolean);

  if (!bulkOperations.length) return;

  const result = await Beverage.bulkWrite(bulkOperations);
  logger.info('Beverage stock updated', { result, ...metadata });

  // Verificar productos que pasaron a stock bajo después de la actualización
  await checkLowBeverageStockAndNotify(beverageIds, previousStockMap);

  return result;
};

// Verifica bebidas en stock bajo y notifica a managers
const checkLowBeverageStockAndNotify = async (beverageIds, previousStockMap) => {
  try {
    logger.info('Verificando stock bajo de bebidas', { beverageIds: beverageIds.length });

    // Obtener las bebidas actualizadas
    const updatedBeverages = await Beverage.find({ _id: { $in: beverageIds } }).lean();
    logger.info('Bebidas actualizadas obtenidas', { count: updatedBeverages.length });

    // Identificar bebidas que pasaron a stock bajo
    const lowStockBeverages = updatedBeverages.filter(beverage => {
      const previous = previousStockMap.get(beverage._id.toString());
      if (!previous) {
        logger.debug(`No se encontró stock anterior para ${beverage.name}`);
        return false;
      }

      // Verificar si ahora está en stock bajo pero antes no lo estaba
      const wasAboveReorderPoint = previous.stock > previous.reorderPoint;
      const isNowBelowReorderPoint = beverage.stock <= beverage.reorderPoint;

      logger.debug(`Verificando ${beverage.name}:`, {
        stockAnterior: previous.stock,
        stockActual: beverage.stock,
        reorderPoint: beverage.reorderPoint,
        wasAbove: wasAboveReorderPoint,
        isNowBelow: isNowBelowReorderPoint,
      });

      return wasAboveReorderPoint && isNowBelowReorderPoint;
    });

    logger.info('Bebidas en stock bajo detectadas', { count: lowStockBeverages.length });

    // Si hay bebidas en stock bajo, notificar a managers
    if (lowStockBeverages.length > 0) {
      for (const beverage of lowStockBeverages) {
        const unit = beverage.stockUnit || 'u';
        const stockDisplay = `${beverage.stock} ${unit}`;
        const reorderDisplay = `${beverage.reorderPoint} ${unit}`;

        const notification = {
          title: 'Stock Bajo Detectado',
          message: `${beverage.name} está en stock bajo (Stock: ${stockDisplay}). Punto de reorden: ${reorderDisplay}. Es necesario hacer una compra.`,
          type: 'stock',
          data: {
            type: 'low_stock',
            beverageId: beverage._id.toString(),
            beverageName: beverage.name,
            stock: beverage.stock,
            reorderPoint: beverage.reorderPoint,
            unit: unit,
          },
        };

        logger.info(`Enviando notificación de stock bajo para ${beverage.name}`, {
          beverageId: beverage._id,
          stock: beverage.stock,
          reorderPoint: beverage.reorderPoint,
        });

        // Guardar notificación en la base de datos para todos los managers
        try {
          await createNotificationForRole('manager', notification);
          logger.info(`Notificación guardada en BD para ${beverage.name}`);
        } catch (error) {
          logger.error(`Error guardando notificación en BD para ${beverage.name}:`, error);
        }

        // Enviar notificación push a todos los managers
        try {
          await sendPushNotificationToRole('manager', notification);
          logger.info(`Notificación push enviada para ${beverage.name}`);
        } catch (error) {
          logger.error(`Error enviando notificación push para ${beverage.name}:`, error);
        }

        // Enviar notificación vía WebSocket si está disponible
        if (global.broadcastNotification) {
          global.broadcastNotification(notification);
          logger.info(`Notificación WebSocket enviada para ${beverage.name}`);
        } else {
          logger.warn('global.broadcastNotification no está disponible');
        }
      }

      // Enviar UN email agrupado con todas las bebidas en stock bajo
      try {
        const config = await Config.findOne().lean();
        const toEmails = (config?.notificationEmails ?? []).map(e => e.email).filter(Boolean);
        await sendLowBeverageStockAlert(lowStockBeverages, toEmails);
      } catch (emailError) {
        logger.error('Error enviando email de alerta de stock bajo de bebidas:', emailError);
      }

    } else {
      logger.debug('No se detectaron bebidas que pasaron a stock bajo');
    }
  } catch (error) {
    logger.error('Error verificando stock bajo de bebidas y enviando notificaciones:', error);
  }
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

      // Enviar UN email agrupado con todos los ingredientes en stock bajo
      try {
        const config = await Config.findOne().lean();
        const toEmails = (config?.notificationEmails ?? []).map(e => e.email).filter(Boolean);
        await sendLowStockAlert(lowStockIngredients, toEmails);
      } catch (emailError) {
        logger.error('Error enviando email de alerta de stock bajo:', emailError);
      }

    } else {
      logger.debug('No se detectaron ingredientes que pasaron a stock bajo');
    }
  } catch (error) {
    logger.error('Error verificando stock bajo y enviando notificaciones:', error);
  }
};

/**
 * Aplica las ventas del TPV (Qamarero) al inventario usando la fórmula específica:
 *   - stockMerma: -= quantityInGrams * dishQuantity  (gramos brutos de receta)
 *   - stock:      -= (quantityInGrams / (1 - factorMermaNat)) * dishQuantity  (con factor de merma)
 *
 * Activa las notificaciones de stock bajo igual que el resto de operaciones.
 *
 * @param {Array<{ dish: Object, quantity: number }>} dishQuantities
 *   Array de platos populados (recipe.ingredient con _id, name, sku, factorMermaNat) y su cantidad vendida
 * @returns {Promise<{ updatedIngredients: Array }>}
 */
const applyPOSSaleToStock = async (dishQuantities) => {
  // Acumular deltas por ingredienteId
  const deltaMap = new Map();
  // Map: ingId → { ingredientId, deltaStock, deltaMerma }

  for (const { dish, quantity } of dishQuantities) {
    if (!dish.recipe || !dish.recipe.length) continue;

    for (const recipeItem of dish.recipe) {
      if (!recipeItem.ingredient) continue;
      const ing = recipeItem.ingredient;
      const ingId = ing._id.toString();
      const qInGrams = recipeItem.quantityInGrams;
      const factor   = ing.factorMermaNat || 0;

      // stockMerma: gramos brutos de receta × cantidad vendida
      const deltaMerma = -Math.round(qInGrams * quantity);

      // stock: gramos brutos / (1 - factor) × cantidad vendida
      const deltaStock = (factor > 0 && factor < 1)
        ? -Math.round((qInGrams / (1 - factor)) * quantity)
        : -Math.round(qInGrams * quantity);

      if (deltaMap.has(ingId)) {
        const existing = deltaMap.get(ingId);
        existing.deltaStock += deltaStock;
        existing.deltaMerma += deltaMerma;
      } else {
        deltaMap.set(ingId, {
          ingredientId: ing._id,
          deltaStock,
          deltaMerma
        });
      }
    }
  }

  if (!deltaMap.size) return { updatedIngredients: [] };

  const ingredientIds = Array.from(deltaMap.keys());
  const ingredients   = await Ingredient.find({ _id: { $in: ingredientIds } }).lean();

  // Guardar stock previo para detectar si alguno cruza el punto de reorden
  const previousStockMap = new Map(
    ingredients.map(ing => [ing._id.toString(), {
      stock:        ing.stock,
      stockMerma:   ing.stockMerma,
      reorderPoint: ing.reorderPoint
    }])
  );

  // BulkWrite con deltas distintos para stock y stockMerma
  const bulkOps        = [];
  const updatedIngredients = [];

  for (const ing of ingredients) {
    const ingId = ing._id.toString();
    const delta = deltaMap.get(ingId);
    if (!delta) continue;

    bulkOps.push({
      updateOne: {
        filter: { _id: ing._id },
        update: { $inc: { stock: delta.deltaStock, stockMerma: delta.deltaMerma } }
      }
    });

    updatedIngredients.push({
      name:               ing.name,
      sku:                ing.sku,
      stockAnterior:      ing.stock,
      stockMermaAnterior: ing.stockMerma,
      stockRestado:       Math.abs(delta.deltaStock),
      stockMermaRestada:  Math.abs(delta.deltaMerma),
      stockNuevo:         ing.stock + delta.deltaStock,
      stockMermaNuevo:    ing.stockMerma + delta.deltaMerma
    });
  }

  if (bulkOps.length > 0) {
    await Ingredient.bulkWrite(bulkOps);
    logger.info('POS sale stock updated', { ingredientsUpdated: bulkOps.length });

    // Verificar y notificar stock bajo (misma lógica que ventas/mermas)
    await checkLowStockAndNotify(ingredientIds, previousStockMap);
  }

  return { updatedIngredients };
};

/**
 * Revierte una venta manual sumando al stock los ingredientes que se restaron.
 * Usa los mismos deltas que applySaleToStock pero invertidos (positivos).
 */
const revertSaleFromStock = async (sale) => {
  const dishIds = sale.lines.map(line => line.dish?._id ?? line.dish);
  const dishes  = await Dish.find({ _id: { $in: dishIds } }).populate('recipe.ingredient');

  const updates = [];

  dishes.forEach(dish => {
    const saleLine = sale.lines.find(line =>
      (line.dish?._id ?? line.dish).toString() === dish._id.toString()
    );
    if (!saleLine) return;

    dish.recipe.forEach(recipeItem => {
      const totalQuantity = recipeItem.quantityInGrams * saleLine.quantity;
      updates.push({
        ingredientId: recipeItem.ingredient._id,
        delta: totalQuantity // positivo → devuelve al stock
      });
    });
  });

  if (updates.length > 0) {
    await commitStockUpdates(updates, { context: 'sale-revert', referenceId: sale._id });
  }
};

/**
 * Revierte las ventas del TPV del inventario usando la misma fórmula que
 * applyPOSSaleToStock pero con deltas positivos (devuelve el stock restado).
 *
 * @param {Array<{ dish: Object, quantity: number }>} dishQuantities
 */
const revertPOSSaleFromStock = async (dishQuantities) => {
  const deltaMap = new Map();

  for (const { dish, quantity } of dishQuantities) {
    if (!dish.recipe || !dish.recipe.length) continue;

    for (const recipeItem of dish.recipe) {
      if (!recipeItem.ingredient) continue;
      const ing    = recipeItem.ingredient;
      const ingId  = ing._id.toString();
      const qGrams = recipeItem.quantityInGrams;
      const factor = ing.factorMermaNat || 0;

      // Misma fórmula que applyPOSSaleToStock pero en positivo
      const deltaMerma = Math.round(qGrams * quantity);
      const deltaStock = (factor > 0 && factor < 1)
        ? Math.round((qGrams / (1 - factor)) * quantity)
        : Math.round(qGrams * quantity);

      if (deltaMap.has(ingId)) {
        const existing = deltaMap.get(ingId);
        existing.deltaStock += deltaStock;
        existing.deltaMerma += deltaMerma;
      } else {
        deltaMap.set(ingId, { ingredientId: ing._id, deltaStock, deltaMerma });
      }
    }
  }

  if (!deltaMap.size) return;

  const ingredientIds = Array.from(deltaMap.keys());
  const ingredients   = await Ingredient.find({ _id: { $in: ingredientIds } }).lean();

  const bulkOps = ingredients.map(ing => {
    const ingId = ing._id.toString();
    const delta = deltaMap.get(ingId);
    if (!delta) return null;
    return {
      updateOne: {
        filter: { _id: ing._id },
        update: { $inc: { stock: delta.deltaStock, stockMerma: delta.deltaMerma } }
      }
    };
  }).filter(Boolean);

  if (bulkOps.length > 0) {
    await Ingredient.bulkWrite(bulkOps);
    logger.info('POS sale stock reverted', { ingredientsReverted: bulkOps.length });
  }
};

const stockService = {
  applySaleToStock,
  applyPurchaseToStock,
  applyWastageToStock,
  revertWastageFromStock,
  revertPurchaseFromStock,
  revertSaleFromStock,
  revertPOSSaleFromStock,
  applyPOSSaleToStock,
  commitBeverageStockUpdates
};

export default stockService;

