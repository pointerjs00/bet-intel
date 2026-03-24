/**
 * Betclic Portugal scraper — https://www.betclic.pt
 *
 * Uses puppeteer-extra + stealth plugin to scrape football events and 1X2 odds
 * from Betclic's JavaScript-rendered SPA (Angular).
 *
 * Anti-detection measures:
 * - puppeteer-extra-plugin-stealth (removes headless signals)
 * - Random User-Agent rotation per browser session
 * - Random inter-action delays (500 – 2000 ms)
 * - PUPPETEER_EXECUTABLE_PATH env var → system Chromium in Docker
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import puppeteerCore from 'puppeteer-core';
import type { HTTPRequest, HTTPResponse, Page } from 'puppeteer-core';
import * as proxyChain from 'proxy-chain';
import { Sport } from '@betintel/shared';
import { logger } from '../../../utils/logger';
import type { IScraper, ScrapedEvent, ScrapedMarket } from '../types';

// Wrap puppeteer-core with the puppeteer-extra plugin system
const puppeteer = addExtra(puppeteerCore as Parameters<typeof addExtra>[0]);
puppeteer.use(StealthPlugin());

// ─── Configuration ────────────────────────────────────────────────────────────

const FOOTBALL_URL = 'https://www.betclic.pt/futebol-s1';
const BETCLIC_LIVE_URL = 'https://www.betclic.pt/live';
const BETCLIC_HOME_URL = 'https://www.betclic.pt/';

/** Pool of real browser UA strings — one is picked at random per session */
const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0',
];

/** Browser launch args — drop --no-zygote / --single-process which are Linux process‑model flags that crash Edge on Windows */
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--lang=pt-PT',
  '--window-size=1366,768',
];

/** Per-process cache of the proxy-chain local proxy URL. */
let _localProxyUrl: string | undefined;

/**
 * Returns a local unauthenticated proxy URL (http://127.0.0.1:PORT) via proxy-chain.
 * proxy-chain bridges the connection to SCRAPER_HTTP_PROXY with full credential support,
 * so Chromium never needs to handle auth — no ERR_NO_SUPPORTED_PROXIES / ERR_TUNNEL_CONNECTION_FAILED.
 * Supports both HTTP and SOCKS5 proxies with username:password.
 * Created once per process and reused across all browser sessions.
 */
async function getLocalProxyUrl(): Promise<string | undefined> {
  const proxy = process.env.SCRAPER_HTTP_PROXY?.trim();
  if (!proxy) return undefined;
  if (!_localProxyUrl) {
    _localProxyUrl = await proxyChain.anonymizeProxy(proxy);
    logger.info('Proxy chain: local bridge started', { localUrl: _localProxyUrl });
  }
  return _localProxyUrl;
}

/** Returns Chromium launch args, routing traffic through the local proxy-chain bridge if configured. */
function buildBrowserArgs(localProxyUrl?: string): string[] {
  if (!localProxyUrl) return [...BROWSER_ARGS];
  return [...BROWSER_ARGS, `--proxy-server=${localProxyUrl}`];
}

// ─── Internal types (DOM-serialisable — used inside page.evaluate()) ──────────

interface RawEventData {
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDateIso: string;
  detailPath?: string;
  detailMarkets?: ScrapedMarket[];
  /** Decimal odds as string (may use comma as decimal separator) */
  home: string;
  draw: string;
  away: string;
  isLive: boolean;
}

export interface BetclicLiveWatchDispatch {
  events: ScrapedEvent[];
  incremental: boolean;
  source: 'catalogue' | 'network';
}

interface ProtoField {
  fieldNumber: number;
  wireType: number;
  value: bigint | number | string | ProtoMessage;
}

interface ProtoMessage {
  fields: ProtoField[];
}

interface ProtoSummaryEntry {
  depth: number;
  field: number;
  type: 'string' | 'number';
  value: string | number;
}

const DETAIL_FALLBACK_LIMIT = 8;
const API_MARKET_MINIMUM = 2;
const BETCLIC_MATCH_API_PATH = '/web/offering.access.api/offering.access.api.MatchService/GetMatchWithNotification';
const BETCLIC_TIME_ZONE = 'Europe/Lisbon';
const BETCLIC_NAVIGATION_TIMEOUT_MS = 45_000;
const BETCLIC_NAVIGATION_RETRIES = 3;

const DETAIL_MARKET_ALIASES: Readonly<Record<string, string>> = {
  'Resultado (Tempo Regulamentar)': '1X2',
  Resultado: '1X2',
  'Resultado duplo': 'Resultado duplo',
  'Equipa a marcar o golo 2': 'Equipa a marcar o golo 2',
  Marcador: 'Marcador',
  'As duas equipas marcam': 'As duas equipas marcam',
  'Ambas as equipas marcam': 'As duas equipas marcam',
  'Resultado - Primeira Parte': 'Resultado - Primeira Parte',
};

const DETAIL_MARKET_TITLES = new Set(Object.keys(DETAIL_MARKET_ALIASES));
const DETAIL_IGNORED_TITLES = new Set([
  'Top',
  'Marcadores',
  'Estatísticas',
  'Dicas da Casa',
  'SuperSub 90\'',
]);

const DETAIL_IGNORED_TITLE_PATTERNS = [
  /^top$/i,
  /^estatísticas$/i,
  /^dicas da casa$/i,
  /^supersub 90'$/i,
  /^apostas feitas nos últimos/i,
  /^in$/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string;
}

/** Returns a promise that resolves after a random delay in the given range. */
function randomDelay(minMs = 500, maxMs = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Converts a decimal-odds string (with possible comma separator) to a number. */
function parseOdds(raw: string): number {
  return parseFloat(raw.replace(',', '.').trim());
}

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isOddToken(value: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim());
}

function extractEventIdFromPath(detailPath: string): string | null {
  const match = detailPath.match(/-m(\d+)/i)
    ?? detailPath.match(/[?&](?:eventId|matchId|id)=(\d+)/i)
    ?? detailPath.match(/\/(\d{6,})(?:[/?#-]|$)/)
    ?? detailPath.match(/(\d{6,})/);
  return match?.[1] ?? null;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  const asUtc = Date.UTC(
    values.year,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
  );

  return asUtc - date.getTime();
}

function createDateInTimeZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function parseBetclicEventDate(dateAttr?: string | null, dateText?: string | null, referenceDate = new Date()): string | null {
  if (dateAttr) {
    const parsedAttr = new Date(dateAttr);
    if (!Number.isNaN(parsedAttr.getTime())) {
      return parsedAttr.toISOString();
    }
  }

  const rawText = normaliseWhitespace(dateText ?? '');
  if (!rawText) {
    return null;
  }

  const normalisedText = rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, ' ')
    .toLowerCase();

  const explicitDateMatch = normalisedText.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
  if (explicitDateMatch) {
    const day = Number(explicitDateMatch[1]);
    const month = Number(explicitDateMatch[2]);
    const yearToken = explicitDateMatch[3];
    const year = yearToken
      ? (yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken))
      : referenceDate.getUTCFullYear();
    const hour = Number(explicitDateMatch[4]);
    const minute = Number(explicitDateMatch[5]);
    return createDateInTimeZone(year, month, day, hour, minute, BETCLIC_TIME_ZONE).toISOString();
  }

  const relativeMatch = normalisedText.match(/\b(hoje|amanha)\b\s+(\d{1,2}):(\d{2})/);
  if (relativeMatch) {
    const localReference = new Date(referenceDate.toLocaleString('en-US', { timeZone: BETCLIC_TIME_ZONE }));
    const dayOffset = relativeMatch[1] === 'amanha' ? 1 : 0;
    const baseDay = new Date(localReference);
    baseDay.setDate(baseDay.getDate() + dayOffset);
    return createDateInTimeZone(
      baseDay.getFullYear(),
      baseDay.getMonth() + 1,
      baseDay.getDate(),
      Number(relativeMatch[2]),
      Number(relativeMatch[3]),
      BETCLIC_TIME_ZONE,
    ).toISOString();
  }

  // A bare time-only token ("23:30") without a date prefix is not handled
  // here. We cannot tell if it means "today" or "tomorrow", and using today's
  // date caused events scheduled for the next calendar day to be stored with
  // the wrong date. Betclic always provides explicit date info on upcoming
  // events; skip events lacking it rather than guess wrong.
  return null;
}

function encodeVarint(value: bigint): Buffer {
  const bytes: number[] = [];
  let current = value;

  while (current >= 0x80n) {
    bytes.push(Number((current & 0x7fn) | 0x80n));
    current >>= 7n;
  }

  bytes.push(Number(current));
  return Buffer.from(bytes);
}

function buildGrpcWebFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header[0] = 0x00;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function buildGetMatchRequestBody(eventId: string): Buffer {
  const payload = Buffer.concat([
    Buffer.from([0x08]),
    encodeVarint(BigInt(eventId)),
    Buffer.from([0x12, 0x02, 0x70, 0x74]),
  ]);

  return buildGrpcWebFrame(payload);
}

function extractEventIdFromGrpcWebRequestBody(requestBody: Buffer): string | null {
  const frames = extractGrpcWebDataFrames(requestBody);
  const messageFrame = frames[0];
  if (!messageFrame) {
    return null;
  }

  try {
    const message = parseProtoMessage(messageFrame);
    const idField = message.fields.find((field) => field.fieldNumber === 1 && typeof field.value === 'bigint');
    return idField ? idField.value.toString() : null;
  } catch {
    return null;
  }
}

function getRequestPostDataBuffer(request: HTTPRequest): Buffer | null {
  const requestWithBuffer = request as HTTPRequest & { postDataBuffer?: () => Buffer | undefined };
  if (typeof requestWithBuffer.postDataBuffer === 'function') {
    const buffer = requestWithBuffer.postDataBuffer();
    if (buffer && buffer.length > 0) {
      return buffer;
    }
  }

  const postData = request.postData();
  if (!postData) {
    return null;
  }

  return Buffer.from(postData, 'binary');
}

async function readBetclicMatchApiResponse(
  response: HTTPResponse,
): Promise<{ eventId: string; responseBody: Buffer } | null> {
  const url = response.url();
  if (!url.includes(BETCLIC_MATCH_API_PATH)) {
    return null;
  }

  const request = response.request();
  if (request.method() !== 'POST') {
    return null;
  }

  const requestBody = getRequestPostDataBuffer(request);
  if (!requestBody) {
    return null;
  }

  const eventId = extractEventIdFromGrpcWebRequestBody(requestBody);
  if (!eventId) {
    return null;
  }

  try {
    const responseBody = await response.buffer();
    if (responseBody.length === 0) {
      return null;
    }

    logger.debug('BetclicScraper: intercepted MatchService response', {
      eventId,
      url: url.slice(0, 200),
    });
    return { eventId, responseBody };
  } catch (error) {
    logger.debug('BetclicScraper: failed to read intercepted MatchService response', {
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function extractGrpcWebDataFrames(buffer: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let offset = 0;

  while (offset + 5 <= buffer.length) {
    const flag = buffer[offset];
    const length = buffer.readUInt32BE(offset + 1);
    const start = offset + 5;
    const end = start + length;
    if (end > buffer.length) {
      break;
    }

    if ((flag & 0x80) === 0) {
      frames.push(buffer.subarray(start, end));
    }

    offset = end;
  }

  return frames;
}

function readVarint(buffer: Buffer, offset: number): { value: bigint; offset: number } {
  let result = 0n;
  let shift = 0n;
  let cursor = offset;

  while (cursor < buffer.length) {
    const byte = BigInt(buffer[cursor] ?? 0);
    result |= (byte & 0x7fn) << shift;
    cursor += 1;

    if ((byte & 0x80n) === 0n) {
      return { value: result, offset: cursor };
    }

    shift += 7n;
  }

  throw new Error('unterminated protobuf varint');
}

function printableRatio(value: string): number {
  if (!value) {
    return 0;
  }

  let printable = 0;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 32 && code <= 126) || code >= 160 || code === 9 || code === 10 || code === 13) {
      printable += 1;
    }
  }

  return printable / value.length;
}

function parseProtoMessage(buffer: Buffer): ProtoMessage {
  const fields: ProtoField[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = Number(key.value >> 3n);
    const wireType = Number(key.value & 0x07n);

    if (wireType === 0) {
      const value = readVarint(buffer, offset);
      offset = value.offset;
      fields.push({ fieldNumber, wireType, value: value.value });
      continue;
    }

    if (wireType === 1) {
      const value = buffer.readDoubleLE(offset);
      offset += 8;
      fields.push({ fieldNumber, wireType, value });
      continue;
    }

    if (wireType === 2) {
      const lengthInfo = readVarint(buffer, offset);
      offset = lengthInfo.offset;
      const length = Number(lengthInfo.value);
      const slice = buffer.subarray(offset, offset + length);
      offset += length;

      const text = slice.toString('utf8');
      let nested: ProtoMessage | null = null;
      try {
        nested = parseProtoMessage(slice);
      } catch {
        nested = null;
      }

      if (printableRatio(text) > 0.85 && !text.includes('\u0000')) {
        fields.push({ fieldNumber, wireType, value: text });
      } else if (nested && nested.fields.length > 0) {
        fields.push({ fieldNumber, wireType, value: nested });
      } else {
        fields.push({ fieldNumber, wireType, value: slice.toString('hex') });
      }
      continue;
    }

    if (wireType === 5) {
      const value = buffer.readFloatLE(offset);
      offset += 4;
      fields.push({ fieldNumber, wireType, value });
      continue;
    }

    throw new Error(`unsupported protobuf wire type: ${wireType}`);
  }

  return { fields };
}

function summariseProtoMessage(node: ProtoMessage, depth = 0, summary: ProtoSummaryEntry[] = []): ProtoSummaryEntry[] {
  for (const field of node.fields) {
    if (typeof field.value === 'string') {
      const value = normaliseWhitespace(field.value);
      if (value) {
        summary.push({ depth, field: field.fieldNumber, type: 'string', value });
      }
      continue;
    }

    if (typeof field.value === 'number') {
      summary.push({ depth, field: field.fieldNumber, type: 'number', value: field.value });
      continue;
    }

    if (field.value && typeof field.value === 'object' && 'fields' in field.value) {
      summariseProtoMessage(field.value, depth + 1, summary);
    }
  }

  return summary;
}

function extractMarketsFromApiResponse(responseBody: Buffer, homeTeam: string, awayTeam: string): ScrapedMarket[] {
  const frames = extractGrpcWebDataFrames(responseBody);
  const messageFrame = frames[0];
  if (!messageFrame) {
    return [];
  }

  const summary = summariseProtoMessage(parseProtoMessage(messageFrame));
  const markets = new Map<string, Map<string, number>>();
  let currentMarket: string | null = null;
  let pendingSelection: string | null = null;

  for (const entry of summary) {
    if (entry.type === 'string' && (entry.field === 2 || entry.field === 3) && entry.depth >= 4 && entry.depth <= 5) {
      const title = normaliseWhitespace(String(entry.value));
      if (!title || title === currentMarket || title === homeTeam || title === awayTeam) {
        continue;
      }

      currentMarket = title;
      pendingSelection = null;
      if (!markets.has(currentMarket)) {
        markets.set(currentMarket, new Map());
      }
      continue;
    }

    if (!currentMarket) {
      continue;
    }

    if (entry.type === 'string' && (entry.field === 10 || entry.field === 11) && entry.depth >= 6) {
      pendingSelection = normaliseWhitespace(String(entry.value));
      continue;
    }

    if (entry.type === 'number' && entry.field === 12 && entry.depth >= 6 && pendingSelection) {
      const odd = Number(entry.value);
      if (Number.isFinite(odd) && odd >= 1.01) {
        markets.get(currentMarket)?.set(pendingSelection, odd);
      }
      pendingSelection = null;
    }
  }

  const parsedMarkets: ScrapedMarket[] = [];
  // Track seen canonical market names so that when multiple raw market names
  // alias to the same canonical name (e.g. "Resultado" and "Resultado (Tempo
  // Regulamentar)" both alias to "1X2"), only the FIRST occurrence is kept.
  // In Betclic's proto response the live/in-play market appears before the
  // suspended pre-match market, so first-wins gives us the live odds.
  const seenCanonical = new Set<string>();

  for (const [marketName, selectionsMap] of markets.entries()) {
    const canonicalMarket = DETAIL_MARKET_ALIASES[marketName] ?? marketName;

    const selections = filterSelectionsForMarket(
      canonicalMarket,
      Array.from(selectionsMap.entries()).map(([selection, value]) => ({
        selection,
        value,
      })),
      homeTeam,
      awayTeam,
    );

    if (selections.length < 2) {
      continue;
    }

    if (seenCanonical.has(canonicalMarket)) {
      // A more-specific (live) market already claimed this canonical name —
      // discard this duplicate (typically the suspended pre-match version).
      continue;
    }

    seenCanonical.add(canonicalMarket);
    parsedMarkets.push({ market: canonicalMarket, selections });
  }

  return parsedMarkets;
}

function tryParseInlineSelection(line: string): { selection: string; value: number } | null {
  const match = normaliseWhitespace(line).match(/^(.*?)\s+(\d+(?:[.,]\d+)?)$/);
  if (!match) {
    return null;
  }

  const selection = normaliseWhitespace(match[1] ?? '');
  const value = parseOdds(match[2] ?? '');
  if (!selection || !Number.isFinite(value) || value < 1.01) {
    return null;
  }

  return { selection, value };
}

function canonicaliseSelectionLabel(selection: string, homeTeam: string, awayTeam: string): string {
  const normalised = normaliseWhitespace(selection);
  if (normalised === homeTeam) {
    return '1';
  }

  if (normalised === awayTeam) {
    return '2';
  }

  if (/^empate$/i.test(normalised)) {
    return 'X';
  }

  return normalised;
}

function isIgnoredDetailTitle(title: string): boolean {
  return DETAIL_IGNORED_TITLES.has(title)
    || DETAIL_IGNORED_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function canonicaliseMarketTitle(title: string): string | null {
  const cleanedTitle = normaliseWhitespace(title)
    .replace(/\s+[|:]\s+mais mercados$/i, '')
    .replace(/\s+-\s+ao vivo$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedTitle || isIgnoredDetailTitle(cleanedTitle)) {
    return null;
  }

  return DETAIL_MARKET_ALIASES[cleanedTitle] ?? cleanedTitle;
}

function filterSelectionsForMarket(
  market: string,
  selections: Array<{ selection: string; value: number }>,
  homeTeam: string,
  awayTeam: string,
): Array<{ selection: string; value: number }> {
  if (market === 'As duas equipas marcam') {
    return selections.filter(({ selection }) => /^(sim|não|nao)$/i.test(selection));
  }

  if (market === 'Resultado duplo') {
    return selections.filter(({ selection }) => selection.includes(' ou '));
  }

  if (market === 'Equipa a marcar o golo 2') {
    return selections.filter(({ selection }) =>
      selection === homeTeam || selection === awayTeam || /^nenhum golo$/i.test(selection),
    );
  }

  if (market === 'Resultado - Primeira Parte') {
    return selections.filter(({ selection }) =>
      selection === homeTeam || selection === awayTeam || /^empate$/i.test(selection),
    );
  }

  if (market === 'Marcador') {
    return selections.filter(({ selection }) =>
      !/^acima de$/i.test(selection)
      && !/^abaixo de$/i.test(selection)
      && !/^sim$/i.test(selection)
      && !/^não$/i.test(selection)
      && !/^nao$/i.test(selection),
    );
  }

  return selections;
}

function upsertDetailMarket(
  target: Map<string, ScrapedMarket>,
  title: string,
  selections: Array<{ selection: string; value: number }>,
  homeTeam: string,
  awayTeam: string,
): void {
  const canonicalTitle = canonicaliseMarketTitle(title);
  if (!canonicalTitle) {
    return;
  }

  const deduped = new Map<string, number>();
  for (const entry of selections) {
    const selection = canonicalTitle === '1X2'
      ? canonicaliseSelectionLabel(entry.selection, homeTeam, awayTeam)
      : normaliseWhitespace(entry.selection);

    if (!selection || !Number.isFinite(entry.value) || entry.value < 1.01) {
      continue;
    }

    deduped.set(selection, entry.value);
  }

  const filteredSelections = filterSelectionsForMarket(
    canonicalTitle,
    Array.from(deduped.entries()).map(([selection, value]) => ({ selection, value })),
    homeTeam,
    awayTeam,
  );

  if (canonicalTitle === '1X2') {
    const labels = new Set(filteredSelections.map((selection) => selection.selection));
    if (!labels.has('1') || !labels.has('X') || !labels.has('2')) {
      return;
    }
  } else if (filteredSelections.length < 2) {
    return;
  }

  target.set(canonicalTitle, {
    market: canonicalTitle,
    selections: filteredSelections,
  });
}

function parseDetailMarkets(detailText: string, homeTeam: string, awayTeam: string): ScrapedMarket[] {
  const lines = detailText
    .split('\n')
    .map((line) => normaliseWhitespace(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const detailStart = Math.max(lines.indexOf('Top'), 0);
  const relevantLines = lines.slice(detailStart);
  const collectedMarkets = new Map<string, ScrapedMarket>();
  let currentTitle: string | null = null;
  let pendingLabelParts: string[] = [];
  let pendingSelections: Array<{ selection: string; value: number }> = [];

  const flushPendingLabel = (): string => {
    const value = normaliseWhitespace(pendingLabelParts.join(' '));
    pendingLabelParts = [];
    return value;
  };

  const flushMarket = (): void => {
    if (!currentTitle) {
      pendingSelections = [];
      pendingLabelParts = [];
      return;
    }

    upsertDetailMarket(collectedMarkets, currentTitle, pendingSelections, homeTeam, awayTeam);
    currentTitle = null;
    pendingSelections = [];
    pendingLabelParts = [];
  };

  for (const line of relevantLines) {
    if (isIgnoredDetailTitle(line)) {
      flushMarket();
      continue;
    }

    if (DETAIL_MARKET_TITLES.has(line)) {
      flushMarket();
      currentTitle = line;
      continue;
    }

    if (!currentTitle) {
      continue;
    }

    if (/^\d+'$/.test(line) || /apostas feitas nos últimos/i.test(line) || /^IN$/i.test(line)) {
      continue;
    }

    const inlineSelection = tryParseInlineSelection(line);
    if (inlineSelection) {
      pendingSelections.push(inlineSelection);
      pendingLabelParts = [];
      continue;
    }

    if (isOddToken(line)) {
      const selection = flushPendingLabel();
      const value = parseOdds(line);
      if (selection && Number.isFinite(value) && value >= 1.01) {
        pendingSelections.push({ selection, value });
      }
      continue;
    }

    pendingLabelParts.push(line);
  }

  flushMarket();
  return Array.from(collectedMarkets.values());
}

function takeDebugHtmlSnapshot(page: Page, filenameBase: string): Promise<string> {
  return page.evaluate(() => document.documentElement?.outerHTML?.slice(0, 25_000) ?? '');
}

/**
 * Kill any browser process that owns the given userDataDir, then wait briefly
 * for the OS to release the lock before a new browser is launched.
 *
 * On Windows, Edge/Chromium holds a named-pipe lock on the profile directory.
 * Deleting SingletonLock alone cannot break this OS-level lock — the owning
 * process must exit first.  We target only processes whose command-line
 * contains the profile folder basename (e.g. "betclic-catalogue" or
 * "betclic-live"), so genuine user Edge windows are never affected.
 *
 * On Linux (Docker production), the lock is a plain symlink — just remove it.
 */
async function releaseProfileLock(profileDir: string): Promise<void> {
  if (process.platform === 'win32') {
    const keyword = path.basename(profileDir); // "betclic-catalogue" | "betclic-live"
    try {
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | ` +
        `Where-Object { $_.CommandLine -like '*${keyword}*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore', timeout: 8_000 },
      );
    } catch {
      // No matching processes or PowerShell unavailable — safe to ignore.
    }
  } else {
    // On Linux/Docker: SingletonLock is a symlink; remove it.
    const lockFile = path.join(profileDir, 'SingletonLock');
    try { fs.unlinkSync(lockFile); } catch { /* lock may not exist */ }
  }
  // Brief pause for the OS to fully release locks before the new launch.
  await new Promise<void>((resolve) => { setTimeout(resolve, 400); });
}

// ─── Scraper class ────────────────────────────────────────────────────────────

export class BetclicScraper implements IScraper {
  readonly siteSlug = 'betclic';
  readonly siteName = 'Betclic';

  async scrapeEvents(): Promise<ScrapedEvent[]> {
    let browser;
    try {
      // Use a persistent userDataDir so cookies/session survive across launches.
      // releaseProfileLock() kills any zombie browser holding the named-pipe lock
      // (Windows) or removes the SingletonLock symlink (Linux) before we launch,
      // preventing the "Failed to launch the browser process" hang on restarts.
      const catalogueProfileDir = path.join(
        process.cwd(),
        '.scraper-profiles',
        'betclic-catalogue',
      );
      await releaseProfileLock(catalogueProfileDir);
      const scrapeProxyUrl = await getLocalProxyUrl();
      browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
        headless: true,
        args: buildBrowserArgs(scrapeProxyUrl),
        userDataDir: catalogueProfileDir,
      });

      const page = await browser.newPage();
      const interceptedMatchResponses = new Map<string, Buffer>();

      await this.configurePage(page);

      // Keep stylesheets enabled here. Betclic detail pages proved more reliable
      // when rendered as a more normal browser session during inspection.
      await page.setRequestInterception(true);
      page.on('request', (req: HTTPRequest) => {
        const type = req.resourceType();
        if (['image', 'media', 'font'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      page.on('response', (response: HTTPResponse) => {
        void readBetclicMatchApiResponse(response).then((captured) => {
          if (!captured) {
            return;
          }

          interceptedMatchResponses.set(captured.eventId, captured.responseBody);
        });
      });

      const ready = await this.navigateToFootballCatalogue(page, 'catalogue');
      if (!ready) {
        await this.saveDebugSnapshot(page, 'betclic');
        await browser.close();
        return [];
      }

      // Wait for event list to render (Angular hydration)
      try {
        await page.waitForSelector(
          'sports-events-list, sport-event-listitem, a.cardEvent, [class*="cardEvent"], .sportEvent-list',
          { timeout: 25_000 },
        );
      } catch {
        const currentUrl = page.url();
        let pageTitle = '';
        try { pageTitle = await page.title(); } catch { /* ignore */ }
        logger.warn('BetclicScraper: event list selector not found — page may have changed structure', {
          url: currentUrl,
          title: pageTitle,
        });
        await this.saveDebugSnapshot(page, 'betclic');
        await browser.close();
        return [];
      }

      // Scroll down to trigger lazy loading of more events
      await this.scrollDown(page);

      // Wait for individual event items — they render after the outer container.
      try {
        await page.waitForSelector(
          'a.cardEvent, sport-event-listitem, [class*="event_item"]',
          { timeout: 15_000 },
        );
      } catch {
        logger.debug('BetclicScraper: inner item selector timed out; attempting extract anyway');
      }
      await randomDelay(1000, 2500);

      // Extract raw event data from the DOM
      const rawEvents = await this.extractEvents(page);

      if (rawEvents.length > 0) {
        await this.enrichEventsFromApi(rawEvents, interceptedMatchResponses, page);

        const fallbackTargets = rawEvents
          .filter((event) => (event.detailMarkets?.length ?? 0) < API_MARKET_MINIMUM)
          .slice(0, DETAIL_FALLBACK_LIMIT);

        if (fallbackTargets.length > 0) {
          await this.enrichEventsFromDetailPages(page, fallbackTargets, interceptedMatchResponses);
        }
      }

      logger.info(`BetclicScraper: extracted ${rawEvents.length} raw events`);

      if (rawEvents.length === 0) {
        await this.saveDebugSnapshot(page, 'betclic');
        logger.debug('BetclicScraper: debug snapshot saved (0 events)');
      }

      // Parse raw data into ScrapedEvent objects
      const events = this.parseRawEvents(rawEvents);

      await browser.close();
      return events;
    } catch (err) {
      let errorMsg: string;
      if (err instanceof Error) {
        errorMsg = `${err.constructor.name}: ${err.message}`;
      } else if (err !== null && typeof err === 'object') {
        const props = Object.getOwnPropertyNames(err as object);
        errorMsg = props.length
          ? props.map((k) => `${k}: ${String((err as Record<string, unknown>)[k])}`).join('; ')
          : (JSON.stringify(err) || '[empty object]');
      } else {
        errorMsg = String(err);
      }
      logger.error('BetclicScraper: uncaught error', { error: errorMsg });
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      // Never let a scraper crash the queue — return empty array
      return [];
    }
  }

  async startLiveWatch(
    onDispatch: (dispatch: BetclicLiveWatchDispatch) => Promise<void>,
  ): Promise<() => Promise<void>> {
    // Use a persistent userDataDir so cookies/session survive across watcher
    // restarts — essential to pass Betclic's bot-detection on the first page load.
    // releaseProfileLock() ensures no zombie process holds the named-pipe lock
    // before we launch (Windows) or clears the SingletonLock symlink (Linux).
    const liveProfileDir = path.join(
      process.cwd(),
      '.scraper-profiles',
      'betclic-live',
    );
    await releaseProfileLock(liveProfileDir);
    const liveProxyUrl = await getLocalProxyUrl();
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
      headless: true,
      args: buildBrowserArgs(liveProxyUrl),
      userDataDir: liveProfileDir,
    });

    const page = await browser.newPage();
    const liveEventsById = new Map<string, RawEventData>();
    let refreshTimer: NodeJS.Timeout | null = null;
    let refreshInFlight = false;
    let stopped = false;
    let dispatchChain = Promise.resolve();

    const queueDispatch = (dispatch: BetclicLiveWatchDispatch): void => {
      if (dispatch.events.length === 0 || stopped) {
        return;
      }

      dispatchChain = dispatchChain
        .then(() => onDispatch(dispatch))
        .catch((error: unknown) => {
          logger.warn('Betclic live watcher dispatch failed', {
            source: dispatch.source,
            incremental: dispatch.incremental,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    };

    await this.configurePage(page);
    await page.setRequestInterception(true);

    page.on('request', (req: HTTPRequest) => {
      const type = req.resourceType();
      if (['image', 'media', 'font'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.on('response', (response: HTTPResponse) => {
      void readBetclicMatchApiResponse(response).then((captured) => {
        if (!captured || stopped) {
          return;
        }

        const rawEvent = liveEventsById.get(captured.eventId);
        if (!rawEvent) {
          return;
        }

        const detailMarkets = extractMarketsFromApiResponse(
          captured.responseBody,
          rawEvent.homeTeam,
          rawEvent.awayTeam,
        );
        if (detailMarkets.length < API_MARKET_MINIMUM) {
          return;
        }

        rawEvent.detailMarkets = detailMarkets;
        const [event] = this.parseRawEvents([rawEvent]);
        if (!event) {
          return;
        }

        queueDispatch({
          events: [event],
          incremental: true,
          source: 'network',
        });
      });
    });

    const refreshCatalogue = async (): Promise<void> => {
      if (stopped || refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      try {
        logger.debug('Betclic live watcher: refreshing live page');
        const ready = await this.navigateToLivePage(page, 'live-watch');
        if (!ready) {
          logger.warn('Betclic live watcher: live page unavailable after retries');
          return;
        }

        try {
          // Wait for actual rendered cards, not just the Angular container shell.
          // sports-events-list appears in the DOM before Angular populates it,
          // so matching that element would cause extractEvents to fire too early.
          await page.waitForFunction(
            () => document.querySelectorAll('a.cardEvent, sport-event-listitem').length > 0,
            { timeout: 25_000 },
          );
        } catch {
          logger.warn('Betclic live watcher: no event cards rendered after 25 s');
          return;
        }

        await this.scrollForLiveWatch(page);
        const rawEvents = await this.extractEvents(page);
        const nextLiveEvents = new Map<string, RawEventData>();

        for (const rawEvent of rawEvents) {
          const eventId = extractEventIdFromPath(rawEvent.detailPath ?? '')
            ?? (/^\d+$/.test(rawEvent.externalId) ? rawEvent.externalId : null);
          if (!eventId) {
            continue;
          }

          // All events on betclic.pt/live are live — no isLive/withinLiveWindow
          // guard needed (that was for the pre-match page which mixed upcoming events).
          // Force isLive=true so scraperRegistry treats them correctly.
          rawEvent.isLive = true;

          const previous = liveEventsById.get(eventId);
          if ((rawEvent.detailMarkets?.length ?? 0) === 0 && previous?.detailMarkets?.length) {
            rawEvent.detailMarkets = previous.detailMarkets;
          }

          nextLiveEvents.set(eventId, rawEvent);
        }

        liveEventsById.clear();
        nextLiveEvents.forEach((value, key) => liveEventsById.set(key, value));

        queueDispatch({
          events: this.parseRawEvents(Array.from(liveEventsById.values())),
          incremental: false,
          source: 'catalogue',
        });

        logger.info('Betclic live watcher catalogue refreshed', {
          trackedEvents: liveEventsById.size,
        });
      } catch (error) {
        logger.warn('Betclic live watcher refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        refreshInFlight = false;
      }
    };

    await refreshCatalogue();
    refreshTimer = setInterval(() => {
      void refreshCatalogue();
    }, 20_000);

    return async () => {
      stopped = true;
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }

      await dispatchChain.catch(() => undefined);
      await browser.close().catch(() => undefined);
    };
  }

  // ─── Page interaction helpers ───────────────────────────────────────────────

  /** Tries to click the cookie consent accept button silently. */
  private async dismissCookieConsent(page: Page): Promise<void> {
    const selectors = [
      '#tc_privacy_button_2',
      '#popin_tc_privacy_button_2',
      '#footer_tc_privacy_button_2',
      '#header_tc_privacy_button_2',
      '[data-testid="cookie-accept"]',
      '[id*="cookie"] button[class*="accept"]',
      'button[class*="cookieConsent"]',
      '#onetrust-accept-btn-handler',
      '#tc-privacy-button',
      '#privacy-button',
      '[class*="privacy"] button',
      '.cc-btn.cc-allow',
    ];
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          logger.debug('BetclicScraper: dismissed cookie consent');
          return;
        }
      } catch {
        // Silently skip missing elements
      }
    }

    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
        const candidates = buttons
          .map((element) => ({
            element,
            text: element.textContent?.trim().toLowerCase() ?? '',
          }))
          .filter(({ text }) => text.length > 0);

        const target = candidates.find(({ text }) => text.includes('aceitar tudo'))
          ?? candidates.find(({ text }) => text.includes('accept all'))
          ?? candidates.find(({ text }) => text.includes('aceitar'))
          ?? candidates.find(({ text }) => text.includes('accept'));

        if (!target) {
          return false;
        }

        (target.element as HTMLElement).click();
        return true;
      });

      if (clicked) {
        logger.debug('BetclicScraper: dismissed cookie consent via visible button text');
      }
    } catch {
      // Ignore text-search fallback failures.
    }

    try {
      const clickedById = await page.evaluate(() => {
        const element = document.querySelector(
          '#tc_privacy_button_2, #popin_tc_privacy_button_2, #footer_tc_privacy_button_2, #header_tc_privacy_button_2',
        ) as HTMLElement | null;

        if (!element) {
          return false;
        }

        element.click();
        return true;
      });

      if (clickedById) {
        logger.debug('BetclicScraper: dismissed cookie consent via TrustCommander accept-all button');
      }
    } catch {
      // Ignore direct TrustCommander click failures.
    }
  }

  private async waitForCookieOverlayToClear(page: Page): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const pageText = document.body?.innerText?.toLowerCase() ?? '';
          return !pageText.includes('aceitar tudo')
            && !pageText.includes('recusar tudo')
            && !pageText.includes('cookies, tu escolhes');
        },
        { timeout: 10_000 },
      );
    } catch {
      logger.debug('BetclicScraper: cookie overlay still visible after dismissal attempt');
    }
  }

  private async configurePage(page: Page): Promise<void> {
    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    });
    await page.setViewport({ width: 1366, height: 768 });
    await page.emulateTimezone(BETCLIC_TIME_ZONE).catch(() => undefined);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', {
        configurable: true,
        get: () => 'pt-PT',
      });
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        get: () => ['pt-PT', 'pt', 'en-US', 'en'],
      });
    });
  }

  private async isForbiddenPage(page: Page, response?: HTTPResponse | null): Promise<boolean> {
    if (response?.status() === 403) {
      return true;
    }

    let title = '';
    let pageText = '';

    try {
      title = await page.title();
    } catch {
      title = '';
    }

    try {
      pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 1_500) ?? '');
    } catch {
      pageText = '';
    }

    return /error\s*403|forbidden|please try again in a few minutes|0x2005002/i.test(`${title}\n${pageText}`);
  }

  private async navigateToFootballCatalogue(page: Page, context: string): Promise<boolean> {
    for (let attempt = 1; attempt <= BETCLIC_NAVIGATION_RETRIES; attempt += 1) {
      await this.configurePage(page);

      logger.debug('BetclicScraper: warming Betclic session', {
        context,
        attempt,
      });

      const homeResponse = await page.goto(BETCLIC_HOME_URL, {
        waitUntil: 'networkidle2',
        timeout: BETCLIC_NAVIGATION_TIMEOUT_MS,
      });

      await randomDelay(1200, 2200);

      if (await this.isForbiddenPage(page, homeResponse)) {
        logger.warn('BetclicScraper: homepage returned forbidden response', { context, attempt });
        await randomDelay(3000 * attempt, 4500 * attempt);
        continue;
      }

      await this.dismissCookieConsent(page);
      await this.waitForCookieOverlayToClear(page);
      await randomDelay(600, 1200);

      logger.debug('BetclicScraper: navigating to football catalogue', {
        context,
        attempt,
        targetUrl: FOOTBALL_URL,
      });

      const catalogueResponse = await page.goto(FOOTBALL_URL, {
        referer: BETCLIC_HOME_URL,
        timeout: BETCLIC_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });

      await randomDelay(1200, 2200);
      await this.dismissCookieConsent(page);
      await this.waitForCookieOverlayToClear(page);

      if (!(await this.isForbiddenPage(page, catalogueResponse))) {
        // Wait for Angular to bootstrap and render at least the event container.
        // `domcontentloaded` fires before the SPA renders — we need the
        // component to actually appear before the caller's waitForSelector.
        try {
          await page.waitForFunction(
            () => Boolean(
              document.querySelector(
                'sports-events-list, sport-event-listitem, a.cardEvent, [class*="cardEvent"]',
              ),
            ),
            { timeout: 20_000 },
          );
        } catch {
          // Angular may still be warming up; the caller waitForSelector will
          // provide a second chance with its own timeout.
        }
        return true;
      }

      logger.warn('BetclicScraper: football catalogue returned forbidden response', {
        context,
        attempt,
        targetUrl: FOOTBALL_URL,
      });
      await randomDelay(3000 * attempt, 4500 * attempt);
    }

    return false;
  }

  /**
   * Navigates to the Betclic live betting section (betclic.pt/live).
   * Used exclusively by the live watcher — the pre-match catalogue page
   * does not show games already in progress.
   */
  private async navigateToLivePage(page: Page, context: string): Promise<boolean> {
    for (let attempt = 1; attempt <= BETCLIC_NAVIGATION_RETRIES; attempt += 1) {
      await this.configurePage(page);

      logger.debug('BetclicScraper: navigating to live section', { context, attempt });

      try {
        // Angular SPA requires a session warm-up at the homepage (same pattern as
        // navigateToFootballCatalogue). Without this, betclic.pt/live loads as a
        // bare bootstrap shell and never hydrates — resulting in 0 events extracted.
        // Skip the warm-up if we're already on a Betclic page (subsequent refreshes).
        const currentUrl = page.url();
        if (!currentUrl.includes('betclic.pt')) {
          const homeResponse = await page.goto(BETCLIC_HOME_URL, {
            timeout: BETCLIC_NAVIGATION_TIMEOUT_MS,
            waitUntil: 'networkidle2',
          });

          await randomDelay(1200, 2200);
          await this.dismissCookieConsent(page);
          await this.waitForCookieOverlayToClear(page);

          if (await this.isForbiddenPage(page, homeResponse)) {
            logger.warn('BetclicScraper: live watcher homepage warm-up forbidden', { context, attempt });
            await randomDelay(3000 * attempt, 4500 * attempt);
            continue;
          }

          await randomDelay(600, 1200);
        }

        const response = await page.goto(BETCLIC_LIVE_URL, {
          referer: BETCLIC_HOME_URL,
          timeout: BETCLIC_NAVIGATION_TIMEOUT_MS,
          waitUntil: 'networkidle2',
        });

        await randomDelay(1200, 2200);
        await this.dismissCookieConsent(page);
        await this.waitForCookieOverlayToClear(page);

        if (await this.isForbiddenPage(page, response)) {
          logger.warn('BetclicScraper: live page returned forbidden response', { context, attempt });
          await randomDelay(3000 * attempt, 4500 * attempt);
          continue;
        }

        // Wait for actual event cards — not just the Angular container element
        // (sports-events-list exists in the DOM before Angular renders its children).
        try {
          await page.waitForFunction(
            () => document.querySelectorAll('a.cardEvent, sport-event-listitem').length > 0,
            { timeout: 20_000 },
          );
        } catch {
          // No card appeared within the timeout; extractEvents will return 0 and
          // the caller will log the empty result.
        }

        return true;
      } catch (err) {
        logger.warn('BetclicScraper: live page navigation error', {
          context,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        await randomDelay(2000 * attempt, 3500 * attempt);
      }
    }

    return false;
  }

  private async saveDebugSnapshot(page: Page, prefix: string): Promise<void> {
    try {
      const screenshotDir = path.join(process.cwd(), 'debug-screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      const ts = Date.now();
      await page.screenshot({ path: path.join(screenshotDir, `${prefix}-${ts}.png`) });
      const html = await takeDebugHtmlSnapshot(page, `${prefix}-${ts}`);
      fs.writeFileSync(path.join(screenshotDir, `${prefix}-${ts}.html`), html);
      logger.debug('BetclicScraper: debug screenshot + HTML saved to debug-screenshots/');
    } catch {
      // Best-effort diagnostic only.
    }
  }

  private async scrollDown(page: Page): Promise<void> {
    // Betclic is an Angular SPA that lazy-loads events as you scroll.
    // 4 progressive scroll steps with pauses so Angular can render each batch.
    for (let step = 1; step <= 4; step++) {
      const ratio = step / 4;
      await page.evaluate((r) => {
        window.scrollTo({ top: document.body.scrollHeight * r, behavior: 'smooth' });
      }, ratio);
      await randomDelay(500, 900);
    }
    // Final pass: scroll to absolute bottom and wait for any remaining renders
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await randomDelay(800, 1300);
  }

  private async scrollForLiveWatch(page: Page): Promise<void> {
    for (let step = 1; step <= 2; step++) {
      const ratio = step / 2;
      await page.evaluate((r) => {
        window.scrollTo({ top: document.body.scrollHeight * r, behavior: 'smooth' });
      }, ratio);
      await randomDelay(500, 900);
    }

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await randomDelay(300, 600);
  }

  private async enrichEventsFromApi(
    rawEvents: RawEventData[],
    interceptedMatchResponses: ReadonlyMap<string, Buffer>,
    page: Page,
  ): Promise<void> {
    const queue = rawEvents
      .map((event) => ({
        event,
        eventId: extractEventIdFromPath(event.detailPath ?? '') ?? (/^\d+$/.test(event.externalId) ? event.externalId : null),
      }))
      .filter((candidate): candidate is { event: RawEventData; eventId: string } => Boolean(candidate.eventId));

    logger.debug('BetclicScraper: API enrichment candidates prepared', {
      totalEvents: rawEvents.length,
      candidates: queue.length,
      sampleIds: queue.slice(0, 3).map((candidate) => candidate.eventId),
    });

    // ── Fast path: process already-intercepted responses from page network traffic ──
    for (const candidate of queue) {
      const interceptedResponse = interceptedMatchResponses.get(candidate.eventId);
      if (!interceptedResponse) {
        continue;
      }
      try {
        const apiMarkets = extractMarketsFromApiResponse(
          interceptedResponse,
          candidate.event.homeTeam,
          candidate.event.awayTeam,
        );
        if (apiMarkets.length >= API_MARKET_MINIMUM) {
          candidate.event.detailMarkets = apiMarkets;
          logger.debug('BetclicScraper: enriched event from match API', {
            event: `${candidate.event.homeTeam} vs ${candidate.event.awayTeam}`,
            eventId: candidate.eventId,
            source: 'page-network',
            markets: apiMarkets.map((m) => m.market).slice(0, 12),
          });
        }
      } catch (err) {
        logger.debug('BetclicScraper: failed to parse intercepted response', {
          eventId: candidate.eventId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Events not captured by page-network interception during catalogue load will be
    // picked up by enrichEventsFromDetailPages — navigating to each event's detail
    // page causes the Angular app to call GetMatchWithNotification itself, which the
    // existing page.on('response') listener intercepts automatically.
    const unenriched = queue.filter((c) => !interceptedMatchResponses.has(c.eventId));
    if (unenriched.length > 0) {
      logger.debug('BetclicScraper: events not captured via page-network — detail-page fallback will handle', {
        count: unenriched.length,
      });
    }
  }

  private async enrichEventsFromDetailPages(
    page: Page,
    rawEvents: RawEventData[],
    interceptedMatchResponses: ReadonlyMap<string, Buffer>,
  ): Promise<void> {
    const candidates = rawEvents
      .filter((event) => Boolean(event.detailPath))
      .slice(0, DETAIL_FALLBACK_LIMIT);

    logger.debug('BetclicScraper: detail-page enrichment candidates prepared', {
      totalEvents: rawEvents.length,
      candidates: candidates.length,
      samplePaths: candidates.slice(0, 3).map((event) => event.detailPath),
    });

    for (const event of candidates) {
      if (!event.detailPath) {
        continue;
      }

      try {
        const detailUrl = new URL(event.detailPath, FOOTBALL_URL).toString();
        await page.goto(detailUrl, {
          waitUntil: 'networkidle2',
          timeout: 45_000,
        });
        await this.dismissCookieConsent(page);
        await this.waitForCookieOverlayToClear(page);
        await randomDelay(1000, 1800);

        // Prefer API data intercepted during this navigation over DOM text.
        // When Angular renders the event detail, it calls GetMatchWithNotification
        // which the page.on('response') listener in scrapeEvents() captures.
        const eventId =
          extractEventIdFromPath(event.detailPath) ??
          (/^\d+$/.test(event.externalId) ? event.externalId : null);
        const interceptedBuffer = eventId ? interceptedMatchResponses.get(eventId) : null;

        if (interceptedBuffer) {
          try {
            const apiMarkets = extractMarketsFromApiResponse(
              interceptedBuffer,
              event.homeTeam,
              event.awayTeam,
            );
            if (apiMarkets.length >= API_MARKET_MINIMUM) {
              event.detailMarkets = apiMarkets;
              logger.debug('BetclicScraper: enriched event from detail-page API intercept', {
                event: `${event.homeTeam} vs ${event.awayTeam}`,
                markets: apiMarkets.map((m) => m.market).slice(0, 12),
              });
              continue;
            }
          } catch {
            // fall through to DOM text parsing
          }
        }

        const detailText = await page.evaluate(() => document.body?.innerText ?? '');
        const detailMarkets = parseDetailMarkets(detailText, event.homeTeam, event.awayTeam);

        if (detailMarkets.length > (event.detailMarkets?.length ?? 0)) {
          event.detailMarkets = detailMarkets;
          logger.debug('BetclicScraper: enriched event from DOM fallback', {
            event: `${event.homeTeam} vs ${event.awayTeam}`,
            markets: detailMarkets.map((market) => market.market),
          });
        } else {
          logger.debug('BetclicScraper: DOM fallback yielded no better market set', {
            event: `${event.homeTeam} vs ${event.awayTeam}`,
            detailPath: event.detailPath,
          });
        }
      } catch (error) {
        logger.debug('BetclicScraper: failed to enrich event via detail-page fallback', {
          event: `${event.homeTeam} vs ${event.awayTeam}`,
          detailPath: event.detailPath,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
      }
    }
  }

  /**
   * Runs inside the browser context to extract serialisable event data from the DOM.
   *
   * Betclic PT uses Angular custom elements. The selectors below target the most
   * stable structural patterns. Update selectors here when the site redesigns.
   *
   * Selector strategy (most specific → fallback):
   * - `sport-event-listitem`  — custom element wrapping each event row
   * - `[class*="event_"]`     — fallback class-pattern match
   * Teams:
   * - `[class*="scoreboard_team"]` → first=home, second=away
   * - `[class*="team_name"]` (fallback)
   * Date:
   * - `time[datetime]` → ISO string in the datetime attribute
   * - `[class*="startDate"]` → text content fallback
   * League:
   * - Nearest `[class*="competition_title"]` ancestor text (may not be on the item itself)
   * - Fallback: "Futebol"
   * Odds (1X2 — first three oddbutton/odd-value elements on the row):
   * - `oddbutton` custom element → text content
   * - `[class*="oddValue"]` / `[class*="odd_value"]` → fallback button patterns
   */
  private async extractEvents(page: Page): Promise<RawEventData[]> {
    return page.evaluate((): RawEventData[] => {
      const results: RawEventData[] = [];
      const BETCLIC_TIME_ZONE = 'Europe/Lisbon';

      const normaliseBrowserWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

      const getBrowserTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        });

        const parts = formatter.formatToParts(date);
        const values = Object.fromEntries(
          parts
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)]),
        ) as Record<string, number>;

        const asUtc = Date.UTC(
          values.year,
          (values.month ?? 1) - 1,
          values.day ?? 1,
          values.hour ?? 0,
          values.minute ?? 0,
          values.second ?? 0,
        );

        return asUtc - date.getTime();
      };

      const createBrowserDateInTimeZone = (
        year: number,
        month: number,
        day: number,
        hour: number,
        minute: number,
        timeZone: string,
      ): Date => {
        const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
        const offset = getBrowserTimeZoneOffsetMs(utcGuess, timeZone);
        return new Date(utcGuess.getTime() - offset);
      };

      const parseBetclicEventDate = (
        dateAttr?: string | null,
        dateText?: string | null,
        referenceDate = new Date(),
      ): string | null => {
        if (dateAttr) {
          const parsedAttr = new Date(dateAttr);
          if (!Number.isNaN(parsedAttr.getTime())) {
            return parsedAttr.toISOString();
          }
        }

        const rawText = normaliseBrowserWhitespace(dateText ?? '');
        if (!rawText) {
          return null;
        }

        const normalisedText = rawText
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/,/g, ' ')
          .toLowerCase();

        const explicitDateMatch = normalisedText.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
        if (explicitDateMatch) {
          const day = Number(explicitDateMatch[1]);
          const month = Number(explicitDateMatch[2]);
          const yearToken = explicitDateMatch[3];
          const year = yearToken
            ? (yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken))
            : referenceDate.getUTCFullYear();
          const hour = Number(explicitDateMatch[4]);
          const minute = Number(explicitDateMatch[5]);
          return createBrowserDateInTimeZone(year, month, day, hour, minute, BETCLIC_TIME_ZONE).toISOString();
        }

        const relativeMatch = normalisedText.match(/\b(hoje|amanha)\b\s+(\d{1,2}):(\d{2})/);
        if (relativeMatch) {
          const localReference = new Date(referenceDate.toLocaleString('en-US', { timeZone: BETCLIC_TIME_ZONE }));
          const dayOffset = relativeMatch[1] === 'amanha' ? 1 : 0;
          const baseDay = new Date(localReference);
          baseDay.setDate(baseDay.getDate() + dayOffset);
          return createBrowserDateInTimeZone(
            baseDay.getFullYear(),
            baseDay.getMonth() + 1,
            baseDay.getDate(),
            Number(relativeMatch[2]),
            Number(relativeMatch[3]),
            BETCLIC_TIME_ZONE,
          ).toISOString();
        }

        // NOTE: a bare time-only token ("23:30" with no date prefix) is NOT
        // handled here. We cannot distinguish "today at 23:30" from "tomorrow
        // at 23:30" — using today's date caused events scheduled for the next
        // calendar day to be stored with the wrong date and later promoted to
        // LIVE. Betclic provides explicit date info via the `datetime` attribute,
        // "DD/MM HH:MM" patterns, or "Hoje/Amanhã" labels on all upcoming events;
        // events lacking any of those are skipped rather than misdated.
        return null;
      };

      const resolveDetailHref = (item: Element): string | undefined => {
        const hrefCandidates = [
          item.getAttribute('href'),
          item.getAttribute('data-href'),
          item.getAttribute('routerlink'),
          item.getAttribute('ng-reflect-router-link'),
          item.closest('a[href*="/futebol-"]')?.getAttribute('href'),
          item.querySelector('a[href*="/futebol-"]')?.getAttribute('href'),
          item.querySelector('a[href*="-m"]')?.getAttribute('href'),
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value));

        return hrefCandidates.find((value) => value.includes('/futebol-')) ?? hrefCandidates[0];
      };

      const parseTextFallback = (): RawEventData[] => {
        const fallbackResults: RawEventData[] = [];

        const parseTeamAndOdd = (value: string): { team: string; odd: string } | null => {
          const match = value.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)$/);
          if (!match) {
            return null;
          }

          return {
            team: match[1]?.trim() ?? '',
            odd: match[2]?.trim() ?? '',
          };
        };

        const anchorCards = Array.from(
          document.querySelectorAll('a.cardEvent[href*="/futebol-"]'),
        );

        for (const anchor of anchorCards) {
          const oddTexts = Array.from(
            anchor.querySelectorAll('button, oddbutton, [class*="is-odd"], [class*="oddValue"], [class*="odd_value"]'),
          )
            .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(Boolean);

          if (oddTexts.length < 3) {
            continue;
          }

          const homeData = parseTeamAndOdd(oddTexts[0] ?? '');
          const drawMatch = (oddTexts[1] ?? '').match(/Empate\s+(\d+(?:[.,]\d+)?)/i);
          const awayData = parseTeamAndOdd(oddTexts[2] ?? '');

          if (!homeData || !drawMatch || !awayData) {
            continue;
          }

          const lines = (anchor.textContent ?? '')
            .split('\n')
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

          const league = lines.find((candidate) =>
            candidate.includes('Jornada')
            || candidate.includes('Liga')
            || candidate.includes('League')
            || candidate.includes('MLS')
            || candidate.includes('Primera')
            || candidate.includes('National')
            || candidate.includes('Conference'),
          ) ?? 'Futebol';

          const timeEl = anchor.querySelector('time[datetime]');
          const dateAttr = timeEl?.getAttribute('datetime');
          const eventDateIso = parseBetclicEventDate(dateAttr, timeEl?.textContent ?? anchor.textContent ?? '');
          if (!eventDateIso) {
            continue;
          }
          const detailHref = resolveDetailHref(anchor);
          const externalId = detailHref?.match(/(\d{6,})/)?.[1] ?? `${homeData.team}__${awayData.team}__${league}`;

          fallbackResults.push({
            externalId,
            league,
            homeTeam: homeData.team,
            awayTeam: awayData.team,
            eventDateIso,
            detailPath: detailHref,
            home: homeData.odd,
            draw: drawMatch[1] ?? '',
            away: awayData.odd,
            isLive: false,
          });
        }

        if (fallbackResults.length > 0) {
          return fallbackResults;
        }

        const buttonRows = Array.from(document.querySelectorAll('button'))
          .map((button) => {
            const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            const rect = button.getBoundingClientRect();
            return {
              text,
              top: Math.round(rect.top),
              left: Math.round(rect.left),
            };
          })
          .filter(({ text }) => text.length > 0 && /\d+(?:[.,]\d+)?$/.test(text));

        const groupedRows: Array<Array<{ text: string; top: number; left: number }>> = [];
        for (const button of buttonRows.sort((left, right) => left.top - right.top || left.left - right.left)) {
          const currentGroup = groupedRows[groupedRows.length - 1];
          if (!currentGroup || Math.abs(currentGroup[0].top - button.top) > 10) {
            groupedRows.push([button]);
            continue;
          }
          currentGroup.push(button);
        }

        const textNodes = Array.from(document.querySelectorAll('a, span, div, p, time'))
          .map((element) => {
            const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            const rect = element.getBoundingClientRect();
            return {
              text,
              top: Math.round(rect.top),
              left: Math.round(rect.left),
            };
          })
          .filter(({ text }) => text.length > 0);

        for (const row of groupedRows) {
          if (row.length < 3) {
            continue;
          }

          const sortedRow = [...row].sort((left, right) => left.left - right.left);
          const drawButton = sortedRow.find(({ text }) => text.toLowerCase().includes('empate'));
          if (!drawButton) {
            continue;
          }

          const firstButton = sortedRow[0];
          const lastButton = sortedRow[sortedRow.length - 1];
          const homeData = parseTeamAndOdd(firstButton.text);
          const awayData = parseTeamAndOdd(lastButton.text);
          const drawMatch = drawButton.text.match(/Empate\s+(\d+(?:[.,]\d+)?)/i);

          if (!homeData || !awayData || !drawMatch) {
            continue;
          }

          const league = textNodes
            .filter(({ top, text }) => {
              if (!(top < firstButton.top && firstButton.top - top <= 120)) {
                return false;
              }

              if (text.length > 120) {
                return false;
              }

              if (text.includes('Empate')) {
                return false;
              }

              return true;
            })
            .map(({ text }) => text)
            .find((candidate) =>
              candidate.includes('Jornada')
              || candidate.includes('Liga')
              || candidate.includes('League')
              || candidate.includes('MLS')
              || candidate.includes('Primera')
              || candidate.includes('National')
              || candidate.includes('Conference'),
            ) ?? 'Futebol';

          const nearbyDateContext = textNodes
            .filter(({ top, text }) => {
              if (!(Math.abs(top - firstButton.top) <= 120 || (top < firstButton.top && firstButton.top - top <= 180))) {
                return false;
              }

              return /\b(?:\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|hoje|amanh[ãa])\b/i.test(text);
            })
            .map(({ text }) => text)
            .join(' ');
          const eventDateIso = parseBetclicEventDate(undefined, nearbyDateContext);
          if (!eventDateIso) {
            continue;
          }

          fallbackResults.push({
            externalId: `${homeData.team}__${awayData.team}__${league}`,
            league,
            homeTeam: homeData.team,
            awayTeam: awayData.team,
            eventDateIso,
            home: homeData.odd,
            draw: drawMatch[1] ?? '',
            away: awayData.odd,
            isLive: false,
          });
        }

        if (fallbackResults.length > 0) {
          return fallbackResults;
        }

        const bodyText = document.body?.innerText ?? '';
        const lines = bodyText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        const oddsLinePattern = /^(.*?)\s+(\d+(?:[.,]\d+)?)\s+Empate\s+(\d+(?:[.,]\d+)?)\s+(.*?)\s+(\d+(?:[.,]\d+)?)$/i;

        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? '';
          const match = line.match(oddsLinePattern);
          if (!match) {
            continue;
          }

          const homeTeam = match[1]?.trim() ?? '';
          const home = match[2]?.trim() ?? '';
          const draw = match[3]?.trim() ?? '';
          const awayTeam = match[4]?.trim() ?? '';
          const away = match[5]?.trim() ?? '';

          if (!homeTeam || !awayTeam || !home || !draw || !away) {
            continue;
          }

          const recentContext = lines.slice(Math.max(0, index - 5), index);
          const league = recentContext.find((candidate) =>
            candidate.includes('Jornada')
            || candidate.includes('Liga')
            || candidate.includes('League')
            || candidate.includes('MLS')
            || candidate.includes('Primera')
            || candidate.includes('National')
            || candidate.includes('Conference'),
          ) ?? 'Futebol';

          const eventDateIso = parseBetclicEventDate(undefined, recentContext.join(' '));
          if (!eventDateIso) {
            continue;
          }
          fallbackResults.push({
            externalId: `${homeTeam}__${awayTeam}__${league}`,
            league,
            homeTeam,
            awayTeam,
            eventDateIso,
            home,
            draw,
            away,
            isLive: false,
          });
        }

        return fallbackResults;
      };

      // Try in-order from most to least specific
      const itemSelectors = [
        'a.cardEvent[href*="/futebol-"]',
        'sport-event-listitem',
        '[class*="event_item"]',
        '[data-type="sport-event"]',
      ];

      let items: Element[] = [];
      for (const sel of itemSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          items = Array.from(found);
          break;
        }
      }

      if (items.length === 0) {
        return parseTextFallback();
      }

      const getLeague = (el: Element): string => {
        // Walk up to find the competition group header
        let node: Element | null = el;
        while (node) {
          const title =
            node.querySelector('[class*="competition_title"], [class*="competition-name"]') ??
            (node.matches('[class*="competition"]') ? node : null);
          if (title) return title.textContent?.trim() ?? 'Futebol';
          node = node.parentElement;
        }
        return 'Futebol';
      };

      items.forEach((item) => {
        try {
          // ── Teams ──────────────────────────────────────────────────────────
          const teamEls = item.querySelectorAll(
            '[class*="scoreboard_team"], [class*="team_name"], [class*="competitor-name"]',
          );
          if (teamEls.length < 2) return;

          const homeTeam = teamEls[0]?.textContent?.trim() ?? '';
          const awayTeam = teamEls[1]?.textContent?.trim() ?? '';
          if (!homeTeam || !awayTeam) return;

          // ── Date ───────────────────────────────────────────────────────────
          const timeEl = item.querySelector('time[datetime]');
          const dateAttr = timeEl?.getAttribute('datetime');
          const dateTxt = item.querySelector(
            '[class*="startDate"], [class*="eventDate"], [class*="date"]',
          )?.textContent?.trim();
          const eventDateIso = parseBetclicEventDate(dateAttr, dateTxt ?? timeEl?.textContent ?? item.textContent ?? '');
          if (!eventDateIso) {
            return;
          }

          // ── League ─────────────────────────────────────────────────────────
          const league = getLeague(item);

          // ── 1X2 Odds ──────────────────────────────────────────────────────
          // Betclic renders odds in `oddbutton` custom elements (or fallback spans)
          const oddEls = item.querySelectorAll(
            'oddbutton, [class*="oddValue"], [class*="odd_value"], [class*="bet-btn"]',
          );
          // First three are typically home / draw / away for 1X2
          const home = oddEls[0]?.textContent?.trim() ?? '';
          const draw = oddEls[1]?.textContent?.trim() ?? '';
          const away = oddEls[2]?.textContent?.trim() ?? '';

          if (!home || !draw || !away) return; // Skip events without visible odds

          const detailHref = resolveDetailHref(item);

          // ── Live detection ────────────────────────────────────────────────
          // Data-attribute check covers sites that annotate live status in HTML.
          // Child-text check covers Betclic: live event cards contain a minute
          // counter ("41'", "90+3'") or fixed strings ("Início", "Intervalo")
          // as visible text within DESCENDANT elements only (item.querySelectorAll
          // is scoped to the card, so ancestor nav text "Ao Vivo" is excluded).
          const hasLiveAttr =
            item.querySelector(
              '[data-live="true"], [data-status="live"], [data-status="LIVE"], [data-status="inprogress"], ' +
              '[data-match-status="live"], [data-match-status="LIVE"], ' +
              '[class*="inplay"], [class*="InPlay"], [class*="in-play"], ' +
              '[class*="live-score"], [class*="livescore"], [class*="live-time"], ' +
              '[class*="live-clock"], [class*="live-indicator"], [class*="match-live"]'
            ) !== null;

          // Check for in-play time indicators rendered inside the event card.
          // These only appear in live event rows: "41'", "90+5'", "Início", "Intervalo".
          const hasLiveChildText = Array.from(item.querySelectorAll('*')).some((el) => {
            const txt = ((el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? '').trim();
            return (
              /^\d+['']\s*(?:\+\s*\d+['']\s*)?$/.test(txt) ||   // "41'", "90+3'"
              /^(Início|Intervalo|HT|Intervalo\s+\d+)$/i.test(txt)
            );
          });

          const isLive = hasLiveAttr || hasLiveChildText;

          // ── External ID ───────────────────────────────────────────────────
          const externalId =
            (detailHref ? (detailHref.match(/(\d{6,})/)?.[1] ?? detailHref) : null) ??
            item.getAttribute('data-id') ??
            item.getAttribute('id') ??
            item.getAttribute('data-event-id') ??
            `${homeTeam}__${awayTeam}__${eventDateIso}`;

          results.push({
            externalId,
            league,
            homeTeam,
            awayTeam,
            eventDateIso,
            detailPath: detailHref,
            home,
            draw,
            away,
            isLive,
          });
        } catch {
          // Skip malformed rows — never throw inside evaluate()
        }
      });

      if (results.length === 0) {
        return parseTextFallback();
      }

      return results;
    });
  }

  // ─── Data parsing ───────────────────────────────────────────────────────────

  private parseRawEvents(raw: RawEventData[]): ScrapedEvent[] {
    const events: ScrapedEvent[] = [];

    for (const r of raw) {
      try {
        const homeOdds = parseOdds(r.home);
        const drawOdds = parseOdds(r.draw);
        const awayOdds = parseOdds(r.away);

        // Skip rows where the odds did not parse to valid numbers
        if ([homeOdds, drawOdds, awayOdds].some((v) => !Number.isFinite(v) || v < 1.01)) {
          continue;
        }

        const markets: ScrapedMarket[] = [
          {
            market: '1X2',
            selections: [
              { selection: '1', value: homeOdds },
              { selection: 'X', value: drawOdds },
              { selection: '2', value: awayOdds },
            ],
          },
        ];

        for (const detailMarket of r.detailMarkets ?? []) {
          const existingIndex = markets.findIndex((market) => market.market === detailMarket.market);
          if (existingIndex >= 0) {
            markets[existingIndex] = detailMarket;
          } else {
            markets.push(detailMarket);
          }
        }

        events.push({
          externalId: extractEventIdFromPath(r.detailPath ?? '') ?? r.externalId,
          sport: Sport.FOOTBALL,
          league: r.league || 'Futebol',
          homeTeam: r.homeTeam,
          awayTeam: r.awayTeam,
          eventDate: new Date(r.eventDateIso),
          markets,
          isLive: r.isLive,
        });
      } catch (err) {
        logger.debug('BetclicScraper: failed to parse raw event', {
          event: `${r.homeTeam} vs ${r.awayTeam}`,
          error: err instanceof Error ? err.message : JSON.stringify(err),
        });
      }
    }

    return events;
  }
}
