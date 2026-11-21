import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { AS_ARRAY_OFFSET, decoderFor, loadLzma, type LzmaExports } from './lzma';

/**
 * A stand-in for the widget's wasm with the same calling convention: `newU8Array(n)` returns a pointer whose bytes
 * start at +24, `decode(p)` returns a pointer to `[ok, err, size, dataPtr]` (u32) and the output starts at dataPtr+24.
 * Its "decompression" reverses the bytes, so the test can check what went in and what came out.
 */
function fakeLzma(memory: WebAssembly.Memory, opts: { fail?: boolean; trap?: boolean } = {}): LzmaExports & { resets: number } {
  let next = 64;
  const alloc = (n: number) => {
    const p = next;
    next += Math.ceil((n + AS_ARRAY_OFFSET + 8) / 8) * 8; // 8-aligned, like the real allocator
    return p;
  };
  const self = {
    resets: 0,
    reset() {
      self.resets++;
      next = 64;
    },
    newU8Array(n: number) {
      const p = alloc(n);
      new Uint32Array(memory.buffer, p, 1)[0] = n;
      return p;
    },
    decode(p: number) {
      if (opts.trap) throw new WebAssembly.RuntimeError('unreachable');
      const n = new Uint32Array(memory.buffer, p, 1)[0]!;
      const input = new Uint8Array(memory.buffer, p + AS_ARRAY_OFFSET, n);
      const out = alloc(n);
      new Uint8Array(memory.buffer, out + AS_ARRAY_OFFSET, n).set([...input].reverse());
      const rp = alloc(16);
      new Uint32Array(memory.buffer, rp, 4).set([opts.fail ? 0 : 1, opts.fail ? 7 : 0, n, out]);
      return rp;
    },
  };
  return self;
}

test('decoder follows the widget call sequence (reset, newU8Array, copy at +24, decode, read [ok, err, size, ptr])', () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const lz = fakeLzma(memory);
  const decode = decoderFor(memory, lz);
  const a = [0x5d, ...Array.from({ length: 15 }, (_, i) => i + 1)];
  const b = [0x5d, ...Array.from({ length: 20 }, (_, i) => 200 - i)];
  assert.deepEqual([...decode(new Uint8Array(a))], [...a].reverse());
  assert.deepEqual([...decode(new Uint8Array(b))], [...b].reverse());
  assert.equal(lz.resets, 2, 'reset before every slice');
});

const STREAM = new Uint8Array([0x5d, 0, 0, 0x40, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

test('a decode failure, a trap or input that is not an LZMA stream is a ProviderFormatError', () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  assert.throws(() => decoderFor(memory, fakeLzma(memory, { fail: true }))(STREAM), ProviderFormatError);
  assert.throws(() => decoderFor(memory, fakeLzma(memory, { trap: true }))(STREAM), ProviderFormatError);
  const html = new TextEncoder().encode('<html>challenge</html>');
  assert.throws(() => decoderFor(memory, fakeLzma(memory))(html), /not an LZMA/);
  assert.throws(() => decoderFor(memory, fakeLzma(memory))(new Uint8Array(0)), ProviderFormatError);
});

test('bytes that are not a wasm module are a ProviderFormatError', () => {
  assert.throws(() => loadLzma(new TextEncoder().encode('<!doctype html>')), ProviderFormatError);
});

// Optional check against the house's real wasm (kept out of the repo): set SPORTSWIDGET_LZMA_DIR to a folder with
// `lzma.wasm` and the compressed `partial65413.bin` of the committed `placard-partial.mem` fixture.
const DIR = process.env.SPORTSWIDGET_LZMA_DIR;
const hasReal = !!DIR && fs.existsSync(path.join(DIR, 'lzma.wasm')) && fs.existsSync(path.join(DIR, 'partial65413.bin'));
test('real lzma.wasm decodes the real partial slice into the committed fixture', { skip: hasReal ? false : 'SPORTSWIDGET_LZMA_DIR not set' }, () => {
  const newDecoder = loadLzma(new Uint8Array(fs.readFileSync(path.join(DIR!, 'lzma.wasm'))));
  const decode = newDecoder();
  const out = decode(new Uint8Array(fs.readFileSync(path.join(DIR!, 'partial65413.bin'))));
  const expected = fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'sportswidget', 'placard-partial.mem'));
  assert.equal(Buffer.compare(Buffer.from(out), expected), 0);
});
