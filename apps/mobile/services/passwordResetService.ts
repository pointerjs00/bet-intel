import axios from 'axios';
import { apiClient } from './apiClient';

/** Body of POST /auth/reset-password; must satisfy the shared resetPasswordSchema (which requires confirmPassword). */
export function buildResetPasswordPayload(token: string, newPassword: string, confirmPassword: string) {
  return { token, newPassword, confirmPassword };
}

/** Completes a password reset with the token from the email link. */
export async function resetPasswordRequest(token: string, newPassword: string, confirmPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', buildResetPasswordPayload(token, newPassword, confirmPassword));
}

/** True when the API rejected the reset token as invalid or expired (HTTP 400). */
export function isInvalidResetTokenError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 400;
}
