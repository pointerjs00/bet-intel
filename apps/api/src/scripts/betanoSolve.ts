/**
 * Manual recovery from a Cloudflare challenge on Betano.
 *
 * Run it where the Betano requests normally come from: the home PC (same public IP as the Pi) or the
 * Pi itself if it has a desktop session. It opens a headful browser; solve the challenge, press
 * Enter, and the cookies are exported as a Betano jar `{ sid: null, cookies, warmedAt: 0 }`.
 *
 * - With `REDIS_URL` set: `SET betano:jar <json> EX 43200` and `DEL betano:challenge` directly.
 * - Otherwise: the jar is written to a file (`--out FILE`, default `betano-jar.json`) and the docker
 *   compose commands to load it on the Pi are printed.
 *
 * Optional env: `PLAYWRIGHT_CHANNEL` (e.g. `chrome`), `BETANO_BROWSER_MAJOR` (see profile.ts).
 * The only network traffic is the browser itself.
 *
 * Usage: `pnpm --filter api betano:solve [-- --out jar.json]`
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { chromium } from 'playwright';
import IORedis from 'ioredis';
import { USER_AGENT } from '../services/odds/sources/betano/profile';

const JAR_KEY = 'betano:jar';
const CHALLENGE_KEY = 'betano:challenge';
const JAR_TTL_SECONDS = 43200;
const COMPOSE = 'docker compose -f deploy/pi/docker-compose.yml --env-file /srv/betintel/.env';

function outPath(): string {
  const i = process.argv.indexOf('--out');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'betano-jar.json';
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: false,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'pt-PT' });
  const page = await context.newPage();
  await page.goto('https://www.betano.pt/', { waitUntil: 'domcontentloaded' });

  console.log('\nResolve o challenge se aparecer. Enter quando a página estiver normal.\n');
  await new Promise<void>((res) => process.stdin.once('data', () => {
    process.stdin.pause();
    res();
  }));

  const all = await context.cookies();
  await browser.close();

  const cookies: Record<string, string> = {};
  for (const c of all) {
    if (c.domain.includes('betano')) cookies[c.name] = c.value;
  }
  console.log(`\n${Object.keys(cookies).length} cookies recolhidos.`);
  if (cookies.cf_clearance) console.log('cf_clearance presente.');
  else console.warn('SEM cf_clearance — se o challenge voltar, repete e resolve-o mesmo.');

  const json = JSON.stringify({ sid: null, cookies, warmedAt: 0 });

  if (process.env.REDIS_URL) {
    const redis = new IORedis(process.env.REDIS_URL);
    try {
      await redis.set(JAR_KEY, json, 'EX', JAR_TTL_SECONDS);
      await redis.del(CHALLENGE_KEY);
    } finally {
      redis.disconnect();
    }
    console.log('\nJar gravado no Redis e flag de challenge limpa.');
    return;
  }

  const file = resolve(outPath());
  writeFileSync(file, json);
  console.log(`\nJar escrito em ${file}. Copia-o para o Pi e, a partir da raiz do repo no Pi:\n`);
  console.log(`${COMPOSE} exec -T redis redis-cli -x SET ${JAR_KEY} < ${file}`);
  console.log(`${COMPOSE} exec -T redis redis-cli EXPIRE ${JAR_KEY} ${JAR_TTL_SECONDS}`);
  console.log(`${COMPOSE} exec -T redis redis-cli DEL ${CHALLENGE_KEY}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
