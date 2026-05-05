import { Request, Response, NextFunction } from 'express';

export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-key'];
  const expected = process.env.INTERNAL_ADMIN_KEY;

  if (!expected) {
    res.status(500).json({ success: false, error: 'INTERNAL_ADMIN_KEY not configured' });
    return;
  }

  if (!key || key !== expected) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }

  next();
}
