import { EventEmitter } from 'node:events';
import logger from '../config/logger.js';

export const EVENT_TYPES = Object.freeze({
  SALE_RECORDED: 'SALE_RECORDED',
  PURCHASE_RECORDED: 'PURCHASE_RECORDED',
  WASTAGE_RECORDED: 'WASTAGE_RECORDED'
});

class EventBus extends EventEmitter {
  emit(eventName, payload) {
    logger.debug(`Emitting event ${eventName}`, { payload });
    super.emit(eventName, payload);
  }
}

const eventBus = new EventBus();

export default eventBus;

