/**
 * Retabet HTML readers (ASP.NET Core + React SSR front end; no JSON API for the markets of a game).
 *
 * - Event page / `GetTabsContents` fragments: tabs are `div.jbcont[data-tg]`; a market is `div.bets__wrapper`
 *   with its name in `span.mt[data-fmkn]`; lines are the `ul.bets__option-list` rows of the same wrapper; an
 *   option is `li.jopc[data-i]` with `span.jqt` (label) and `span.jpr` (odd, decimal comma). A visible lock
 *   icon (`i.jil` without the `none` class) means the option is closed. Table-style markets (quarters, sets,
 *   "yes/no" grids) have a header `ul.bets__option-list-op` with the column labels, a row title `li` (without
 *   `jopc`) per line, and options that carry only the odd (`betbox--cuota`): their label is the column header.
 * - Calendar pages: the React widget `...SportsbookDateIndex` carries its data as JSON in `data-cp`.
 *
 * Every reader throws `ProviderFormatError` when the structure it relies on is missing (a class rename or an
 * anti-bot page must never look like "no markets"). No I/O here.
 */
import * as cheerio from 'cheerio';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { OddsSport } from '../../types';

/** One selectable option of a market. */
export interface PageOption {
  id: string;
  label: string;
  /** Decimal odds, null when the option shows no price. */
  odds: number | null;
  suspended: boolean;
}

/** A line (`ul`) of a market: an optional row title ("1º quarto: handicap") and its selections. */
export interface PageRow {
  title: string;
  options: PageOption[];
}

/** A market (`div.bets__wrapper`): rows are the lines (`ul`s) of the market. */
export interface PageMarket {
  mid: string;
  tag: number;
  name: string;
  rows: PageRow[];
}

/** A tab of an event page. */
export interface PageTab {
  tag: number;
  tab: number;
  name: string;
}

/** An event page: participants, tab list and the markets of the tab(s) the page itself carries ("Principais"). */
export interface EventPage {
  /** Comparator sport of the page (from the breadcrumb), null for any other sport. */
  sport: OddsSport | null;
  home: string;
  away: string;
  tabs: PageTab[];
  markets: PageMarket[];
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** "5,20" → 5.2; anything that is not a decimal number → null. */
export function parseOdds(raw: string | undefined): number | null {
  const s = clean(raw).replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Words of the WAF / anti-bot pages (Akamai, Incapsula, Cloudflare, PerimeterX...) in a small HTML answer. */
const CHALLENGE = /captcha|access denied|request unsuccessful|incapsula|reference #|pardon our interruption|attention required|just a moment|checking your browser/i;

/** True for a short HTML page that looks like an anti-bot / WAF block instead of Retabet content. */
export function isChallenge(html: string): boolean {
  return html.length < 30_000 && !/jbcont|SportsbookDateIndex/.test(html) && CHALLENGE.test(html);
}

/** The markets of every `div.jbcont[data-tg]` of a document (page or tab fragment). */
function readMarkets($: cheerio.CheerioAPI, what: string): PageMarket[] {
  const containers = $('div.jbcont[data-tg]');
  if (containers.length === 0) throw new ProviderFormatError(`Retabet ${what}: no tab container (div.jbcont[data-tg])`);
  const out: PageMarket[] = [];
  containers.each((_, container) => {
    const c = $(container);
    const tag = Number(c.attr('data-tg'));
    if (!Number.isInteger(tag)) throw new ProviderFormatError(`Retabet ${what}: tab container with a bad data-tg`);
    const wrappers = c.find('div.bets__wrapper');
    // An empty tab is legitimate; a tab with content but no market wrapper is a changed front end.
    if (wrappers.length === 0 && clean(c.text()) !== '') throw new ProviderFormatError(`Retabet ${what}: tab ${tag} has content but no div.bets__wrapper`);
    wrappers.each((__, wrapper) => {
      const w = $(wrapper);
      const mt = w.find('span.mt').first();
      const name = clean(mt.attr('data-fmkn'));
      if (!name) throw new ProviderFormatError(`Retabet ${what}: market without span.mt[data-fmkn]`);
      const rows: PageRow[] = [];
      // Column labels of a table-style market (header ul), blank first cell excluded.
      const columns = w
        .find('ul.bets__option-list-op li.jqt')
        .map((___, li) => clean($(li).text()))
        .get();
      w.find('ul.bets__option-list').each((___, ul) => {
        if ($(ul).hasClass('bets__option-list-op')) return;
        const options: PageOption[] = [];
        const title = clean($(ul).children('li').not('.jopc').first().text());
        $(ul)
          .find('li.jopc')
          .each((column, li) => {
            const o = $(li);
            const label = o.find('span.jqt').first();
            const price = o.find('span.jpr').first();
            if (price.length === 0) throw new ProviderFormatError(`Retabet ${what}: option of "${name}" without span.jpr`);
            if (label.length === 0 && !o.hasClass('betbox--cuota')) throw new ProviderFormatError(`Retabet ${what}: option of "${name}" without span.jqt`);
            const lock = o.find('i.jil').first();
            options.push({
              id: clean(o.attr('data-i')),
              label: label.length ? clean(label.text()) : (columns[column] ?? ''),
              odds: parseOdds(price.text()),
              suspended: lock.length > 0 && !lock.hasClass('none'),
            });
          });
        if (options.length > 0) rows.push({ title, options });
      });
      if (rows.length === 0) throw new ProviderFormatError(`Retabet ${what}: market "${name}" without options (li.jopc)`);
      out.push({ mid: clean(w.attr('data-mid')) || clean(mt.attr('data-mid')), tag, name, rows });
    });
  });
  return out;
}

/** The HTML of `POST /api/sportsbookEventDetail/GetTabsContents` (several tabs in one body) → markets tagged by tab. */
export function parseTabsContents(html: string): PageMarket[] {
  return readMarkets(cheerio.load(html), 'tab content');
}

const SPORT_OF_SLUG: Record<string, OddsSport> = { futebol: 'FOOTBALL', basquetebol: 'BASKETBALL', tenis: 'TENNIS' };

/** An event page (`/desportos/.../{eventId}`): participants, tab list and the "Principais" markets. */
export function parseEventPage(html: string): EventPage {
  const $ = cheerio.load(html);
  const tabs: PageTab[] = [];
  $('span.jtab[data-tg]').each((_, el) => {
    const tag = Number($(el).attr('data-tg'));
    const tab = Number($(el).attr('data-tb'));
    if (Number.isInteger(tag) && Number.isInteger(tab)) tabs.push({ tag, tab, name: clean($(el).attr('data-t')) });
  });
  if (tabs.length === 0) throw new ProviderFormatError('Retabet event page: no tab list (span.jtab[data-tg])');
  let home = clean($('.players-left__player').first().text());
  let away = clean($('.players-right__player').first().text());
  if (!home || !away) {
    // Tennis pages have no players block: the title is "Home - Away".
    const parts = clean($('h1').first().text()).split(' - ');
    if (parts.length === 2 && parts[0] && parts[1]) [home, away] = [parts[0].trim(), parts[1].trim()];
  }
  if (!home || !away) throw new ProviderFormatError('Retabet event page: participants not found');
  const slug = $('ul.breadcrumbs__ul a[href]').first().attr('href')?.match(/^\/desportos\/([a-z-]+)\//)?.[1];
  const sport = slug ? (SPORT_OF_SLUG[slug] ?? null) : null;
  return { sport, home, away, tabs, markets: readMarkets($, 'event page') };
}

/** Event of a calendar widget (minified field names; see `map.ts`). Untyped external data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawEvent = Record<string, any>;

/** The events of a calendar-like page (`/calendario`, a sport page, a league page): the widget's `data-cp` JSON. */
export function parseCalendarHtml(html: string): RawEvent[] {
  const $ = cheerio.load(html);
  const widget = $('[data-cn]')
    .filter((_, el) => /SportsbookDateIndex$/.test($(el).attr('data-cn') ?? ''))
    .first();
  const raw = widget.attr('data-cp');
  if (!raw) throw new ProviderFormatError('Retabet calendar: widget SportsbookDateIndex (data-cp) not found');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProviderFormatError('Retabet calendar: data-cp is not JSON');
  }
  const events = (data as { initialData?: { e?: unknown } } | null)?.initialData?.e;
  if (!Array.isArray(events)) throw new ProviderFormatError('Retabet calendar: no initialData.e list');
  return events as RawEvent[];
}
