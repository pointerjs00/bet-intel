import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { createBetanoSession, isChallenge, WARM_TTL_MS, CHALLENGE_KEY, type LockStore } from './session';
import { UnknownSessionError, type BetanoTransport } from './transport';

type Page = { status: number; text: string } | 'unknown';

function harness(pages: Page[]) {
  const calls: Array<{ sid: string; url: string }> = [];
  let n = 0;
  let clock = 1_000_000;
  const store = new Map<string, string>();
  const transport: BetanoTransport = {
    ping: async () => true,
    session: async () => `s${++n}`,
    destroy: async () => undefined,
    fetch: async (sid, url) => {
      calls.push({ sid, url });
      const next = pages.shift() ?? { status: 200, text: '{}' };
      if (next === 'unknown') throw new UnknownSessionError();
      return { ...next, headers: {}, url };
    },
    cookies: async () => ({ __cf_bm: 'x' }),
    setCookies: async () => undefined,
  };
  // Honours NX: 'OK' when absent, null when present.
  const redis = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, _mode: 'EX', _seconds: number, nx?: 'NX') => {
      if (nx === 'NX' && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
    del: async (k: string) => void store.delete(k),
  } as LockStore;
  const session = createBetanoSession({
    transport,
    redis,
    log: { warn: () => undefined },
    sleep: async () => undefined,
    now: () => clock,
  });
  return { session, calls, store, advance: (ms: number) => void (clock += ms) };
}

const ok: Page = { status: 200, text: '' };
const blocked: Page = { status: 403, text: 'Just a moment...' };
const URL_A = 'https://www.betano.pt/a';

describe('betano session', () => {
  it('warms up before the first data call', async () => {
    const { session, calls } = harness([ok, ok]);
    await session.warmUp();
    assert.equal(calls[0]!.url, 'https://www.betano.pt/');
    assert.equal(calls.length, 2);
  });

  it('keeps the warm session across calls', async () => {
    const { session, calls } = harness([ok, ok]);
    await session.request(URL_A);
    await session.request('https://www.betano.pt/b');
    assert.equal(calls.length, 4);
  });

  it('retries once on a challenge, then marks it', async () => {
    const { session, store } = harness([ok, ok, blocked, ok, ok, blocked]);
    await assert.rejects(session.request(URL_A), /blocked/);
    assert.ok(store.has(CHALLENGE_KEY));
  });

  it('detects a challenge by header as well as body', () => {
    assert.equal(isChallenge({ status: 200, headers: { 'cf-mitigated': 'challenge' }, text: '', url: '' }), true);
    assert.equal(isChallenge({ status: 200, headers: {}, text: '<html>ok</html>', url: '' }), false);
  });

  it('releases the warm lock after warm-up', async () => {
    const { session, store } = harness([ok, ok]);
    await session.warmUp();
    assert.equal(store.has('betano:warm'), false);
  });

  it('releases the warm lock when warm-up fails', async () => {
    const { session, store } = harness([blocked]);
    await assert.rejects(session.warmUp(), ProviderFormatError);
    assert.equal(store.has('betano:warm'), false);
  });

  it('warm-up challenge sets the challenge key and throws ProviderFormatError', async () => {
    const { session, store } = harness([blocked]);
    await assert.rejects(session.warmUp(), ProviderFormatError);
    assert.ok(store.has(CHALLENGE_KEY));
  });

  it('rebuilds the session on UnknownSessionError without setting the challenge key', async () => {
    const { session, store, calls } = harness([ok, ok, 'unknown', ok, ok, ok]);
    const res = await session.request(URL_A);
    assert.equal(res.status, 200);
    assert.equal(store.has(CHALLENGE_KEY), false);
    assert.equal(calls[2]!.sid, 's1');
    assert.equal(calls[5]!.sid, 's2');
  });

  it('a second UnknownSessionError becomes ProviderFormatError, no challenge key', async () => {
    const { session, store } = harness([ok, ok, 'unknown', ok, ok, 'unknown']);
    await assert.rejects(session.request(URL_A), ProviderFormatError);
    assert.equal(store.has(CHALLENGE_KEY), false);
  });

  it('reuses the warm session within WARM_TTL_MS and rebuilds after', async () => {
    const { session, calls, advance } = harness([]);
    await session.request(URL_A);
    advance(WARM_TTL_MS - 1);
    await session.request('https://www.betano.pt/b');
    assert.equal(calls.length, 4);
    assert.equal(calls[3]!.sid, 's1');
    advance(2);
    await session.request('https://www.betano.pt/c');
    assert.equal(calls.length, 7);
    assert.equal(calls[6]!.sid, 's2');
  });

  it('a failed warm-up leaves the jar cold (no sid, not warm)', async () => {
    const { session } = harness([ok, blocked]);
    await assert.rejects(session.warmUp(), ProviderFormatError);
    const j = await session.jar.read();
    assert.equal(j.sid, null);
    assert.equal(j.warmedAt, 0);
  });

  it('a non-owner waits and reuses the sid warmed by the lock holder', async () => {
    const { session, store, calls } = harness([]);
    store.set('betano:warm', 'other');
    store.set(
      'betano:jar',
      JSON.stringify({ sid: 'warm-sid', cookies: {}, warmedAt: 1_000_000 }),
    );
    // warmUp read of the jar after the wait sees a fresh warmedAt (clock is 1_000_000).
    const sid = await session.warmUp();
    assert.equal(sid, 'warm-sid');
    assert.equal(calls.length, 0);
  });

  it('a non-owner never warms in parallel: cold jar after the wait fails with warm-up em curso', async () => {
    const { session, store, calls } = harness([ok]);
    store.set('betano:warm', 'other');
    await assert.rejects(session.warmUp(), /warm-up em curso/);
    assert.equal(calls.length, 0);
    assert.equal(store.get('betano:warm'), 'other');
  });

  it('a non-owner fails with challenged when the challenge flag is set after the wait', async () => {
    const { session, store, calls } = harness([ok]);
    store.set('betano:warm', 'other');
    store.set(CHALLENGE_KEY, 'warm-up /: HTTP 403');
    await assert.rejects(session.warmUp(), /challenged: warm-up/);
    assert.equal(calls.length, 0);
  });

  it('fails fast without network while the challenge flag is set', async () => {
    const { session, store, calls } = harness([]);
    store.set(CHALLENGE_KEY, 'warm-up /: HTTP 403');
    await assert.rejects(session.request(URL_A), /challenged: warm-up/);
    assert.equal(calls.length, 0);
  });
});
