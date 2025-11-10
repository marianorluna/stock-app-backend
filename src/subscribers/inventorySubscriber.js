import eventBus, { EVENT_TYPES } from '../core/eventBus.js';
import logger from '../config/logger.js';

eventBus.on(EVENT_TYPES.SALE_RECORDED, (payload) => {
  logger.info('Sale recorded event', { id: payload._id });
});

eventBus.on(EVENT_TYPES.PURCHASE_RECORDED, (payload) => {
  logger.info('Purchase recorded event', { id: payload._id });
});

eventBus.on(EVENT_TYPES.WASTAGE_RECORDED, (payload) => {
  logger.info('Wastage recorded event', { id: payload._id });
});

