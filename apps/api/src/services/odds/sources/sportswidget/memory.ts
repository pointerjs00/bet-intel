/**
 * Reader of the pt-vision "memory" format: a decoded (LZMA-decompressed) slice of the Placard / Solverde widget feed.
 * Little-endian, columnar, self-describing (from the widget's published `pt-vision-memory-storage` raw constants):
 *
 *  - memory header (18 bytes): tag 201, total length i32, header length u16, creation date u32, `maxTables` u16 @11,
 *    next free i32, end tag 202 @17; then `maxTables` table pointers (i32, absolute; 0 = no table) from @18.
 *  - table: tag 203, total i32, header length u16, `nColumns` u16 @+7, end tag 204 @+9, column pointers (i32) from
 *    @+10, then the name (u16 length + UTF-8).
 *  - column: tag 206, total i32, header length u16 @+5, max items i32, `count` i32 @+11, `type` u8 @+15, next
 *    partition i32 @+16 (always 0 in slices), end tag 207 @+20, name @+21; items start at column + header length.
 *  - item types: 0 byte, 1 bool (bitset), 2 i16, 3 u16, 4 i32, 5 u32, 6 date (u32 seconds), 7 long (u64),
 *    10 string (i32 absolute pointer to a u16-length + UTF-8 string; 0 = null).
 *
 * Every tag and offset is checked: a layout change is a `ProviderFormatError`, never a silent misread. A column of an
 * unknown type is left out (a new column must not break the reader). Dates are returned as seconds.
 */
import { ProviderFormatError } from '../../../sportsData/providerHealth';

/** Column item types. */
export const COLUMN_TYPE = { BYTE: 0, BOOL: 1, SHORT: 2, USHORT: 3, INT: 4, UINT: 5, DATE: 6, LONG: 7, STRING: 10 } as const;

/** A decoded table: `get(column, row)` is `undefined` for a missing column or a row past its end. */
export interface Table {
  readonly name: string;
  readonly count: number;
  has(column: string): boolean;
  get(column: string, row: number): unknown;
}

/** Tables of one slice, by name. */
export type Tables = Map<string, Table>;

const decoder = new TextDecoder('utf-8');
const WIDTH: Record<number, number> = { 0: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 8, 10: 4 };

/** Reads one decoded slice. Throws `ProviderFormatError` when the bytes are not a well-formed memory. */
export function readMemory(m: Uint8Array): Tables {
  const fail = (what: string): never => {
    throw new ProviderFormatError(`sportswidget memory: ${what}`);
  };
  const need = (offset: number, length: number, what: string) => {
    if (offset < 0 || offset + length > m.length) fail(`${what} out of range`);
  };
  const u16 = (o: number) => m[o]! | (m[o + 1]! << 8);
  const i32 = (o: number) => m[o]! | (m[o + 1]! << 8) | (m[o + 2]! << 16) | (m[o + 3]! << 24);
  const u32 = (o: number) => i32(o) >>> 0;
  const str = (o: number, what: string) => {
    need(o, 2, what);
    const n = u16(o);
    need(o + 2, n, what);
    return n ? decoder.decode(m.subarray(o + 2, o + 2 + n)) : '';
  };

  need(0, 18, 'header');
  if (m[0] !== 201 || m[17] !== 202) fail(`bad header tags ${m[0]}/${m[17]}`);
  const maxTables = u16(11);
  need(18, maxTables * 4, 'table pointers');
  const tables: Tables = new Map();
  for (let t = 0; t < maxTables; t++) {
    const to = i32(18 + t * 4);
    if (to === 0) continue;
    need(to, 10, 'table header');
    if (m[to] !== 203 || m[to + 9] !== 204) fail(`bad table tags at ${to}`);
    const nColumns = u16(to + 7);
    need(to + 10, nColumns * 4, 'column pointers');
    const name = str(to + 10 + nColumns * 4, 'table name');
    const columns = new Map<string, { count: number; read: (i: number) => unknown }>();
    let count = 0;
    for (let c = 0; c < nColumns; c++) {
      const co = i32(to + 10 + c * 4);
      need(co, 21, `column ${c} of ${name}`);
      if (m[co] !== 206 || m[co + 20] !== 207) fail(`bad column tags in ${name}`);
      if (i32(co + 16) !== 0) fail(`multi-partition column in ${name}`);
      const headerLength = u16(co + 5);
      const n = i32(co + 11);
      const type = m[co + 15]!;
      const colName = str(co + 21, `column name in ${name}`);
      if (n < 0) fail(`negative count in ${name}.${colName}`);
      const io = co + headerLength;
      let read: ((i: number) => unknown) | null = null;
      if (type === COLUMN_TYPE.BOOL) {
        need(io, Math.ceil(n / 8), `${name}.${colName}`);
        read = (i) => ((m[io + (i >> 3)]! >>> (i & 7)) & 1) === 1;
      } else if (WIDTH[type] !== undefined) {
        need(io, n * WIDTH[type]!, `${name}.${colName}`);
        switch (type) {
          case COLUMN_TYPE.BYTE:
            read = (i) => m[io + i];
            break;
          case COLUMN_TYPE.SHORT:
            read = (i) => (u16(io + i * 2) << 16) >> 16;
            break;
          case COLUMN_TYPE.USHORT:
            read = (i) => u16(io + i * 2);
            break;
          case COLUMN_TYPE.INT:
            read = (i) => i32(io + i * 4);
            break;
          case COLUMN_TYPE.UINT:
          case COLUMN_TYPE.DATE:
            read = (i) => u32(io + i * 4);
            break;
          case COLUMN_TYPE.LONG:
            read = (i) => u32(io + i * 8 + 4) * 4294967296 + u32(io + i * 8);
            break;
          case COLUMN_TYPE.STRING:
            read = (i) => {
              const p = i32(io + i * 4);
              return p === 0 ? null : str(p, `${name}.${colName}[${i}]`);
            };
            break;
        }
      }
      if (!read) continue; // unknown type: left out
      columns.set(colName, { count: n, read });
      count = Math.max(count, n);
    }
    tables.set(name, {
      name,
      count,
      has: (col) => columns.has(col),
      get: (col, row) => {
        const c = columns.get(col);
        return c && row >= 0 && row < c.count ? c.read(row) : undefined;
      },
    });
  }
  return tables;
}

/** Same `Table` interface over plain rows (fixtures, tests). */
export function tablesFromRows(spec: Record<string, { columns: string[]; rows: unknown[][] }>): Tables {
  const tables: Tables = new Map();
  for (const [name, { columns, rows }] of Object.entries(spec)) {
    const index = new Map(columns.map((c, i) => [c, i] as const));
    tables.set(name, {
      name,
      count: rows.length,
      has: (col) => index.has(col),
      get: (col, row) => {
        const i = index.get(col);
        return i === undefined || row < 0 || row >= rows.length ? undefined : rows[row]![i];
      },
    });
  }
  return tables;
}
