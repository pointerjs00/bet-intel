import test from 'node:test';
import assert from 'node:assert/strict';
import { UnknownSessionError, createImpersonateTransport, createUndiciTransport } from './transport';

interface Call { url: string; init: RequestInit }

function fakeFetch(respond: (calls: Call[]) => Response): { fn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond(calls);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('impersonate transport sends token and ordered header array as JSON', async () => {
  const { fn, calls } = fakeFetch(() => json({ status: 200, headers: {}, text: 'ok', url: 'https://x/' }));
  const t = createImpersonateTransport('http://egress:8765/', 'tok', 1000, fn);
  const r = await t.fetch('sid1', 'https://x/', { headers: [['b', '1'], ['a', '2']] });
  assert.equal(r.text, 'ok');
  assert.equal(calls[0]!.url, 'http://egress:8765/fetch');
  assert.equal((calls[0]!.init.headers as Record<string, string>)['x-egress-token'], 'tok');
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), {
    sid: 'sid1',
    url: 'https://x/',
    method: 'GET',
    headers: [['b', '1'], ['a', '2']],
  });
});

test('impersonate transport maps 404 on /fetch and /cookies to UnknownSessionError', async () => {
  const { fn } = fakeFetch(() => json({ error: 'unknown session' }, 404));
  const t = createImpersonateTransport('http://e', 'tok', 1000, fn);
  await assert.rejects(t.fetch('s', 'https://x/'), UnknownSessionError);
  await assert.rejects(t.cookies('s'), UnknownSessionError);
  await assert.rejects(t.setCookies('s', {}), UnknownSessionError);
});

test('impersonate transport throws a plain Error on other non-2xx; ping is false on failure', async () => {
  const { fn } = fakeFetch(() => json({}, 500));
  const t = createImpersonateTransport('http://e', 'tok', 1000, fn);
  await assert.rejects(t.fetch('s', 'https://x/'), (e: Error) => !(e instanceof UnknownSessionError) && /HTTP 500/.test(e.message));
  assert.equal(await t.ping(), false);
});

test('undici transport stores Set-Cookie pairs and replays them as a cookie header', async () => {
  const { fn, calls } = fakeFetch((c) => {
    const h = new Headers();
    if (c.length === 1) {
      h.append('set-cookie', 'a=1; Path=/; HttpOnly');
      h.append('set-cookie', 'b=2; Secure');
    }
    return new Response('hi', { status: 200, headers: h });
  });
  const t = createUndiciTransport(fn);
  const sid = await t.session();
  await t.fetch(sid, 'https://x/');
  assert.deepEqual(await t.cookies(sid), { a: '1', b: '2' });
  await t.fetch(sid, 'https://x/');
  assert.equal(new Headers(calls[1]!.init.headers).get('cookie'), 'a=1; b=2');
});
