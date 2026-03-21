import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

/**
 * Application-wide Winston logger.
 * Logs in structured JSON in production; colourised simple format in development.
 * SECURITY: never log passwords, raw tokens, or full email addresses in production.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? combine(timestamp(), json())
          : combine(colorize(), simple()),
    }),
  ],
});
