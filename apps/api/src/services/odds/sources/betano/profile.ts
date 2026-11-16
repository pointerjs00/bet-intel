/**
 * Betano fingerprint profile.
 *
 * The capture is Brave on Windows: `sec-ch-ua` names Brave and `sec-gpc: 1` is present. Brave is
 * Chromium, so the curl_cffi `chrome` impersonation matches the TLS and HTTP/2 shape. The UA major
 * must match the sidecar's resolved impersonate target (the pinned curl_cffi resolves `chrome` to
 * chrome152, so the default is 152). If /ping reports a different `resolved` target, set
 * BETANO_BROWSER_MAJOR to match; a mismatched UA is worse than an older one.
 */
const BROWSER_MAJOR = process.env.BETANO_BROWSER_MAJOR ?? '152';

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

/** Ordered headers of a top-level navigation; `from` is the previous page (referer) or null. */
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
