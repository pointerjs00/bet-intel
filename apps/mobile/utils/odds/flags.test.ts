import test from 'node:test';
import assert from 'node:assert/strict';
import { flagUrlForCode } from './flags';

test('flagUrlForCode: ISO alpha-2 and UK nations to flagcdn; unknown or world codes to null', () => {
  assert.equal(flagUrlForCode('PT'), 'https://flagcdn.com/w40/pt.png');
  assert.equal(flagUrlForCode('es'), 'https://flagcdn.com/w40/es.png');
  assert.equal(flagUrlForCode('EU'), 'https://flagcdn.com/w40/eu.png');
  assert.equal(flagUrlForCode('GB-ENG'), 'https://flagcdn.com/w40/gb-eng.png');
  assert.equal(flagUrlForCode('ENG'), 'https://flagcdn.com/w40/gb-eng.png');
  assert.equal(flagUrlForCode('SCO'), 'https://flagcdn.com/w40/gb-sct.png');
  for (const c of [undefined, '', 'WW', 'INT', 'XX9', 'WORLD']) assert.equal(flagUrlForCode(c), null, String(c));
});
