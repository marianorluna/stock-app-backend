import http from 'node:http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import createApp from './app.js';
import connectDatabase from './config/database.js';
import logger from './config/logger.js';
import { initializeFirebase } from './config/firebase.js';
import eventBus, { EVENT_TYPES } from './core/eventBus.js';
import './subscribers/inventorySubscriber.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const getDatabaseUri = () => {
  if (NODE_ENV === 'production') {
    return process.env.MONGODB_URI_ATLAS ?? process.env.MONGODB_URI;
  }

  return process.env.MONGODB_URI;
};
const MONGODB_URI = getDatabaseUri();

//inicializa la conexión a la base de datos, crea el servidor http y configura websocket
const bootstrap = async () => {
  if (!MONGODB_URI) {
    logger.error('Database URI is not configured', { NODE_ENV });
    process.exit(1);
  }

  await connectDatabase(MONGODB_URI);

  //inicializar Firebase Admin SDK
  initializeFirebase();

  const app = createApp();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN?.split(',') ?? '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info('Client connected to WebSocket', { socketId: socket.id });
  });

  eventBus.on(EVENT_TYPES.SALE_RECORDED, (sale) => {
    io.emit('inventory:sale', sale);
  });

  eventBus.on(EVENT_TYPES.PURCHASE_RECORDED, (purchase) => {
    io.emit('inventory:purchase', purchase);
  });

  eventBus.on(EVENT_TYPES.WASTAGE_RECORDED, (wastage) => {
    io.emit('inventory:wastage', wastage);
  });

  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} ✅`);
  });
};

bootstrap().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

