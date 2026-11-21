import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { COLUMN_TYPE, readMemory, tablesFromRows } from './memory';
import { writeMemory } from './memoryWriter';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'sportswidget');
const T = COLUMN_TYPE;

test('real decoded partial slice (Placard): tables, counts and typed values', () => {
  const tables = readMemory(new Uint8Array(fs.readFileSync(path.join(FIX, 'placard-partial.mem'))));
  assert.deepEqual(
    [...tables.keys()].sort(),
    ['AdditionalNumericValue', 'AdditionalValue', 'BinBag', 'MarketSmall', 'NodesInPlayDetail', 'NodesRaceDetail', 'Race', 'RepoContentSlice', 'ResultSmall', 'VirtualEventSmall'],
  );
  const meta = tables.get('RepoContentSlice')!;
  assert.equal(meta.count, 1);
  assert.equal(meta.get('repository_id', 0), 1795166563);
  assert.equal(meta.get('partial_index', 0), 65413);
  assert.equal(meta.get('cultures', 0), 'pt');
  assert.equal(meta.get('origin_timestamp', 0), 1795239860, 'u64 (long)');
  const results = tables.get('ResultSmall')!;
  assert.equal(results.count, 336);
  assert.equal(results.get('node_id', 0), 3134591616, 'long above 2^31');
  assert.equal(results.get('odd_map_id', 0), 156, 'u16');
  const markets = tables.get('MarketSmall')!;
  assert.deepEqual([markets.get('node_id', 0), markets.get('is_active', 0), markets.get('is_displayed', 0)], [926577714, false, false], 'bool bitset');
  const race = tables.get('Race')!;
  assert.equal(race.get('start_date', 0), Date.parse('2026-11-21T05:41:00Z') / 1000, 'date = u32 seconds');
  const inplay = tables.get('NodesInPlayDetail')!;
  assert.equal(JSON.parse(String(inplay.get('data', 0))).inPlay, true, 'utf-8 string through a pointer');
  assert.equal(inplay.has('data'), true);
  assert.equal(inplay.has('nope'), false);
  assert.equal(inplay.get('nope', 0), undefined);
});

test('round trip of every column type through the writer', () => {
  const buf = writeMemory({
    Things: {
      columns: [['b', T.BYTE], ['f', T.BOOL], ['s', T.SHORT], ['us', T.USHORT], ['i', T.INT], ['ui', T.UINT], ['d', T.DATE], ['l', T.LONG], ['t', T.STRING]],
      rows: [
        [7, true, -2, 65535, -5, 4000000000, 1795167138, 9007199254740991, 'Ténis'],
        [0, false, 300, 1, 2147483647, 0, 0, 3134591616, null],
        [255, true, 0, 0, 0, 1, 1, 0, ''],
      ],
    },
    Empty: { columns: [['id', T.UINT]], rows: [] },
  });
  const t = readMemory(buf).get('Things')!;
  assert.equal(t.count, 3);
  const row = (i: number) => ['b', 'f', 's', 'us', 'i', 'ui', 'd', 'l', 't'].map((c) => t.get(c, i));
  assert.deepEqual(row(0), [7, true, -2, 65535, -5, 4000000000, 1795167138, 9007199254740991, 'Ténis']);
  assert.deepEqual(row(1), [0, false, 300, 1, 2147483647, 0, 0, 3134591616, null]);
  assert.deepEqual(row(2), [255, true, 0, 0, 0, 1, 1, 0, '']);
  assert.equal(t.get('b', 3), undefined, 'past the end');
  assert.equal(readMemory(buf).get('Empty')!.count, 0);
});

test('bad tags, truncated buffers and multi-partition columns are format errors (never a silent misread)', () => {
  const good = writeMemory({ A: { columns: [['id', T.UINT]], rows: [[1]] } });
  assert.throws(() => readMemory(new Uint8Array([60, 104, 116, 109, 108])), ProviderFormatError, 'HTML is not a memory');
  assert.throws(() => readMemory(good.slice(0, 12)), ProviderFormatError, 'truncated header');
  const badTable = good.slice();
  const tableAt = badTable[18]! | (badTable[19]! << 8);
  badTable[tableAt] = 0;
  assert.throws(() => readMemory(badTable), ProviderFormatError);
  const badColumn = good.slice();
  const colAt = badColumn[tableAt + 10]! | (badColumn[tableAt + 11]! << 8);
  badColumn[colAt] = 0;
  assert.throws(() => readMemory(badColumn), ProviderFormatError);
  const partitioned = good.slice();
  partitioned[colAt + 16] = 9;
  assert.throws(() => readMemory(partitioned), /partition/);
  const outOfRange = good.slice();
  outOfRange[colAt + 11] = 200; // count far past the buffer
  assert.throws(() => readMemory(outOfRange), ProviderFormatError);
});

test('unknown column types are left out (a new column does not break the reader)', () => {
  const buf = writeMemory({ A: { columns: [['id', T.UINT], ['x', T.UINT]], rows: [[1, 2]] } });
  const t0 = readMemory(buf).get('A')!;
  const colAt = (() => {
    const tableAt = buf[18]! | (buf[19]! << 8);
    return buf[tableAt + 14]! | (buf[tableAt + 15]! << 8);
  })();
  buf[colAt + 15] = 99;
  const t = readMemory(buf).get('A')!;
  assert.equal(t0.get('x', 0), 2);
  assert.equal(t.has('x'), false);
  assert.equal(t.get('id', 0), 1);
});

test('tablesFromRows gives the same Table interface (used by fixtures)', () => {
  const t = tablesFromRows({ Event: { columns: ['node_id', 'is_displayed'], rows: [[5, true], [6, false]] } }).get('Event')!;
  assert.equal(t.count, 2);
  assert.equal(t.get('node_id', 1), 6);
  assert.equal(t.get('is_displayed', 0), true);
  assert.equal(t.has('node_id'), true);
  assert.equal(t.get('missing', 0), undefined);
});
