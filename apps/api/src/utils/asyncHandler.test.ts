import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from './asyncHandler';

const req = {} as Request;
const res = {} as Response;

test('asyncHandler forwards a rejection to next', async () => {
  const boom = new Error('boom');
  let received: unknown;
  const next: NextFunction = (err?: unknown) => { received = err; };
  asyncHandler(async () => { throw boom; })(req, res, next);
  await new Promise((r) => setImmediate(r));
  assert.equal(received, boom);
});

test('asyncHandler does not call next when the handler resolves', async () => {
  let called = false;
  let ran = false;
  const next: NextFunction = () => { called = true; };
  asyncHandler(async () => { ran = true; })(req, res, next);
  await new Promise((r) => setImmediate(r));
  assert.equal(ran, true);
  assert.equal(called, false);
});
