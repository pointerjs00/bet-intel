# BetIntel — Adapter Betano (odds)

Runbook de implementação, do zero ao collector a correr num Raspberry Pi com IP residencial PT.

Estado: pronto a executar. As Partes A–J estão na ordem em que devem ser feitas.

---

## Desvios na implementação

Prevalece sobre as Partes abaixo onde diferir (as Partes ficam como foram escritas).

- **R1 Testes:** `node:test`, ficheiros irmãos (`session.test.ts`), registados no script `test` do `package.json`; não há vitest.
- **R2 Sidecar:** serviço Docker `betano-egress` em `deploy/pi/docker-compose.yml` (Dockerfile em `services/betano-egress/`), não systemd. A API chama `http://betano-egress:8765`; porta publicada só em `127.0.0.1:8765`. O Redis do host da Parte A não é preciso (Redis em Docker).
- **R3 Sidecar:** `urllib.parse.urljoin`; um lock por sessão; `/ping` devolve também o alvo resolvido; `HOST` por env; `sid` desconhecido dá 404 (só `POST /session` cria sessões); sessões expulsas/largadas são fechadas sob o seu próprio lock.
- **R4 Session:** o lock do warm-up liberta em `finally`; 404 do sidecar vira `UnknownSessionError` e o collector recria a sessão (retry único, sem marcar a flag).
- **R5 Contrato:** `getMarkets(houseEventId, { pageUrl })`; a página do evento é pedida com cabeçalhos de navegação; `pageUrl` obrigatório (só `www.betano.pt`).
- **R6 Solve:** `apps/api/src/scripts/betanoSolve.ts` (`pnpm --filter api betano:solve`), não `.mjs`. Gera o jar completo `{sid:null,cookies,warmedAt:0}` (ficheiro, ou Redis directo se houver `REDIS_URL`).
- **R7 Perfil:** `BETANO_BROWSER_MAJOR` por env; `curl_cffi` fixado em 0.17.0, onde `chrome` resolve para chrome152, logo o default é **152** (não 157) e tem de coincidir com o `resolved` do `/ping`.
- **R8 Calendário:** paginação com `URL.searchParams.set('page', p)`; fallback do calendário em `/api`; ligas em destaque só se o calendário vier vazio; a paginação pára no `totalCount` bruto; JSON de uma liga inválido não aborta a listagem.
- **R9 Env:** documentado em `apps/api/src/.env.example` e `deploy/pi/.env.example`.
- **Session/jar:** o jar só fica "quente" depois de todas as páginas de warm-up passarem; warm-up com challenge repõe o jar; enquanto `betano:challenge` existir, `request()` falha logo, sem rede (até aos 15 min de TTL ou ao solve), para proteger o IP de casa. `/odds/health` mostra `challenged: true, reason` em `odds-betano`.

Comandos adaptados (a partir da raiz do repo no Pi; `DC` abaixo):

```bash
DC="docker compose -f deploy/pi/docker-compose.yml --env-file /srv/betintel/.env"

# Parte G, passo 4 (probe a partir do container da API)
$DC exec -e ODDS_SOURCES=betano api node -e "
const { betanoSourceFactory } = require('./dist/services/odds/sources/betano');
const s = betanoSourceFactory(); const t = Date.now();
s.listEvents('FOOTBALL', new Date(t).toISOString(), new Date(t + 7.2e6).toISOString())
  .then(e => console.log('eventos:', e.length, e[0]));"

# Parte I
# Challenge: correr `pnpm --filter api betano:solve` (PC de casa, mesmo IP), depois
$DC exec -T redis redis-cli -x SET betano:jar < betano-jar.json
$DC exec -T redis redis-cli EXPIRE betano:jar 43200
$DC exec -T redis redis-cli DEL betano:challenge
# Jar suspeito
$DC exec -T redis redis-cli DEL betano:jar
# Parar tudo
$DC stop betano-egress     # e tirar `betano` de ODDS_SOURCES em /srv/betintel/.env
# Rollback do sidecar
$DC rm -sf betano-egress   # e remover o serviço do compose
```

---

## 0. Contexto

O comparador de odds lê o catálogo de várias casas. A Betclic já está implementada por gRPC-web e é a
referência de estilo. A Betano está por fazer.

A Betano corre sobre Cloudflare Bot Management e tem a DataDome referenciada na CSP. Do IP do VPS
devolve 403 em tudo; de um IP residencial português responde sem challenge. A recolha passa a correr
num Raspberry Pi em casa, com IP residencial PT e um IP fixo. O VPS sai do desenho.

Objectivo: um adapter que aguente volume sem ser pontuado como bot. O mecanismo é um cliente com o
handshake TLS e o enquadramento HTTP/2 de um browser real, sessão persistente e cookies coerentes.

**Não é preciso login, cookies de utilizador autenticado nem colocar apostas.** É leitura de endpoints
JSON públicos que o site já chama. Nenhuma credencial de conta entra no sistema.

### Decisões já tomadas (não reabrir)

| Decisão | Valor |
|---|---|
| Egress | Raspberry Pi em casa, IP residencial PT, um só IP |
| Fingerprint | `curl_cffi` num sidecar Python em loopback (`127.0.0.1:8765`) |
| Browser automatizado | Não. Nem Puppeteer nem Playwright no caminho de runtime |
| Perfil | Brave 157 / Windows, `sec-gpc: 1` |
| Sessão | Persistente, warm-up a cada 20 min, cookies em Redis |
| Challenge | Detetado, marcado, resolvido à mão quando acontece |
| Fallback | `fetch` directo quando não há sidecar configurado |

### Porque não `fetch` puro

O `undici` do Node tem um JA3 com forma de OpenSSL: a ordem das extensões do ClientHello é fixa no
stack TLS. O `curl_cffi` usa o stack do Chrome e reproduz JA3/JA4 e o fingerprint HTTP/2 à Akamai. Num
IP residencial com pouco tráfego o `fetch` passa; com o catálogo a correr de 10 em 10 minutos é a
diferença entre passar e ser limitado.

### Porque sidecar e não subprocess

Um `curl` por pedido abre conexão nova e perde metade do benefício. Um `Session` persistente do
`curl_cffi` reutiliza a conexão, a sessão TLS e o jar. O sidecar existe para manter esse objecto vivo
entre chamadas.

---

## 1. Regras para quem implementa

1. Não inventar ficheiros fora do inventário da secção 2.
2. Não acrescentar dependências sem justificação. As únicas novas são `curl_cffi` e `flask` (Python) e
   `playwright` como devDependency.
3. Seguir o estilo de `sources/betclic/index.ts`: mapeamento puro separado do I/O, `fetch` e `sleep`
   injectáveis, fixtures offline.
4. TypeScript `strict`. Sem `any` fora das fronteiras de JSON externo, e aí comentado.
5. Não parar para perguntar sobre os pontos da secção 9. Assumir, implementar, listar a suposição.
6. Correr as verificações da Parte G antes de dizer que está pronto.
7. Não alterar `canonical.ts`, `matcher.ts` nem `compare.ts`.

---

## 2. Inventário de ficheiros

Novos no repo:

```
apps/api/src/services/odds/sources/betano/profile.ts
apps/api/src/services/odds/sources/betano/transport.ts
apps/api/src/services/odds/sources/betano/jar.ts
apps/api/src/services/odds/sources/betano/session.ts
apps/api/src/services/odds/sources/betano/endpoints.ts
apps/api/src/services/odds/sources/betano/bootstrap.ts
apps/api/src/services/odds/sources/betano/map.ts
apps/api/src/services/odds/sources/betano/index.ts
apps/api/src/services/odds/sources/betano/__tests__/session.test.ts
apps/api/scripts/betano-solve.mjs
services/betano-egress/app.py
services/betano-egress/requirements.txt
services/betano-egress/betano-egress.service
services/betano-egress/README.md
```

Editados:

```
apps/api/src/services/odds/types.ts
apps/api/src/services/odds/service.ts
apps/api/src/services/odds/registry.ts
apps/api/src/services/sportsData/providerHealth.ts
.env.example
.gitignore
```

`HouseId` já contém `'betano'`. Não é preciso mexer.

---

## PARTE A — Preparar o Pi

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip redis-server

# Redis só em loopback, com password
sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sudo sed -i 's/^# requirepass .*/requirepass TROCA_ISTO_POR_UMA_PASSWORD_LONGA/' /etc/redis/redis.conf
sudo systemctl restart redis-server
redis-cli -a TROCA_ISTO_POR_UMA_PASSWORD_LONGA ping   # → PONG

# Relógio
sudo timedatectl set-ntp true
timedatectl status | grep -i synchronized   # → yes

# Conta de serviço
sudo mkdir -p /opt/betintel/betano-egress
sudo useradd -r -s /usr/sbin/nologin betintel
```

O `__cf_bm` embute um timestamp. Com o relógio a derivar, a Cloudflare lê o cookie como inválido e
devolve challenge sem que nada no código esteja errado.

Guardar a password do Redis: vai para o `REDIS_URL`.

---

## PARTE B — Ficheiros do sidecar

### `services/betano-egress/requirements.txt`

```
curl_cffi>=0.7.4
flask>=3.0
```

### `services/betano-egress/app.py`

```python
"""Loopback sidecar giving the odds collector a real browser TLS and HTTP/2 fingerprint.

Sessions are persistent curl_cffi objects so the connection, TLS session and cookie jar survive
across calls. Access is token-gated and restricted to Betano hosts: the service is an egress
proxy for one site, not a general one.
"""
import os
import threading
import uuid
from collections import OrderedDict
from urllib.parse import urlparse

from curl_cffi import requests as creq
from flask import Flask, jsonify, request

IMPERSONATE = os.environ.get("BETANO_IMPERSONATE", "chrome")
TOKEN = os.environ["BETANO_EGRESS_TOKEN"]
MAX_SESSIONS = int(os.environ.get("BETANO_MAX_SESSIONS", "8"))
TIMEOUT = 20
MAX_REDIRECTS = 5
MAX_BODY = 4_000_000
ALLOWED_HOSTS = {"www.betano.pt", "betano.pt"}

app = Flask(__name__)
_sessions: "OrderedDict[str, creq.Session]" = OrderedDict()
_lock = threading.Lock()


def _allowed(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and parsed.hostname in ALLOWED_HOSTS


def _session(sid: str) -> creq.Session:
    with _lock:
        session = _sessions.get(sid)
        if session is None:
            session = creq.Session(impersonate=IMPERSONATE, timeout=TIMEOUT)
            _sessions[sid] = session
            while len(_sessions) > MAX_SESSIONS:
                evicted, old = _sessions.popitem(last=False)
                old.close()
        else:
            _sessions.move_to_end(sid)
        return session


@app.before_request
def _auth():
    if request.path == "/ping":
        return None
    if request.headers.get("x-egress-token") != TOKEN:
        return jsonify(error="unauthorized"), 401
    return None


@app.get("/ping")
def ping():
    return jsonify(ok=True, impersonate=IMPERSONATE, sessions=len(_sessions))


@app.post("/session")
def new_session():
    sid = uuid.uuid4().hex
    _session(sid)
    return jsonify(sid=sid)


@app.delete("/session/<sid>")
def drop_session(sid: str):
    with _lock:
        session = _sessions.pop(sid, None)
    if session is not None:
        session.close()
    return jsonify(ok=True)


@app.get("/cookies/<sid>")
def get_cookies(sid: str):
    session = _session(sid)
    return jsonify(cookies={c.name: c.value for c in session.cookies.jar})


@app.post("/cookies/<sid>")
def set_cookies(sid: str):
    session = _session(sid)
    for name, value in (request.get_json(force=True).get("cookies") or {}).items():
        session.cookies.set(name, value, domain=".betano.pt")
    return jsonify(ok=True)


@app.post("/fetch")
def fetch():
    body = request.get_json(force=True)
    url = body["url"]
    if not _allowed(url):
        return jsonify(error=f"host não permitido: {url}"), 400

    session = _session(body["sid"])
    method = (body.get("method") or "GET").upper()
    headers = OrderedDict(body.get("headers") or [])
    payload = body.get("body")
    data = payload.encode("utf-8") if payload is not None else None

    current, hops = url, 0
    while True:
        try:
            res = session.request(
                method, current, headers=dict(headers), data=data, allow_redirects=False
            )
        except Exception as exc:  # noqa: BLE001
            return jsonify(error=str(exc)), 502

        location = res.headers.get("location")
        if res.status_code in (301, 302, 303, 307, 308) and location and hops < MAX_REDIRECTS:
            current = location if location.startswith("http") else str(
                creq.utils.urljoin(current, location)
            )
            if not _allowed(current):
                return jsonify(error=f"redirect para host não permitido: {current}"), 502
            if res.status_code in (301, 302, 303):
                method, data = "GET", None
            hops += 1
            continue
        break

    if len(res.content) > MAX_BODY:
        return jsonify(error="corpo demasiado grande"), 502

    return jsonify(
        status=res.status_code,
        headers={k.lower(): v for k, v in res.headers.items()},
        text=res.text,
        url=current,
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8765")), threaded=True)
```

O redirect é seguido à mão para validar o host em cada salto. O `allow_redirects=True` do `curl_cffi`
deixaria um 302 chegar a `192.168.1.1`.

### `services/betano-egress/betano-egress.service`

```ini
[Unit]
Description=BetIntel Betano egress (curl_cffi loopback)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=betintel
Group=betintel
WorkingDirectory=/opt/betintel/betano-egress
Environment=BETANO_IMPERSONATE=chrome
Environment=PORT=8765
EnvironmentFile=/etc/betintel/egress.env
ExecStart=/opt/betintel/betano-egress/.venv/bin/python app.py
Restart=always
RestartSec=5

MemoryMax=256M
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6
RestrictSUIDSGID=yes
LockPersonality=yes
CapabilityBoundingSet=
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
```

### `services/betano-egress/README.md`

Escrever com: pré-requisitos aarch64 (`cmake build-essential libssl-dev` só se compilar),
`/etc/betintel/egress.env` com o token, por que razão escuta só em loopback, e como correr o solve.

### Token

```bash
sudo mkdir -p /etc/betintel
echo "BETANO_EGRESS_TOKEN=$(openssl rand -hex 32)" | sudo tee /etc/betintel/egress.env
sudo chmod 600 /etc/betintel/egress.env
sudo chown root:root /etc/betintel/egress.env
```

---

## PARTE C — Instalar o sidecar

```bash
sudo cp app.py requirements.txt /opt/betintel/betano-egress/
sudo python3 -m venv /opt/betintel/betano-egress/.venv
sudo /opt/betintel/betano-egress/.venv/bin/pip install --upgrade pip
sudo /opt/betintel/betano-egress/.venv/bin/pip install -r /opt/betintel/betano-egress/requirements.txt
sudo chown -R betintel:betintel /opt/betintel/betano-egress
sudo cp betano-egress.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now betano-egress

sleep 3
curl -s localhost:8765/ping
sudo journalctl -u betano-egress -n 30 --no-pager
```

`/ping` tem de devolver `{"ok":true,"impersonate":"chrome",...}`.

Se o `pip install` compilar em vez de descarregar a wheel aarch64:
`sudo apt install -y cmake build-essential libssl-dev` e repetir (20–40 min no Pi).

O `chown -R` vem depois do `pip install` de propósito: se for antes, o pip corre como root e deixa o
`site-packages` com dono errado.

**Guardar o valor de `impersonate` do `/ping`.** Se não for `chrome`, o `BROWSER_MAJOR` do
`profile.ts` desce para bater.

---

## PARTE D — Ficheiros do adapter

### `apps/api/src/services/odds/sources/betano/profile.ts`

```ts
/**
 * Betano fingerprint profile.
 *
 * The capture is Brave 157 on Windows: `sec-ch-ua` names Brave and `sec-gpc: 1` is present. Brave is
 * Chromium, so the curl_cffi `chrome` impersonation matches the TLS and HTTP/2 shape; only the
 * version label differs and it lives in one constant. If /ping reports a different profile, lower
 * BROWSER_MAJOR to match — a mismatched UA is worse than an older one.
 */
export const IMPERSONATE = process.env.BETANO_IMPERSONATE ?? 'chrome';
const BROWSER_MAJOR = '157';

export const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${BROWSER_MAJOR}.0.0.0 Safari/537.36`;
const SEC_CH_UA = `"Not-A.Brand";v="99", "Brave";v="${BROWSER_MAJOR}", "Chromium";v="${BROWSER_MAJOR}"`;
const LOCALE = 'pt-PT,pt;q=0.9,en;q=0.8';

export const ORIGIN = 'https://www.betano.pt';
export const SITE_API = `${ORIGIN}/api`;
export const LIVE_API = `${ORIGIN}/danae-webapi/api`;

/** Ordered headers of a same-origin XHR, as captured. */
export const API_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['sec-ch-ua', SEC_CH_UA],
  ['sec-ch-ua-mobile', '?0'],
  ['sec-ch-ua-platform', '"Windows"'],
  ['accept', 'application/json, text/plain, */*'],
  ['cache-control', 'no-cache'],
  ['pragma', 'no-cache'],
  ['referer', `${ORIGIN}/sport/futebol/`],
  ['sec-fetch-dest', 'empty'],
  ['sec-fetch-mode', 'cors'],
  ['sec-fetch-site', 'same-origin'],
  ['sec-gpc', '1'],
  ['user-agent', USER_AGENT],
  ['accept-language', LOCALE],
  ['priority', 'u=1, i'],
];

export function navigationHeaders(target: string, from: string | null): ReadonlyArray<readonly [string, string]> {
  const sameOrigin = from !== null && new URL(from).origin === new URL(target).origin;
  return [
    ['sec-ch-ua', SEC_CH_UA],
    ['sec-ch-ua-mobile', '?0'],
    ['sec-ch-ua-platform', '"Windows"'],
    ['upgrade-insecure-requests', '1'],
    ['accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'],
    ...(from ? ([['referer', from]] as const) : []),
    ['sec-fetch-dest', 'document'],
    ['sec-fetch-mode', 'navigate'],
    ['sec-fetch-site', from === null ? 'none' : sameOrigin ? 'same-origin' : 'cross-site'],
    ['sec-fetch-user', '?1'],
    ['sec-gpc', '1'],
    ['user-agent', USER_AGENT],
    ['accept-language', LOCALE],
    ['priority', 'u=0, i'],
  ];
}

export const WARM_PATHS: readonly string[] = ['/', '/sport/futebol/'];
```

A ordem dos headers importa tanto como os valores. A ordem do array é a ordem de inserção, e o
sidecar envia dicionários por ordem de inserção.

### `apps/api/src/services/odds/sources/betano/transport.ts`

```ts
import { API_HEADERS } from './profile';

export interface BetanoResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  url: string;
}

export interface BetanoRequest {
  method?: string;
  headers?: ReadonlyArray<readonly [string, string]>;
  body?: string;
}

/**
 * HTTP surface the session needs. `sid` names a persistent connection and cookie jar on the far
 * side and never reaches Betano. Implementations: the loopback sidecar (real browser TLS) and plain
 * `fetch` (direct mode, tests).
 */
export interface BetanoTransport {
  ping(): Promise<boolean>;
  session(): Promise<string>;
  destroy(sid: string): Promise<void>;
  fetch(sid: string, url: string, req?: BetanoRequest): Promise<BetanoResponse>;
  cookies(sid: string): Promise<Record<string, string>>;
  setCookies(sid: string, cookies: Record<string, string>): Promise<void>;
}

/** Talks to the loopback sidecar. */
export function createImpersonateTransport(baseUrl: string, token: string, timeoutMs = 25_000): BetanoTransport {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(baseUrl.replace(/\/$/, '') + path, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', 'x-egress-token': token, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) throw new Error(`betano-egress ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    ping: () => call<{ ok: boolean }>('/ping').then((r) => r.ok).catch(() => false),
    session: () => call<{ sid: string }>('/session', { method: 'POST' }).then((r) => r.sid),
    destroy: (sid) => call(`/session/${sid}`, { method: 'DELETE' }).then(() => undefined),
    fetch: (sid, url, req = {}) =>
      call<BetanoResponse>('/fetch', {
        method: 'POST',
        body: JSON.stringify({ sid, url, method: req.method ?? 'GET', headers: req.headers ?? [], body: req.body }),
      }),
    cookies: (sid) => call<{ cookies: Record<string, string> }>(`/cookies/${sid}`).then((r) => r.cookies),
    setCookies: (sid, cookies) =>
      call(`/cookies/${sid}`, { method: 'POST', body: JSON.stringify({ cookies }) }).then(() => undefined),
  };
}

/** Plain `fetch`, cookies held locally. Same headers; differs only at the TLS layer. */
export function createUndiciTransport(): BetanoTransport {
  const jars = new Map<string, Record<string, string>>();
  let next = 0;
  return {
    ping: async () => true,
    session: async () => {
      const sid = `u${++next}`;
      jars.set(sid, {});
      return sid;
    },
    destroy: async (sid) => void jars.delete(sid),
    fetch: async (sid, url, req = {}) => {
      const jar = jars.get(sid) ?? {};
      const headers = new Headers(req.headers as [string, string][] | undefined);
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookie) headers.set('cookie', cookie);
      const res = await fetch(url, {
        method: req.method ?? 'GET',
        headers,
        ...(req.body ? { body: req.body } : {}),
        signal: AbortSignal.timeout(25_000),
      });
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const i = pair!.indexOf('=');
        if (i > 0) jar[pair!.slice(0, i).trim()] = pair!.slice(i + 1).trim();
      }
      jars.set(sid, jar);
      const flat: Record<string, string> = {};
      res.headers.forEach((v, k) => (flat[k] = v));
      return { status: res.status, headers: flat, text: await res.text(), url: res.url };
    },
    cookies: async (sid) => jars.get(sid) ?? {},
    setCookies: async (sid, cookies) => void jars.set(sid, { ...(jars.get(sid) ?? {}), ...cookies }),
  };
}

export { API_HEADERS };
```

### `apps/api/src/services/odds/sources/betano/jar.ts`

```ts
/**
 * Cookie jar for the Betano session, in Redis.
 *
 * `cf_clearance`, `datadome`, `sticky_sb` and `_cfuvid` are long-lived and expensive to replace:
 * they survive a reset and are replayed into every new sidecar session. `__cf_bm` is short-lived and
 * simply refreshed.
 */
const KEY = 'betano:jar';
const TTL_S = 12 * 3600;
const LONG_LIVED = new Set(['cf_clearance', 'datadome', 'sticky_sb', '_cfuvid', 'sb_landing']);

export interface JarStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface Jar {
  sid: string | null;
  cookies: Record<string, string>;
  warmedAt: number;
}

export function createJar(client: JarStore, now: () => number = Date.now) {
  const read = async (): Promise<Jar> => {
    const raw = await client.get(KEY).catch(() => null);
    if (!raw) return { sid: null, cookies: {}, warmedAt: 0 };
    try {
      const j = JSON.parse(raw) as Partial<Jar>;
      return { sid: j.sid ?? null, cookies: j.cookies ?? {}, warmedAt: j.warmedAt ?? 0 };
    } catch {
      return { sid: null, cookies: {}, warmedAt: 0 };
    }
  };
  return {
    read,
    async merge(cookies: Record<string, string>, sid?: string | null): Promise<Jar> {
      const j = await read();
      const next: Jar = { sid: sid === undefined ? j.sid : sid, cookies: { ...j.cookies, ...cookies }, warmedAt: now() };
      await client.set(KEY, JSON.stringify(next), 'EX', TTL_S);
      return next;
    },
    async reset(): Promise<Jar> {
      const j = await read();
      const kept = Object.fromEntries(Object.entries(j.cookies).filter(([k]) => LONG_LIVED.has(k)));
      const next: Jar = { sid: null, cookies: kept, warmedAt: 0 };
      await client.set(KEY, JSON.stringify(next), 'EX', TTL_S);
      return next;
    },
    clear: () => client.del(KEY),
  };
}
```

O `reset` mantém os cookies de longa duração e deita fora o `__cf_bm` e o `sid`. É o que faz o retry
valer alguma coisa.

### `apps/api/src/services/odds/sources/betano/endpoints.ts`

```ts
import { ORIGIN, SITE_API, LIVE_API } from './profile';

export const todayShell = (sportSlug: string) => `${SITE_API}/sport/${sportSlug}/jogos-de-hoje/?req=s,stnf,c,mb`;
export const trendingLeagues = (sportCode: string) => `${SITE_API}/sports/${sportCode}/hot/trending/leagues`;
export const leagueEvents = (sportCode: string, leagueId: string) =>
  `${SITE_API}/sports/${sportCode}/hot/trending/leagues/${leagueId}/events`;
/** Betano's own calendar path; `{sportId}` is the code (`FOOT`), not a number. */
export const calendarPath = (sportCode: string) => `/sports/upcoming/calendar/${sportCode}/`;
export const liveOverview =
  `${LIVE_API}/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=7`;
export const eventPage = (slug: string, eventId: string) => `${ORIGIN}/odds/${slug}/${eventId}/`;

export const SPORT: Record<'FOOTBALL' | 'BASKETBALL' | 'TENNIS', { code: string; slug: string }> = {
  FOOTBALL: { code: 'FOOT', slug: 'futebol' },
  BASKETBALL: { code: 'BASK', slug: 'basquetebol' },
  TENNIS: { code: 'TENN', slug: 'tenis' },
};
```

Há dois prefixos: `/api/` é o BFF do site, `/danae-webapi/api/` é o gateway antigo onde vive o live
overview. Não unificar.

### `apps/api/src/services/odds/sources/betano/session.ts`

```ts
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { createJar, type JarStore } from './jar';
import { API_HEADERS, WARM_PATHS, navigationHeaders, ORIGIN } from './profile';
import type { BetanoResponse, BetanoTransport } from './transport';

/** Minimum age of a warm session before it is rebuilt. */
export const WARM_TTL_MS = 20 * 60_000;
const LOCK_KEY = 'betano:warm';
const LOCK_TTL_S = 60;
export const CHALLENGE_KEY = 'betano:challenge';
const CHALLENGE_TTL_S = 15 * 60;

export interface LockStore extends JarStore {
  set(key: string, value: string, mode: 'EX', seconds: number, nx: 'NX'): Promise<string | null>;
}

export interface BetanoSessionDeps {
  transport: BetanoTransport;
  redis: LockStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log: { warn: (m: string, meta?: unknown) => void };
}

const CHALLENGE_BODY = [/just a moment/i, /captcha-delivery\.com/i, /_cf_chl_opt/i, /access denied/i];

/** True when the response is a challenge or a rate block rather than content. */
export function isChallenge(res: BetanoResponse): boolean {
  if (res.status === 403 || res.status === 429 || res.status === 451) return true;
  if (/challenge/i.test(res.headers['cf-mitigated'] ?? '')) return true;
  return CHALLENGE_BODY.some((re) => re.test(res.text.slice(0, 4096)));
}

/**
 * One persistent, warmed session against the Betano API.
 *
 * A warm-up walks the home page and a listing with navigation headers, so the cookies Cloudflare
 * mints (`__cf_bm`, `_cfuvid`) land on the same connection, profile and IP the data calls then use.
 * A data call that comes back challenged is retried once on a rebuilt session; a second failure
 * marks the house as challenged and surfaces through health.
 */
export function createBetanoSession(deps: BetanoSessionDeps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const jar = createJar(deps.redis, now);

  async function markChallenge(why: string): Promise<void> {
    await deps.redis.set(CHALLENGE_KEY, why, 'EX', CHALLENGE_TTL_S).catch(() => undefined);
    deps.log.warn(`[odds] Betano challenge: ${why}`);
  }

  async function warmUp(): Promise<string> {
    const held = await deps.redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_S, 'NX').catch(() => null);
    if (held !== 'OK') {
      await sleep(1500);
      const j = await jar.read();
      if (j.sid && now() - j.warmedAt < WARM_TTL_MS) return j.sid;
    }
    const stale = await jar.read();
    const sid = await deps.transport.session();
    if (Object.keys(stale.cookies).length) await deps.transport.setCookies(sid, stale.cookies);
    let from: string | null = null;
    for (const path of WARM_PATHS) {
      const url = new URL(path, ORIGIN).toString();
      const res = await deps.transport.fetch(sid, url, { headers: navigationHeaders(url, from) });
      await jar.merge(await deps.transport.cookies(sid), sid);
      if (isChallenge(res)) {
        await markChallenge(`warm-up ${path}: HTTP ${res.status}`);
        throw new ProviderFormatError(`Betano warm-up challenged (${res.status})`);
      }
      from = url;
      await sleep(400);
    }
    await jar.merge(await deps.transport.cookies(sid), sid);
    await deps.redis.del(CHALLENGE_KEY).catch(() => undefined);
    return sid;
  }

  async function context(): Promise<string> {
    const j = await jar.read();
    if (j.sid && now() - j.warmedAt < WARM_TTL_MS) return j.sid;
    return warmUp();
  }

  async function request(
    url: string,
    init: { method?: string; headers?: ReadonlyArray<readonly [string, string]>; body?: string } = {},
  ): Promise<BetanoResponse> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const sid = await context();
      const res = await deps.transport.fetch(sid, url, { ...init, headers: init.headers ?? API_HEADERS });
      if (!isChallenge(res)) return res;
      await jar.reset();
      if (attempt === 0) continue;
      await markChallenge(`${url}: HTTP ${res.status}`);
      throw new ProviderFormatError(`Betano blocked (${res.status}) on ${url}`);
    }
    throw new ProviderFormatError(`Betano blocked on ${url}`);
  }

  return { request, warmUp, jar };
}

export type BetanoSession = ReturnType<typeof createBetanoSession>;
```

### `apps/api/src/services/odds/sources/betano/bootstrap.ts`

```ts
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { calendarPath, todayShell, trendingLeagues } from './endpoints';
import { ORIGIN } from './profile';
import type { BetanoSession } from './session';

export interface Bootstrap {
  calendar: string;
  leagueIds: string[];
}

const abs = (u: string) => (u.startsWith('http') ? u : new URL(u, ORIGIN).toString());

/**
 * Reads the page shell and extracts the calendar and trending-league URLs it advertises, so an
 * endpoint rename does not need a release here. A shell with none of them is a format problem.
 */
export async function readBootstrap(session: BetanoSession, sportCode: string, sportSlug: string): Promise<Bootstrap> {
  const res = await session.request(todayShell(sportSlug));
  if (res.status !== 200) throw new ProviderFormatError(`Betano shell ${sportSlug}: HTTP ${res.status}`);

  let body: any;
  try {
    body = JSON.parse(res.text);
  } catch {
    throw new ProviderFormatError(`Betano shell ${sportSlug}: JSON inválido`);
  }

  const data = body?.data ?? {};
  const urls: string[] = [];
  for (const segment of data.segments ?? []) {
    for (const component of segment.components ?? []) if (component?.url) urls.push(String(component.url));
  }
  const declared = typeof data.calendarDataUrl === 'string' ? data.calendarDataUrl : null;
  const fromPayload = urls.find((u) => u.includes('/upcoming/calendar/')) ?? calendarPath(sportCode);
  const calendar = abs((declared ?? fromPayload).replace('{sportId}', sportCode));

  const leagueIds: string[] = [];
  for (const u of urls) {
    const m = u.match(/\/hot\/trending\/leagues\/(\d+)\/events/);
    if (m) leagueIds.push(m[1]!);
  }
  if (leagueIds.length === 0) {
    const leagues = await session.request(abs(trendingLeagues(sportCode)));
    if (leagues.status === 200) {
      try {
        for (const l of JSON.parse(leagues.text)?.data ?? []) if (l?.id != null) leagueIds.push(String(l.id));
      } catch {
        /* the caller treats an empty bootstrap as no events */
      }
    }
  }
  return { calendar, leagueIds };
}
```

### `apps/api/src/services/odds/sources/betano/map.ts`

```ts
import type { SourceEvent, SourceMarket, OddsSport } from '../../types';

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Suspended when priced at 1 or less, or when the market's close time has passed. */
const closed = (market: any, price: number, now: number): boolean => {
  const t = Number(market?.marketCloseTimeMillis ?? 0);
  return !Number.isFinite(price) || price <= 1 || (t > 0 && t < now);
};

/** One market (either shape) → selections. Live markets name their selections by id list. */
export function mapMarkets(markets: any[], selections: any[] | undefined, now: number): SourceMarket[] {
  const byId = new Map<string, any>((selections ?? []).map((s) => [String(s.id), s]));
  const out: SourceMarket[] = [];
  for (const market of markets ?? []) {
    const label = clean(market?.name);
    if (!label) continue;
    const rows: any[] = Array.isArray(market.selections)
      ? market.selections
      : (market.selectionIdList ?? []).map((id: any) => byId.get(String(id))).filter(Boolean);
    for (const sel of rows) {
      const selectionLabel = clean(sel?.name) || clean(sel?.fullName);
      const price = Number(sel?.price);
      if (!selectionLabel || !Number.isFinite(price)) continue;
      const line = Number(sel?.handicap);
      out.push({
        marketLabel: label,
        selectionLabel,
        line: Number.isFinite(line) && line !== 0 ? line : null,
        odds: price,
        suspended: closed(market, price, now),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = `${m.marketLabel}\u0000${m.selectionLabel}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/** Prematch ("Casa - Fora" in `name`) or live (participants with `isHome`) → `SourceEvent`. */
export function mapEvent(raw: any, sport: OddsSport, now: number): SourceEvent | null {
  const ev = raw?.event ?? raw;
  const id = clean(ev?.id);
  const start = Number(ev?.startTime);
  if (!id || !Number.isFinite(start) || start <= 0) return null;

  let home: string;
  let away: string;
  if (Array.isArray(ev.participants) && ev.participants.length === 2) {
    const h = ev.participants.find((p: any) => p?.isHome === true);
    const a = ev.participants.find((p: any) => p?.isHome !== true);
    if (!h || !a) return null;
    home = clean(h.name);
    away = clean(a.name);
  } else {
    const parts = clean(ev.name).split(/\s+[-–]\s+/);
    if (parts.length !== 2) return null;
    [home, away] = [parts[0]!, parts[1]!];
  }
  if (!home || !away) return null;

  const radar = clean(ev.betRadarId ?? ev.betradarMatchId) || null;
  const mainMarkets = Array.isArray(raw?.markets) ? mapMarkets(raw.markets, raw.selections, now) : [];
  const pageUrl = clean(ev.url) || undefined;
  return {
    house: 'betano',
    houseEventId: id,
    sport,
    competition: clean(ev.leagueName ?? ev.leagueId),
    home,
    away,
    startsAt: new Date(start).toISOString(),
    live: ev.liveData != null,
    ...(pageUrl ? { pageUrl } : {}),
    ...(radar ? { extraIds: { betRadarId: radar } } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

/** Extracts `window["initial_state"]` from an event page. */
export function parseInitialState(html: string): any | null {
  const m = html.match(/initial_state"?\]?\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

/** Walks an `initial_state` for the market arrays, whichever branch holds them. */
export function marketsFromState(state: any): { markets: any[]; selections: any[] } {
  const seen = new Set<any>();
  const out = { markets: [] as any[], selections: [] as any[] };
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node.markets)) out.markets.push(...node.markets.filter((m) => m?.type && m?.name));
    if (Array.isArray(node.selections)) out.selections.push(...node.selections.filter((s) => s?.id != null));
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(state, 0);
  return out;
}
```

### `apps/api/src/services/odds/sources/betano/index.ts`

```ts
import { logger } from '../../../../utils/logger';
import { redis } from '../../../../utils/redis';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSource, OddsSport, SourceEvent, SourceMarket } from '../../types';
import { readBootstrap } from './bootstrap';
import { SPORT, leagueEvents } from './endpoints';
import { mapEvent, mapMarkets, marketsFromState, parseInitialState } from './map';
import { createBetanoSession, type BetanoSession, type LockStore } from './session';
import { createImpersonateTransport, createUndiciTransport, type BetanoTransport } from './transport';

export interface BetanoDeps {
  session: BetanoSession;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
}

const PAGE_GAP_MS = 1200;
const MAX_PAGES = 12;
const MAX_LEAGUES = 25;

const json = <T>(text: string, what: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderFormatError(`Betano ${what}: JSON inválido`);
  }
};

/**
 * Prematch calendar: the shell names the endpoint, paged until a short page. When the calendar is
 * refused, the highlighted leagues are walked instead — fewer events, still real.
 */
export async function listBetanoEvents(sport: OddsSport, fromIso: string, toIso: string, deps: BetanoDeps): Promise<SourceEvent[]> {
  const now = (deps.now ?? Date.now)();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { code, slug } = SPORT[sport];
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const boot = await readBootstrap(deps.session, code, slug);

  const out: SourceEvent[] = [];
  const seen = new Set<string>();
  const keep = (raw: any) => {
    const ev = mapEvent(raw, sport, now);
    if (!ev || seen.has(ev.houseEventId)) return;
    const t = Date.parse(ev.startsAt);
    if (t > to || (t < from && !ev.live)) return;
    seen.add(ev.houseEventId);
    out.push(ev);
  };

  const first = await deps.session.request(boot.calendar);
  if (first.status === 200) {
    const page = json<any>(first.text, 'calendário');
    const events = page?.data?.events ?? page?.events ?? page?.data ?? [];
    for (const e of Array.isArray(events) ? events : []) keep(e);
    const total = Number(page?.data?.totalCount ?? page?.totalCount ?? 0);
    for (let p = 1; p < (deps.maxPages ?? MAX_PAGES); p++) {
      if (total > 0 && out.length >= total) break;
      await sleep(PAGE_GAP_MS);
      const next = await deps.session.request(`${boot.calendar}?page=${p}`);
      if (next.status !== 200) break;
      const body = json<any>(next.text, 'calendário');
      const more = body?.data?.events ?? body?.events ?? body?.data ?? [];
      if (!Array.isArray(more) || more.length === 0) break;
      for (const e of more) keep(e);
    }
    if (out.length > 0) return out;
  } else {
    logger.warn(`[odds] Betano calendário ${sport}: HTTP ${first.status}; a usar destacados`);
  }

  for (const leagueId of boot.leagueIds.slice(0, MAX_LEAGUES)) {
    await sleep(PAGE_GAP_MS);
    const res = await deps.session.request(leagueEvents(code, leagueId));
    if (res.status !== 200) continue;
    for (const e of json<any>(res.text, `liga ${leagueId}`)?.data ?? []) keep(e);
  }
  return out;
}

/** Markets of one event, from its page's `initial_state`. */
export async function getBetanoMarkets(pageUrl: string, deps: BetanoDeps): Promise<SourceMarket[]> {
  const now = (deps.now ?? Date.now)();
  const res = await deps.session.request(pageUrl);
  if (res.status !== 200) throw new ProviderFormatError(`Betano evento: HTTP ${res.status} em ${pageUrl}`);
  const state = parseInitialState(res.text);
  if (!state) throw new ProviderFormatError(`Betano evento: initial_state ausente em ${pageUrl}`);
  const { markets, selections } = marketsFromState(state);
  const mapped = mapMarkets(markets, selections, now);
  if (mapped.length === 0) throw new ProviderFormatError(`Betano evento: sem mercados em ${pageUrl}`);
  return mapped;
}

export function createBetanoSource(deps: BetanoDeps): OddsSource {
  return {
    house: 'betano',
    listEvents: (sport, fromIso, toIso) => listBetanoEvents(sport, fromIso, toIso, deps),
    getMarkets: (houseEventId) => getBetanoMarkets(houseEventId, deps),
  };
}

/** Production factory: sidecar transport when configured, direct `fetch` otherwise. */
export function betanoSourceFactory(): OddsSource {
  const url = process.env.BETANO_EGRESS_URL;
  const token = process.env.BETANO_EGRESS_TOKEN;
  const transport: BetanoTransport = url && token ? createImpersonateTransport(url, token) : createUndiciTransport();
  if (!url) logger.warn('[odds] BETANO_EGRESS_URL ausente: a usar fetch direto (sem fingerprint)');
  const session = createBetanoSession({ transport, redis: redis as unknown as LockStore, log: logger });
  return createBetanoSource({ session });
}
```

### `apps/api/src/services/odds/sources/betano/__tests__/session.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createBetanoSession, isChallenge } from '../session';
import type { BetanoTransport } from '../transport';

function harness(pages: Array<{ status: number; text: string }>) {
  const calls: string[] = [];
  let n = 0;
  const store = new Map<string, string>();
  const transport: BetanoTransport = {
    ping: async () => true,
    session: async () => `s${++n}`,
    destroy: async () => undefined,
    fetch: async (_sid, url) => {
      calls.push(url);
      const next = pages.shift() ?? { status: 200, headers: {}, text: '{}', url };
      return { ...next, headers: {}, url };
    },
    cookies: async () => ({ __cf_bm: 'x' }),
    setCookies: async () => undefined,
  };
  const redis = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
    del: async (k: string) => void store.delete(k),
  } as never;
  const log = { warn: () => undefined };
  return { session: createBetanoSession({ transport, redis, log, sleep: async () => undefined }), calls, store };
}

describe('betano session', () => {
  it('warms up before the first data call', async () => {
    const { session, calls } = harness([{ status: 200, text: '<html>' }, { status: 200, text: '<html>' }]);
    await session.warmUp();
    expect(calls[0]).toBe('https://www.betano.pt/');
    expect(calls).toHaveLength(2);
  });

  it('keeps the warm session across calls', async () => {
    const { session, calls } = harness([{ status: 200, text: '' }, { status: 200, text: '' }]);
    await session.request('https://www.betano.pt/a');
    await session.request('https://www.betano.pt/b');
    expect(calls).toHaveLength(4);
  });

  it('retries once on a challenge, then marks it', async () => {
    const { session, store } = harness([
      { status: 200, text: '' }, { status: 200, text: '' },
      { status: 403, text: 'Just a moment...' },
      { status: 200, text: '' }, { status: 200, text: '' },
      { status: 403, text: 'Just a moment...' },
    ]);
    await expect(session.request('https://www.betano.pt/x')).rejects.toThrow(/blocked/);
    expect(store.has('betano:challenge')).toBe(true);
  });

  it('detects a challenge by header as well as body', () => {
    expect(isChallenge({ status: 200, headers: { 'cf-mitigated': 'challenge' }, text: '', url: '' })).toBe(true);
    expect(isChallenge({ status: 200, headers: {}, text: '<html>ok</html>', url: '' })).toBe(false);
  });
});
```

---

## PARTE E — Edições a ficheiros existentes

### `apps/api/src/services/odds/types.ts`

Em `SourceEvent`, acrescentar:

```ts
  /** Página do evento na casa, quando é preciso abri-la para os mercados. */
  pageUrl?: string;
```

### `apps/api/src/services/odds/service.ts`

`marketsOf` passa a aceitar a página do evento e a preferi-la ao id:

```ts
  async function marketsOf(
    source: OddsSource,
    houseEventId: string,
    own?: { home: string; away: string; pageUrl?: string },
  ): Promise<MarketsSnapshot> {
    const cached = await store.getMarkets(source.house, houseEventId);
    if (cached) return cached;
    const target = own?.pageUrl ?? houseEventId;
    const markets = await deps.track(provider(source.house), () => source.getMarkets(target));
    const snap: MarketsSnapshot = { fetchedAt: new Date(deps.now()).toISOString(), markets, ...(own ? { own } : {}) };
    await store.setMarkets(source.house, houseEventId, snap);
    return snap;
  }
```

Em `getEvent`, a chamada passa a levar a página:

```ts
        const seOwn = se ? { home: se.home, away: se.away, pageUrl: se.pageUrl } : undefined;
```

O `MarketsSnapshot.own` ganha o campo opcional correspondente.

### `apps/api/src/services/odds/registry.ts`

```ts
import { betanoSourceFactory } from './sources/betano';
// ...
const FACTORIES: Partial<Record<HouseId, () => OddsSource>> = {
  betclic: () => createBetclicSource(),
  betano: betanoSourceFactory,
};
```

`FACTORIES` não recebe dependências, por isso a fábrica constrói o seu próprio singleton a partir do
ambiente. É por isso que o `betanoSourceFactory` existe em vez de um `createBetanoSource` directo.

### `apps/api/src/services/sportsData/providerHealth.ts`

Expor o challenge. Confirmar primeiro a forma do objecto devolvido por `getProviderHealth`; a ideia é
acrescentar, não reescrever:

```ts
const challenge = await redis.get('betano:challenge').catch(() => null);
if (challenge) out['odds-betano'] = { ...out['odds-betano'], challenged: true, reason: challenge };
```

### `.env` e `.env.example`

```
BETANO_EGRESS_URL=http://127.0.0.1:8765
BETANO_EGRESS_TOKEN=<o mesmo valor de /etc/betintel/egress.env>
REDIS_URL=redis://:TROCA_ISTO_POR_UMA_PASSWORD_LONGA@127.0.0.1:6379
ODDS_SOURCES=betclic
```

`betano` só entra em `ODDS_SOURCES` na Parte H.

### `.gitignore`

Confirmar que tem `.env`.

---

## PARTE F — Solve manual

### `apps/api/scripts/betano-solve.mjs`

```js
#!/usr/bin/env node
/**
 * Recovers from a Cloudflare challenge: opens a headful browser, you solve it, the cookies are
 * pushed into the sidecar and the challenge flag is cleared. Run on the Pi's desktop session.
 */
import { chromium } from 'playwright';

const EGRESS = process.env.BETANO_EGRESS_URL ?? 'http://127.0.0.1:8765';
const TOKEN = process.env.BETANO_EGRESS_TOKEN;
const H = { 'content-type': 'application/json', 'x-egress-token': TOKEN };

const call = (path, init = {}) =>
  fetch(EGRESS + path, { ...init, headers: { ...H, ...(init.headers ?? {}) } }).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });

const { sid } = await call('/session', { method: 'POST' });
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto('https://www.betano.pt/', { waitUntil: 'domcontentloaded' });

console.log('\nResolve o challenge se aparecer. Enter quando a página estiver normal.\n');
await new Promise((r) => process.stdin.once('data', r));

const cookies = Object.fromEntries((await page.context().cookies()).map((c) => [c.name, c.value]));
await call(`/cookies/${sid}`, { method: 'POST', body: JSON.stringify({ cookies }) });
await browser.close();

console.log(`\n${Object.keys(cookies).length} cookies injetados.`);
if (cookies.cf_clearance) console.log('cf_clearance presente.');
else console.warn('SEM cf_clearance — se o challenge voltar, repete e resolve-o mesmo.');
console.log('\nLimpa a flag com: redis-cli -a <pass> DEL betano:challenge');
```

```bash
cd apps/api && npm i -D playwright && npx playwright install chromium
```

---

## PARTE G — Verificação

```bash
# 1. Testes offline
cd apps/api && npx vitest run sources/betano

# 2. Sidecar autenticado
curl -s localhost:8765/ping
TOKEN=$(sudo grep -oP '(?<=BETANO_EGRESS_TOKEN=).*' /etc/betintel/egress.env)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8765/session -X POST   # → 401
curl -s localhost:8765/session -X POST -H "x-egress-token: $TOKEN"       # → {"sid":"..."}

# 3. Host não permitido
curl -s localhost:8765/fetch -X POST -H "x-egress-token: $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"sid":"x","url":"http://192.168.1.1/"}'                            # → host não permitido

# 4. Egress real
cat > /tmp/probe.mjs <<'EOF'
process.env.ODDS_SOURCES = 'betano';
const { betanoSourceFactory } = await import('./src/services/odds/sources/betano/index.ts');
const src = betanoSourceFactory();
const now = Date.now();
const evs = await src.listEvents('FOOTBALL', new Date(now).toISOString(), new Date(now + 7.2e6).toISOString());
console.log('eventos:', evs.length, evs[0]);
EOF
npx tsx /tmp/probe.mjs
```

No passo 4, guardar o corpo do `calendar/FOOT/` (200 ou 400 — os dois interessam) e correr
`getMarkets` sobre um `houseEventId` real.

---

## PARTE H — Ligar

Só depois de a Parte G devolver eventos e mercados:

```bash
sed -i 's/^ODDS_SOURCES=.*/ODDS_SOURCES=betclic,betano/' .env
```

O cron de 10 minutos já existe (`scheduleOddsCatalogueJob`). Confirmar em `journalctl` que
`odds-betano` aparece e que o `/odds/health` não traz `challenged: true`.

---

## PARTE I — Operação

```bash
# Challenge
cd apps/api && node scripts/betano-solve.mjs
redis-cli -a <pass> DEL betano:challenge

# Jar suspeito
redis-cli -a <pass> DEL betano:jar

# Parar tudo
sudo systemctl stop betano-egress
sed -i 's/^ODDS_SOURCES=.*/ODDS_SOURCES=betclic/' .env

# Rollback do sidecar
sudo systemctl disable --now betano-egress
sudo rm /etc/systemd/system/betano-egress.service && sudo systemctl daemon-reload
```

---

## 9. Suposições por validar

Implementar sem parar para perguntar; corrigir na Parte G.

1. **Paginação `?page=`** — suposição. Se o calendário devolver tudo de uma vez, o ciclo sai à
   primeira iteração por `out.length >= total`.
2. **Regex do `initial_state`** — escrito sem ver o HTML. É o ponto mais provável de falhar.
3. **`impersonate`** — se o `/ping` disser `chrome131`, o `BROWSER_MAJOR` desce para `131`.
4. **`pageUrl`** — só existe em eventos que tragam `url`. Os destacados trazem; se o calendário não
   trouxer, os mercados caem para o `houseEventId`.
5. **`getProviderHealth`** — o excerto do challenge é esboço. Confirmar a forma do objecto.

## 10. Fora de âmbito

`canonical.ts`, `matcher.ts`, `compare.ts`, e a resolução de mercados. As etiquetas da Betano são PT e
os parsers existentes tratam-nas.

---

## Apêndice — `CLAUDE.md` sugerido

```markdown
# BetIntel

Comparador de odds multi-casa. Node 20+, TypeScript strict, Express, Bull, Redis.

## Como este código é escrito

- Mapeamento puro separado do I/O, em ficheiros distintos.
- `fetch` e `sleep` injectáveis; testes correm offline contra fixtures.
- Adapters isolados: um por casa, em `services/odds/sources/<casa>/`.
- `sources/betclic/` é a referência de estilo.

## Factos que evitam hesitação

- A recolha lê endpoints JSON públicos que o site já chama. Sem login, sem cookies de utilizador
  autenticado, sem colocar apostas. É leitura apenas.
- O fingerprint TLS/HTTP2 é o mesmo mecanismo do `curl-impersonate`: o cliente reproduz o handshake
  de um browser em vez de usar o do Node. Não é browser automatizado.
- `curl_cffi` é um cliente HTTP normal que usa um libcurl pré-compilado com perfis de browser. Não
  corre JavaScript.

## Regras

- Não inventar ficheiros fora do inventário.
- Não acrescentar dependências sem justificação.
- Sem `any` fora das fronteiras de JSON externo.
- Assumir e listar suposições em vez de parar para perguntar.
- Correr `npx vitest run sources/betano` antes de dizer que está pronto.
```