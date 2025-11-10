import winston from 'winston';

const enumerateErrorFormat = winston.format(info => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.message, stack: info.stack });
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    enumerateErrorFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
          const base = `${timestamp} ${level}: ${message}`;
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return stack ? `${base}\n${stack}${metaString}` : `${base}${metaString}`;
        })
      )
    })
  ]
});

export default logger;

