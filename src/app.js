import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import apiRouter from './routes/index.js';
import errorMiddleware from './middleware/errorMiddleware.js';

//crea y configura la aplicación express con middlewares y rutas
const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN?.split(',') ?? '*'
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  app.use('/api', apiRouter);

  app.use(errorMiddleware);

  return app;
};

export default createApp;

