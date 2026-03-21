import crypto from 'crypto';

/**
 * Generates a cryptographically secure random token as a lowercase hex string.
 * Default 32 bytes → 64 hex characters.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * SHA-256 hashes a raw token for database storage.
 * SECURITY: only the hash is ever written to the DB — the raw token is sent to
 * the client once and never stored plaintext.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a unique placeholder username for new Google users pending onboarding.
 * Format: _g_<timestamp_base36>_<random_6_chars>
 * Replaced permanently when the user completes username selection.
 */
export function generatePendingUsername(): string {
  return `_g_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}
