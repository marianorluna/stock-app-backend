import asyncHandler from 'express-async-handler';
import Sale from '../models/Sale.js';
import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import stockService from '../services/stockService.js';

//verifica la firma del webhook del tpv (pendiente de implementar)
const verifySignature = (req) => {
  // TODO: Implement signature verification when TPV webhook details are available.
  return true;
};

//procesa webhook del tpv, registra la venta y actualiza el inventario
export const handlePosWebhook = asyncHandler(async (req, res) => {
  if (!verifySignature(req)) {
    res.status(401);
    throw new Error('Invalid signature');
  }

  const { timestamp = new Date(), items = [], metadata = {} } = req.body;
  if (!items.length) {
    res.status(400);
    throw new Error('No sale items provided');
  }

  const lines = items.map(item => {
    if (!item.dishId && !item.dish) {
      throw new Error('Missing dish identifier');
    }
    if (!item.quantity) {
      throw new Error('Missing quantity');
    }
    return {
      dish: item.dishId || item.dish,
      quantity: Number(item.quantity)
    };
  });

  const sale = await Sale.create({
    timestamp,
    lines,
    source: 'pos',
    metadata
  });

  await stockService.applySaleToStock(sale);
  eventBus.emit(EVENT_TYPES.SALE_RECORDED, sale);

  res.status(202).json({ received: true });
});
