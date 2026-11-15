import test from 'node:test';
import assert from 'node:assert/strict';
import { resetPasswordSchema } from '@betintel/shared';

// passwordResetService imports axios/apiClient (React Native); stub them so the pure builder loads.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === 'axios') return { isAxiosError: () => false };
  if (request === './apiClient') return { apiClient: {} };
  return origLoad.call(this, request, ...rest);
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildResetPasswordPayload } = require('./passwordResetService');
Module._load = origLoad;

test('reset payload parses with the shared resetPasswordSchema', () => {
  const payload = buildResetPasswordPayload('tok', 'Abcdef1!', 'Abcdef1!');
  assert.equal(resetPasswordSchema.safeParse(payload).success, true);
});

test('reset payload without confirmPassword would be rejected (regression)', () => {
  assert.equal(resetPasswordSchema.safeParse({ token: 'tok', newPassword: 'Abcdef1!' }).success, false);
});
