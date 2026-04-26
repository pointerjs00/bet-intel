import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../utils/redis';

/**
 * Creates a rate-limit middleware backed by Redis so limits are shared
 * across all API instances (important when running multiple containers).
 */
function createLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,  // Sets RateLimit-* headers (RFC 6585)
    legacyHeaders: false,
    message: { success: false, error: options.message },
    store: new RedisStore({
      prefix: `rl:${options.keyPrefix}:`,
      sendCommand: ((...args: string[]) =>
        redis.call(args[0]!, ...args.slice(1))) as import('rate-limit-redis').SendCommandFn,
    }),
  });
}

/** POST /api/auth/login — 10 requests per 15 minutes per IP */
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiadas tentativas de login. Tenta novamente em 15 minutos.',
  keyPrefix: 'login',
});

/** POST /api/auth/register — 5 requests per hour per IP */
export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Demasiados registos a partir deste endereço. Tenta novamente mais tarde.',
  keyPrefix: 'register',
});

/** POST /api/auth/forgot-password — 3 requests per hour per IP */
export const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Demasiados pedidos de redefinição de password. Tenta novamente mais tarde.',
  keyPrefix: 'forgot-password',
});

/** POST /api/auth/google — 20 requests per 15 minutes per IP */
export const googleAuthLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiadas tentativas de login com Google. Tenta novamente em 15 minutos.',
  keyPrefix: 'google-auth',
});

/** All other authenticated routes — 500 requests per 15 minutes per IP */
export const defaultLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: 'Demasiados pedidos. Tenta novamente em 15 minutos.',
  keyPrefix: 'default',
});
