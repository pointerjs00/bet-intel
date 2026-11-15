import axios from 'axios';
import { apiClient } from './apiClient';

/** Completes a password reset with the token from the email link. */
export async function resetPasswordRequest(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, newPassword });
}

/** True when the API rejected the reset token as invalid or expired (HTTP 400). */
export function isInvalidResetTokenError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 400;
}
