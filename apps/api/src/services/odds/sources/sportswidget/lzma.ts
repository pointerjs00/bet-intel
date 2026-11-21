/**
 * LZMA ("alone" format, props 0x5d) decoding of the widget's slices with the house's own `/library/lzma.wasm`
 * (11 KB, AssemblyScript), through Node's WebAssembly API, exactly as the widget's `VisionMemoryDecoder` does:
 * `reset()` → `newU8Array(n)` → copy the input at `ptr + 24` → `decode(ptr)` → `[ok, err, size, dataPtr]` (u32) →
 * output at `dataPtr + 24`. No npm dependency.
 *
 * The module is compiled once per house; `loadLzma` returns a factory of decoders and each sync takes a fresh one
 * (fresh linear memory), so the ~15 MB the largest slice grows the memory to is released after the sync, like the
 * widget's `resetMemory`. Any failure is a `ProviderFormatError`.
 */
import { ProviderFormatError } from '../../../sportsData/providerHealth';

/** Offset of the bytes inside an AssemblyScript array allocation. */
export const AS_ARRAY_OFFSET = 24;

/** Exports of the widget's lzma.wasm that the decoder uses. */
export interface LzmaExports {
  reset(): void;
  newU8Array(length: number): number;
  decode(pointer: number): number;
}

/** Decodes one compressed slice into its memory bytes. */
export type Decode = (input: Uint8Array) => Uint8Array;

/** A decoder over an instantiated module and its linear memory. */
export function decoderFor(memory: WebAssembly.Memory, lz: LzmaExports): Decode {
  return (input) => {
    // LZMA "alone": properties byte 0x5d (lc=3, lp=0, pb=2) first. Anything else (an HTML page) is not a slice.
    if (input.length < 13 || input[0] !== 0x5d) throw new ProviderFormatError('sportswidget: slice is not an LZMA stream');
    try {
      lz.reset();
      const p = lz.newU8Array(input.length);
      new Uint8Array(memory.buffer, p + AS_ARRAY_OFFSET, input.length).set(input);
      const rp = lz.decode(p);
      const [ok, err, size, dp] = new Uint32Array(memory.buffer, rp, 4);
      if (!ok) throw new ProviderFormatError(`sportswidget: LZMA decode failed (error ${err})`);
      return new Uint8Array(memory.buffer, dp! + AS_ARRAY_OFFSET, size).slice();
    } catch (err) {
      if (err instanceof ProviderFormatError) throw err;
      throw new ProviderFormatError(`sportswidget: LZMA decode failed (${err instanceof Error ? err.message : String(err)})`);
    }
  };
}

/** Compiles the house's wasm once; the returned function makes a decoder with a fresh memory. */
export function loadLzma(wasm: Uint8Array): () => Decode {
  let module: WebAssembly.Module;
  try {
    module = new WebAssembly.Module(new Uint8Array(wasm));
  } catch (err) {
    throw new ProviderFormatError(`sportswidget: lzma.wasm is not a wasm module (${err instanceof Error ? err.message : String(err)})`);
  }
  return () => {
    const memory = new WebAssembly.Memory({ initial: 10 });
    try {
      const instance = new WebAssembly.Instance(module, { env: { memory, abort: () => undefined } });
      const lz = instance.exports as unknown as LzmaExports;
      if (typeof lz.reset !== 'function' || typeof lz.newU8Array !== 'function' || typeof lz.decode !== 'function') {
        throw new Error('missing exports');
      }
      return decoderFor(memory, lz);
    } catch (err) {
      throw new ProviderFormatError(`sportswidget: lzma.wasm cannot be instantiated (${err instanceof Error ? err.message : String(err)})`);
    }
  };
}
