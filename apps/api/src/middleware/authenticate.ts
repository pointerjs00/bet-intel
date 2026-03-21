import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth/tokenService';
import { logger } from '../utils/logger';

/**
 * JWT authentication middleware.
 * Expects: `Authorization: Bearer <access_token>`
 *
 * On success: attaches decoded payload to `req.user` and calls next().
 * On failure: responds 401. Never calls next(error) to avoid leaking details.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Token de autenticação em falta' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { sub: payload.sub, email: payload.email, username: payload.username };
    next();
  } catch (err) {
    const isExpired = err instanceof Error && err.name === 'TokenExpiredError';
    logger.debug('Authentication failed', { reason: isExpired ? 'expired' : 'invalid' });
    res.status(401).json({
      success: false,
      error: isExpired ? 'Token expirado' : 'Token inválido',
      code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
}
