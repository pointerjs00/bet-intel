import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeFrame, readFrames } from './grpcWeb';
import { decodeMatchFrame, encodeMatchRequest } from './schema';

const DIR = join(__dirname, '../../__fixtures__/betclic');
const fixture = (name: string) => new Uint8Array(Buffer.from(readFileSync(join(DIR, `${name}.b64`), 'utf8'), 'base64'));

/** A trailer frame (flag 0x80) with the given header text. */
function trailer(text: string): Uint8Array {
  const body = Buffer.from(text, 'utf8');
  const out = new Uint8Array(5 + body.length);
  out[0] = 0x80;
  new DataView(out.buffer).setUint32(1, body.length, false);
  out.set(body, 5);
  return out;
}

const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p))));

test('encodeFrame: flag 0, big-endian length, then the bytes', () => {
  assert.deepEqual([...encodeFrame(new Uint8Array([7, 8, 9]))], [0, 0, 0, 0, 3, 7, 8, 9]);
  assert.deepEqual([...encodeFrame(new Uint8Array(0))], [0, 0, 0, 0, 0]);
  const big = encodeFrame(new Uint8Array(300));
  assert.deepEqual([...big.subarray(0, 5)], [0, 0, 0, 1, 44]);
  assert.equal(big.length, 305);
});

test('encodeFrame wraps a real request exactly', () => {
  const req = encodeMatchRequest({ matchId: '1280435240828928', language: 'pt' });
  const framed = encodeFrame(req);
  assert.equal(framed.length, req.length + 5);
  assert.deepEqual([...framed.subarray(5)], [...req]);
});

test('readFrames: data frames, trailer and grpc-status', () => {
  const buf = concat(encodeFrame(new Uint8Array([1, 2])), encodeFrame(new Uint8Array([3])), trailer('grpc-status: 14\r\ngrpc-message: A%20task%20was%20canceled\r\n'));
  const r = readFrames(buf);
  assert.deepEqual(r.data.map((d) => [...d]), [[1, 2], [3]]);
  assert.equal(r.grpcStatus, 14);
  assert.equal(r.grpcMessage, 'A task was canceled');
  assert.equal(r.trailers?.['grpc-status'], '14');
  assert.equal(r.rest.length, 0);
});

test('readFrames: an incomplete frame is left in rest', () => {
  const full = encodeFrame(new Uint8Array([1, 2, 3, 4]));
  const r = readFrames(concat(encodeFrame(new Uint8Array([9])), full.subarray(0, 6)));
  assert.deepEqual(r.data.map((d) => [...d]), [[9]]);
  assert.equal(r.trailers, null);
  assert.equal(r.grpcStatus, null);
  assert.equal(r.rest.length, 6);
  // A header split across chunks is also incomplete.
  assert.equal(readFrames(full.subarray(0, 3)).rest.length, 3);
});

test('readFrames: a trailers-only error response has no data', () => {
  const r = readFrames(trailer('grpc-status:12\r\ngrpc-message:Method not implemented\r\n'));
  assert.equal(r.data.length, 0);
  assert.equal(r.grpcStatus, 12);
  assert.equal(r.grpcMessage, 'Method not implemented');
});

test('readFrames round-trips a recorded snapshot', () => {
  const bytes = fixture('football-match-detail');
  const r = readFrames(concat(encodeFrame(bytes), encodeFrame(new Uint8Array([1, 2, 3])), trailer('grpc-status: 0\r\n')));
  assert.equal(r.data.length, 2);
  assert.equal(r.data[0]!.length, bytes.length);
  assert.equal(decodeMatchFrame(r.data[0]!).match?.name, 'Estónia - Bulgária');
  assert.equal(r.grpcStatus, 0);
});
