import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import { isChallenge, parseCalendarHtml, parseEventPage, parseOdds, parseTabsContents } from './html';

const FIX = path.join(__dirname, '..', '..', '__fixtures__', 'retabet');
const text = (name: string) => fs.readFileSync(path.join(FIX, name), 'utf8');

test('parseOdds: decimal comma, whole numbers and junk', () => {
  assert.equal(parseOdds('5,20'), 5.2);
  assert.equal(parseOdds(' 121,00 '), 121);
  assert.equal(parseOdds('1.64'), 1.64);
  assert.equal(parseOdds(''), null);
  assert.equal(parseOdds('-'), null);
  assert.equal(parseOdds('abc'), null);
  assert.equal(parseOdds(undefined), null);
});

test('football event page: names, tab list and the "Principais" markets with their rows', () => {
  const page = parseEventPage(text('event-football.html'));
  assert.equal(page.home, 'Newcastle');
  assert.equal(page.away, 'Arsenal');
  assert.equal(page.sport, 'FOOTBALL');
  assert.deepEqual(page.tabs.slice(0, 4), [
    { tag: 1026, tab: 1, name: 'Principais' },
    { tag: 1674, tab: 1, name: 'Suplente Estrela' },
    { tag: 1024, tab: 1, name: 'Jogo' },
    { tag: 1017, tab: 1, name: 'Golos' },
  ]);
  assert.ok(page.tabs.some((t) => t.tag === 1607 && t.name === 'Estatísticas equipas'), 'HTML entities in tab names are decoded');
  assert.equal(page.markets.length, 24);
  const x12 = page.markets[0]!;
  assert.equal(x12.name, '1-X-2');
  assert.equal(x12.mid, '1561982279');
  assert.equal(x12.tag, 1026);
  assert.deepEqual(x12.rows, [
    {
      title: '',
      options: [
        { id: '4906323534', label: '1', odds: 5.2, suspended: false },
        { id: '4906323535', label: 'X', odds: 4.05, suspended: false },
        { id: '4906323536', label: '2', odds: 1.47, suspended: false },
      ],
    },
  ]);
  const totals = page.markets.find((m) => m.name === 'Mais/menos golos')!;
  assert.equal(totals.rows.length, 11, 'one row (ul) per line');
  assert.deepEqual(
    totals.rows[4]!.options.map((o) => [o.label, o.odds]),
    [['+ de 2,5', 1.56], ['- de 2,5', 2.06]],
  );
});

test('tennis event page has no players block: names come from the title', () => {
  const page = parseEventPage(text('event-tennis.html'));
  assert.equal(page.sport, 'TENNIS');
  assert.equal(page.home, 'Soonwoo Kwon');
  assert.equal(page.away, 'Sascha Gueymard Wayenburg');
  assert.equal(page.markets[0]!.name, 'Vencedor do encontro');
});

test('basketball event page', () => {
  const page = parseEventPage(text('event-basketball.html'));
  assert.equal(page.sport, 'BASKETBALL');
  assert.deepEqual([page.home, page.away], ['Denver Nuggets', 'Houston Rockets']);
  // a sport outside the comparator is reported as null, not guessed
  assert.equal(parseEventPage(text('event-basketball.html').split('/desportos/basquetebol/').join('/desportos/andebol/')).sport, null);
  assert.ok(page.tabs.some((t) => t.tag === 1049 && t.name === 'Equipas'));
});

test('GetTabsContents: several tabs in one body, each market tagged with its tab', () => {
  const markets = parseTabsContents(text('tabs-football.html'));
  assert.deepEqual([...new Set(markets.map((m) => m.tag))], [1024, 1017, 1475, 1049]);
  const exact = markets.find((m) => m.name === 'Resultado exato')!;
  assert.equal(exact.tag, 1024);
  assert.deepEqual(
    exact.rows[0]!.options.map((o) => [o.label, o.odds]),
    [['1-0', 13], ['0-0', 12], ['0-1', 7.05]],
  );
  assert.ok(markets.some((m) => m.name === '1ªparte: 1-X-2' && m.tag === 1475));
});

test('table-style markets: row titles come from the line, option labels from the column header', () => {
  const basket = parseTabsContents(text('tabs-basketball.html'));
  const quarters = basket.find((m) => m.name === 'Vencedor quartos')!;
  assert.equal(quarters.rows.length, 4);
  assert.equal(quarters.rows[0]!.title, '1º quarto: vencedor');
  assert.deepEqual(
    quarters.rows[0]!.options.map((o) => [o.label, o.odds]),
    [['Denver Nuggets', 1.78], ['Houston Rockets', 1.69]],
  );
  const sets = parseTabsContents(text('tabs-tennis.html')).find((m) => m.name === 'Vencedor set')!;
  assert.deepEqual(
    sets.rows.map((r) => [r.title, r.options.map((o) => o.label)]),
    [['Set 1: vencedor', ['Soonwoo Kwon', 'Sascha Gueymard Wayenburg']], ['Set 2: vencedor', ['Soonwoo Kwon', 'Sascha Gueymard Wayenburg']]],
  );
  const handicap = basket.find((m) => m.name === 'Handicap quartos')!;
  assert.equal(handicap.rows[5]!.title, '2º quarto: handicap');
  assert.equal(handicap.rows[5]!.options[0]!.label, 'Denver Nuggets (+0,5)');
  // A market whose options are all odd-only without a header keeps empty labels instead of failing.
  const grid = parseTabsContents(text('tabs-football.html')).find((m) => m.name === 'Parte com mais golos')!;
  assert.deepEqual(grid.rows[0]!.options.map((o) => o.label), ['1ª parte', 'Mesmo número de golos', '2ª parte']);
  assert.equal(grid.rows[0]!.title, 'Parte com mais golos');
});

const wrap = (inner: string) => `<div class="jbcont detail__bets-wrapper" data-tb="1" data-tg="1026">${inner}</div>`;
const market = (name: string, options: string) =>
  `<div class="bets__group"><div class="bets__wrapper jbet" data-mid="7"><span class="bets__tit"><span class="mt" data-mid="7" data-fmkn="${name}">${name}</span></span><ul class="bets__option-list">${options}</ul></div></div>`;
const option = (id: number, label: string, odds: string, lock = 'none') =>
  `<li class="jopc jo opcion betbox" data-i="${id}"><span class="jqt betbox__option">${label}</span><span class="betbox__odd"><i class="jil ico-s icon-lock ${lock}"></i><span class="jpr">${odds}</span></span></li>`;

test('a visible lock icon marks the option as suspended; an option without an odd is kept as null odds', () => {
  // The lock icon carries the class "none" while the option is open.
  const markets = parseTabsContents(wrap(market('1-X-2', option(1, '1', '2,00') + option(2, 'X', '3,00', '') + option(3, '2', ''))));
  const o = markets[0]!.rows[0]!.options;
  assert.deepEqual(
    o.map((x) => [x.suspended, x.odds]),
    [[false, 2], [true, 3], [false, null]],
  );
});

test('structure that is not there (class change, anti-bot page, empty body) is a ProviderFormatError, never an empty list', () => {
  assert.throws(() => parseTabsContents('<html><body>Access Denied</body></html>'), ProviderFormatError);
  assert.throws(() => parseTabsContents(''), ProviderFormatError);
  assert.throws(() => parseTabsContents(text('tabs-football.html').replace(/bets__wrapper/g, 'renamed__wrapper').replace(/jbcont/g, 'other')), ProviderFormatError);
  // Container kept but the wrappers renamed: markets would silently vanish.
  assert.throws(() => parseTabsContents(text('tabs-football.html').replace(/bets__wrapper/g, 'renamed__wrapper')), ProviderFormatError);
  // wrapper present but the odd / label classes renamed
  assert.throws(() => parseTabsContents(text('tabs-tennis.html').replace(/jpr/g, 'price')), ProviderFormatError);
  assert.throws(() => parseTabsContents(text('tabs-tennis.html').replace(/jqt/g, 'name')), ProviderFormatError);
  assert.throws(() => parseTabsContents(text('tabs-tennis.html').replace(/data-fmkn/g, 'data-x')), ProviderFormatError);
  assert.throws(() => parseTabsContents(text('tabs-tennis.html').replace(/jopc/g, 'optx')), ProviderFormatError);
  assert.throws(() => parseEventPage(text('event-football.html').replace(/data-tg=/g, 'data-x=')), ProviderFormatError);
  assert.throws(() => parseEventPage(text('event-football.html').replace(/<h1>[^<]*<\/h1>/, '').replace(/players-(left|right)__player/g, 'x')), ProviderFormatError);
  assert.throws(() => parseEventPage('<html>Request unsuccessful</html>'), ProviderFormatError);
});

test('a tab with no markets is a legitimate empty list', () => {
  assert.deepEqual(parseTabsContents(wrap('')), []);
});

test('calendar page: the events come from the widget JSON in data-cp', () => {
  const events = parseCalendarHtml(text('calendar.html'));
  assert.equal(events.length, 6);
  assert.equal(events[1]!.d, 'FC Juarez - Atlas FC');
  assert.throws(() => parseCalendarHtml('<html><body>nothing</body></html>'), ProviderFormatError);
  assert.throws(() => parseCalendarHtml(text('calendar.html').replace('SportsbookDateIndex', 'Renamed')), ProviderFormatError);
  assert.throws(() => parseCalendarHtml(text('calendar.html').replace(/"e":\[/, '"x":[')), ProviderFormatError);
  assert.equal(parseCalendarHtml(text('league.html')).length, 4);
  assert.equal(parseCalendarHtml(text('tennis-page.html')).length, 4);
});

test('isChallenge: anti-bot / WAF markers in a short HTML page, never in a real page', () => {
  assert.equal(isChallenge("<html><head><title>Access Denied</title></head><body>You don't have permission. Reference #18.abc</body></html>"), true);
  assert.equal(isChallenge('<html><body><div id="px-captcha"></div> captcha</body></html>'), true);
  assert.equal(isChallenge('<html><body>Request unsuccessful. Incapsula incident ID: 1</body></html>'), true);
  assert.equal(isChallenge(text('event-football.html')), false);
  assert.equal(isChallenge(text('calendar.html')), false);
  assert.equal(isChallenge(''), false);
});
