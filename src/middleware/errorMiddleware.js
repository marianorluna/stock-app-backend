import logger from '../config/logger.js';

//middleware que maneja errores no capturados y los formatea para la respuesta
const errorMiddleware = (err, req, res, next) => {
  logger.error('Unhandled error', { err });

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
};

export default errorMiddleware;

