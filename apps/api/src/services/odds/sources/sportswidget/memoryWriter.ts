/**
 * Writer of the pt-vision "memory" format, for tests only: it builds the decoded slices the adapter reads, so the
 * reader, the model and the I/O can be tested on small synthetic slices without the house's LZMA wasm.
 * Layout: see `memory.ts` (the reader is the authority; this mirrors it).
 */
import { COLUMN_TYPE } from './memory';

/** One table to write: its columns (name + type) and rows (one value per column; `null` = empty string pointer). */
export interface TableSpec {
  columns: [name: string, type: number][];
  rows: unknown[][];
}

class Bytes {
  private buf = new Uint8Array(1024);
  length = 0;
  private ensure(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  u8(v: number) {
    this.ensure(1);
    this.buf[this.length++] = v & 0xff;
  }
  u16(v: number) {
    this.u8(v);
    this.u8(v >>> 8);
  }
  i32(v: number) {
    this.u8(v);
    this.u8(v >>> 8);
    this.u8(v >>> 16);
    this.u8(v >>> 24);
  }
  u64(v: number) {
    let x = v;
    for (let i = 0; i < 8; i++) {
      this.u8(x % 256);
      x = Math.floor(x / 256);
    }
  }
  raw(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  str(s: string) {
    const b = new TextEncoder().encode(s);
    this.u16(b.length);
    this.raw(b);
  }
  patch32(at: number, v: number) {
    this.buf[at] = v & 0xff;
    this.buf[at + 1] = (v >>> 8) & 0xff;
    this.buf[at + 2] = (v >>> 16) & 0xff;
    this.buf[at + 3] = (v >>> 24) & 0xff;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Encodes tables into one decoded slice ("memory"). Values: numbers, booleans, strings (type 10) or null. */
export function writeMemory(tables: Record<string, TableSpec>): Uint8Array {
  const out = new Bytes();
  const names = Object.keys(tables);
  // Memory header: tag, total, header length, creation date, max tables, next free, end tag; then table pointers.
  out.u8(201);
  out.i32(0);
  out.u16(18 + names.length * 4);
  out.i32(0);
  out.u16(names.length);
  out.i32(0);
  out.u8(202);
  const tablePtrs = out.length;
  for (let i = 0; i < names.length; i++) out.i32(0);
  const strings: { at: number; value: string }[] = [];
  names.forEach((name, t) => {
    const spec = tables[name]!;
    out.patch32(tablePtrs + t * 4, out.length);
    out.u8(203);
    out.i32(0);
    out.u16(10 + spec.columns.length * 4);
    out.u16(spec.columns.length);
    out.u8(204);
    const colPtrs = out.length;
    for (let i = 0; i < spec.columns.length; i++) out.i32(0);
    out.str(name);
    spec.columns.forEach(([colName, type], c) => {
      out.patch32(colPtrs + c * 4, out.length);
      const nameLen = new TextEncoder().encode(colName).length;
      out.u8(206);
      out.i32(0);
      out.u16(21 + 2 + nameLen);
      out.i32(spec.rows.length);
      out.i32(spec.rows.length);
      out.u8(type);
      out.i32(0);
      out.u8(207);
      out.str(colName);
      const values = spec.rows.map((r) => r[c]);
      if (type === COLUMN_TYPE.BOOL) {
        for (let i = 0; i < values.length; i += 8) {
          let byte = 0;
          for (let b = 0; b < 8 && i + b < values.length; b++) if (values[i + b]) byte |= 1 << b;
          out.u8(byte);
        }
        return;
      }
      for (const v of values) {
        switch (type) {
          case COLUMN_TYPE.BYTE:
            out.u8(Number(v));
            break;
          case COLUMN_TYPE.SHORT:
          case COLUMN_TYPE.USHORT:
            out.u16(Number(v));
            break;
          case COLUMN_TYPE.INT:
          case COLUMN_TYPE.UINT:
          case COLUMN_TYPE.DATE:
            out.i32(Number(v));
            break;
          case COLUMN_TYPE.LONG:
            out.u64(Number(v));
            break;
          case COLUMN_TYPE.STRING:
            if (v === null || v === undefined) out.i32(0);
            else {
              strings.push({ at: out.length, value: String(v) });
              out.i32(0);
            }
            break;
          default:
            throw new Error(`writeMemory: unsupported column type ${type}`);
        }
      }
    });
  });
  for (const s of strings) {
    out.patch32(s.at, out.length);
    out.str(s.value);
  }
  const bytes = out.done();
  bytes[1] = bytes.length & 0xff;
  bytes[2] = (bytes.length >>> 8) & 0xff;
  bytes[3] = (bytes.length >>> 16) & 0xff;
  bytes[4] = (bytes.length >>> 24) & 0xff;
  return bytes;
}
