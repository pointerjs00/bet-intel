/** Pure password-rule helpers shared by the register and reset-password screens. */

export type PasswordStrengthLevel = 'weak' | 'medium' | 'strong';

export interface PasswordCheck {
  label: string;
  met: boolean;
}

/** Per-rule checklist matching the shared Zod password schema. */
export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: 'Mínimo 8 caracteres', met: password.length >= 8 },
    { label: 'Uma letra maiúscula', met: /[A-Z]/.test(password) },
    { label: 'Um número', met: /[0-9]/.test(password) },
    { label: 'Um carácter especial', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

/** Number of satisfied rules (0-4). */
export function getPasswordScore(password: string): number {
  return getPasswordChecks(password).filter((check) => check.met).length;
}

/** Maps a score to the strength bucket shown by the meter. */
export function getPasswordStrengthLevel(password: string): PasswordStrengthLevel {
  const score = getPasswordScore(password);
  if (score <= 1) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}
