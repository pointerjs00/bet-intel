import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapEspnSummary } from '../sportsData/espnFootball';
import { mapEspnNbaSummary } from '../sportsData/espnBasketball';
import { mapEspnTennisScoreboard } from '../sportsData/espnTennis';
import { basketballCandidate, eventKey, footballCandidate, matchEvent, matchLinked, namesMatch, tennisCandidate, type Candidate } from './matcher';
import type { SourceEvent } from './types';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, '../sportsData/__fixtures__', name), 'utf8'));

const brighton = footballCandidate(mapEspnSummary(fx('espn-soccer-summary.json'))!, 'eng.1');
const alverca = footballCandidate(mapEspnSummary(fx('espn-summary-alverca-casapia.json'))!, 'por.1');
const lakers = basketballCandidate(mapEspnNbaSummary(fx('espn-nba-summary.json'), '401')!);

const ev = (o: Partial<SourceEvent>): SourceEvent => ({
  house: 'betclic', houseEventId: '1', sport: 'FOOTBALL', competition: 'x', home: '', away: '', startsAt: '', live: false, ...o,
});
const at = (c: Candidate, minutes: number) => new Date(Date.parse(c.startsAt) + minutes * 60_000).toISOString();

test('fixtures give usable candidates', () => {
  assert.equal(brighton.home, 'Brighton & Hove Albion');
  assert.equal(alverca.home, 'Alverca');
  assert.equal(lakers.sport, 'BASKETBALL');
});

test('matches by name with aliases and exact kickoff', () => {
  const m = matchEvent(ev({ home: 'Alverca', away: 'Casa Pia AC', startsAt: alverca.startsAt }), [brighton, alverca]);
  assert.equal(m?.providerMatchId, alverca.providerMatchId);
  const b = matchEvent(ev({ home: 'Brighton', away: 'Brentford', startsAt: at(brighton, 20) }), [brighton, alverca]);
  assert.equal(b?.providerMatchId, brighton.providerMatchId);
});

test('PT/EN national team and Sporting CP / Sporting', () => {
  const spain: Candidate = { providerMatchId: '9', league: 'fifa.friendly', sport: 'FOOTBALL', home: 'Spain', away: 'Portugal', startsAt: '2026-11-16T20:00:00Z' };
  assert.equal(matchEvent(ev({ home: 'Espanha', away: 'Portugal', startsAt: spain.startsAt }), [spain])?.providerMatchId, '9');
  const spo: Candidate = { providerMatchId: '7', league: 'por.1', sport: 'FOOTBALL', home: 'Sporting', away: 'Benfica', startsAt: '2026-11-16T20:00:00Z' };
  assert.equal(matchEvent(ev({ home: 'Sporting CP', away: 'SL Benfica', startsAt: spo.startsAt }), [spo])?.providerMatchId, '7');
});

test('outside the 30 min window gives null; the boundary is inside', () => {
  const e = (min: number) => ev({ home: 'Alverca', away: 'Casa Pia', startsAt: at(alverca, min) });
  assert.equal(matchEvent(e(31), [alverca]), null);
  assert.equal(matchEvent(e(-31), [alverca]), null);
  assert.ok(matchEvent(e(30), [alverca]));
});

test('different sport or swapped sides in football give null', () => {
  assert.equal(matchEvent(ev({ sport: 'BASKETBALL', home: 'Alverca', away: 'Casa Pia', startsAt: alverca.startsAt }), [alverca]), null);
  assert.equal(matchEvent(ev({ home: 'Casa Pia', away: 'Alverca', startsAt: alverca.startsAt }), [alverca]), null);
});

test('several candidates: closest wins; equal distance is ambiguous', () => {
  const a = { ...alverca, providerMatchId: 'a', startsAt: at(alverca, -10) };
  const b = { ...alverca, providerMatchId: 'b', startsAt: at(alverca, 5) };
  const e = ev({ home: 'Alverca', away: 'Casa Pia', startsAt: alverca.startsAt });
  assert.equal(matchEvent(e, [a, b])?.providerMatchId, 'b');
  const c = { ...alverca, providerMatchId: 'c', startsAt: at(alverca, 10) };
  assert.equal(matchEvent(e, [a, c]), null);
});

test('NBA match', () => {
  const m = matchEvent(ev({ sport: 'BASKETBALL', home: 'Atlanta Hawks', away: 'Los Angeles Lakers', startsAt: lakers.startsAt }), [lakers]);
  assert.equal(m?.providerMatchId, lakers.providerMatchId);
});

test('tennis accepts swapped order, football does not', () => {
  const json = {
    events: [{ id: '1', name: 'Helsinki', groupings: [{ grouping: { displayName: "Men's Singles" }, competitions: [{
      id: '555', date: '2026-11-16T10:00Z', status: { type: { name: 'STATUS_SCHEDULED', state: 'pre' } },
      competitors: [
        { homeAway: 'home', athlete: { displayName: 'Toby Samuel' } },
        { homeAway: 'away', athlete: { displayName: 'Ilya Ivashka' } },
      ],
    }] }, { grouping: { displayName: "Men's Doubles" }, competitions: [{
      id: '556', date: '2026-11-16T10:00Z', competitors: [{ homeAway: 'home', roster: { athletes: [{ displayName: 'A B' }] } }, { homeAway: 'away', roster: { athletes: [{ displayName: 'C D' }] } }],
    }] }] }],
  };
  const cands = mapEspnTennisScoreboard(json, 'atp').map(tennisCandidate).filter((c): c is Candidate => c !== null);
  assert.equal(cands.length, 1);
  const e = ev({ sport: 'TENNIS', home: 'Ilya Ivashka', away: 'Toby Samuel', startsAt: '2026-11-16T10:10:00Z' });
  assert.equal(matchEvent(e, cands)?.providerMatchId, '555');
});

test('eventKey formats', () => {
  const e = ev({ home: 'Leixões', away: 'GD Chaves', startsAt: '2026-11-15T18:30:00Z' });
  assert.equal(eventKey(e, alverca), `espn:FOOTBALL:${alverca.providerMatchId}`);
  assert.equal(eventKey({ ...e, extraIds: { betRadarId: '123' } }, null), 'bet:FOOTBALL:123');
  assert.match(eventKey(e, null)!, /^n:FOOTBALL:2026-11-15:[^:]+:[^:]+$/);
  assert.equal(eventKey(e, null), eventKey({ ...e, home: 'Leixoes', startsAt: '2026-11-15T18:55:00Z' }, null));
});

test('eventKey fallback is date-level; tennis ignores player order; invalid date gives null', () => {
  const e = ev({ home: 'Leixões', away: 'GD Chaves', startsAt: '2026-11-15T19:59:00Z' });
  assert.equal(eventKey(e, null), eventKey({ ...e, startsAt: '2026-11-15T20:00:00Z' }, null));
  assert.notEqual(eventKey(e, null), eventKey({ ...e, startsAt: '2026-11-16T19:59:00Z' }, null));
  const t = ev({ sport: 'TENNIS', home: 'Ilya Ivashka', away: 'Toby Samuel', startsAt: '2026-11-16T10:00:00Z' });
  assert.equal(eventKey(t, null), eventKey({ ...t, home: t.away, away: t.home }, null));
  assert.equal(eventKey({ ...e, startsAt: 'nope' }, null), null);
});

test('variants and other clubs never match', () => {
  const pairs: Array<[string, string]> = [
    ['Benfica', 'Benfica B'], ['Benfica', 'Benfica U23'], ['Porto', 'Porto B'], ['Barcelona', 'Barcelona B'],
    ['Arsenal', 'Arsenal Women'], ['Real Madrid', 'Real Madrid Castilla'], ['Inter', 'Inter Miami'], ['Sporting CP', 'Sporting Braga'],
    ['Sporting', 'Sporting Braga'], ['Benfica Sub-19', 'Benfica'],
  ];
  for (const [x, y] of pairs) {
    for (const [h, c] of [[x, y], [y, x]]) {
      const cand: Candidate = { providerMatchId: '1', league: null, sport: 'FOOTBALL', home: c!, away: 'Rival', startsAt: '2026-11-16T20:00:00Z' };
      assert.equal(matchEvent(ev({ home: h!, away: 'Rival', startsAt: cand.startsAt }), [cand]), null, `${h} vs ${c}`);
    }
  }
});

test('legitimate aliases still match', () => {
  const pairs: Array<[string, string]> = [['Sporting CP', 'Sporting'], ['SL Benfica', 'Benfica'], ['Spain', 'Espanha'], ['FC Porto', 'Porto'], ['Brighton', 'Brighton & Hove Albion']];
  for (const [x, y] of pairs) {
    const cand: Candidate = { providerMatchId: '1', league: null, sport: 'FOOTBALL', home: y, away: 'Rival', startsAt: '2026-11-16T20:00:00Z' };
    assert.ok(matchEvent(ev({ home: x, away: 'Rival', startsAt: cand.startsAt }), [cand]), `${x} vs ${y}`);
  }
});

test('a dropped city/united/utd suffix matches when the other side matches cleanly', () => {
  const at = '2026-11-21T15:00:00Z';
  const cand = (home: string, away: string): Candidate => ({ providerMatchId: '1', league: null, sport: 'FOOTBALL', home, away, startsAt: at });
  assert.ok(matchEvent(ev({ home: 'Chelsea', away: 'Leeds', startsAt: at }), [cand('Chelsea', 'Leeds United')]));
  assert.ok(matchEvent(ev({ home: 'Coventry', away: 'Crystal Palace', startsAt: at }), [cand('Coventry City', 'Crystal Palace')]));
  assert.ok(matchEvent(ev({ home: 'Newcastle', away: 'Arsenal', startsAt: at }), [cand('Newcastle United', 'Arsenal')]));
  // Both sides only through a suffix: not enough.
  assert.equal(matchEvent(ev({ home: 'Leeds', away: 'Coventry', startsAt: at }), [cand('Leeds United', 'Coventry City')]), null);
  // Other club words stay hard conflicts even with a clean opponent.
  assert.equal(matchEvent(ev({ home: 'Inter', away: 'Arsenal', startsAt: at }), [cand('Inter Miami', 'Arsenal')]), null);
});

test('betRadarId 0 is not an id', () => {
  const e = ev({ home: 'A', away: 'B', startsAt: '2026-11-15T20:00:00Z', extraIds: { betRadarId: '0' } });
  assert.ok(eventKey(e, null)!.startsWith('n:'));
});

test('candidatesFor tolerates an invalid date', async () => {
  const { candidatesFor } = await import('./matcher');
  assert.deepEqual(await candidatesFor('FOOTBALL', 'nope'), []);
});

// ─── Task 8: names across houses ────────────────────────────────────────────

test('exonyms and nicknames join across houses', () => {
  const pairs: Array<[string, string]> = [
    ['Wolves', 'Wolverhampton Wanderers'], ['Spurs', 'Tottenham Hotspur'], ['Man Utd', 'Manchester United'],
    ['Man United', 'Manchester United'], ['Man City', 'Manchester City'],
    ['Sevilha', 'Sevilla'], ['Sevilha FC', 'Sevilla FC'], ['Bolonha', 'Bologna'], ['Veneza', 'Venezia'], ['Praga', 'Prague'],
    ['Sparta Praga', 'Sparta Prague'], ['Sparta Praha', 'Sparta Prague'], ['Augsburgo', 'Augsburg'], ['FC Colonia', 'FC Koln'],
    ['Colonia', 'Cologne'], ['Munique', 'Munchen'], ['Genova', 'Genoa'], ['Napoles', 'Napoli'], ['Napoli', 'Naples'],
  ];
  for (const [a, b] of pairs) assert.ok(namesMatch(a, b, 'FOOTBALL'), `${a} = ${b}`);
});

test('club nicknames are football only; city exonyms apply to every sport', () => {
  assert.equal(eventKey(ev({ sport: 'BASKETBALL', home: 'San Antonio Spurs', away: 'Utah Jazz', startsAt: '2026-11-16T01:00:00Z' }), null),
    'n:BASKETBALL:2026-11-16:san antonio spurs:utah jazz');
  assert.ok(namesMatch('Spurs', 'Tottenham Hotspur', 'FOOTBALL'));
  assert.ok(namesMatch('Sevilha', 'Sevilla', 'BASKETBALL'));
});

test('matchLinked: keys of one game collapse to the strongest; different games stay ambiguous', () => {
  const e = ev({ home: 'Gil Vicente', away: 'Casa Pia', startsAt: '2026-11-16T20:00:00Z' });
  const c = (id: string, home: string, away: string, min = 0): Candidate =>
    ({ providerMatchId: id, league: null, sport: 'FOOTBALL', home, away, startsAt: new Date(Date.parse(e.startsAt) + min * 60_000).toISOString() });
  const n = c('n:FOOTBALL:2026-11-16:gil vicente:casa pia ac', 'Gil Vicente FC', 'Casa Pia AC');
  assert.equal(matchLinked(e, [n, c('bet:FOOTBALL:555', 'Gil Vicente', 'Casa Pia')])?.providerMatchId, 'bet:FOOTBALL:555');
  assert.equal(matchLinked(e, [c('bet:FOOTBALL:555', 'Gil Vicente', 'Casa Pia', 10), n, c('espn:FOOTBALL:9', 'Gil Vicente', 'Casa Pia', 5)])?.providerMatchId, 'espn:FOOTBALL:9');
  // same rank: the key more houses share wins, then lexicographic
  const n2 = c('n:FOOTBALL:2026-11-16:gil vicente:casa pia', 'Gil Vicente', 'Casa Pia');
  assert.equal(matchLinked(e, [n, n2], new Map([[n2.providerMatchId, 2]]))?.providerMatchId, n2.providerMatchId);
  assert.equal(matchLinked(e, [n, n2])?.providerMatchId, n2.providerMatchId); // lexicographic
  // an event that matches two different games equally ("Manchester" vs City and United) stays ambiguous
  const m = ev({ home: 'Manchester', away: 'Rival', startsAt: e.startsAt });
  assert.equal(matchLinked(m, [c('bet:FOOTBALL:1', 'Manchester City', 'Rival'), c('bet:FOOTBALL:2', 'Manchester United', 'Rival')]), null);
});

test('exonyms do not join different clubs', () => {
  assert.ok(!namesMatch('Sevilha', 'Sevilla Reservas'));
  assert.ok(!namesMatch('Man Utd', 'Man City'));
  assert.ok(!namesMatch('Bolonha', 'Genoa'));
});

test('women markers unify across houses and never meet men', () => {
  const w = ['Liverpool F.', 'Liverpool (F)', 'Liverpool Women', 'Liverpool W', 'Liverpool Fem.', 'Liverpool Feminino', 'Liverpool (W)'];
  for (const a of w) for (const b of w) assert.ok(namesMatch(a, b), `${a} = ${b}`);
  for (const a of w) {
    assert.ok(!namesMatch(a, 'Liverpool'), `${a} != Liverpool`);
    assert.ok(!namesMatch(a, 'Liverpool FC'), `${a} != Liverpool FC`);
    assert.ok(!namesMatch('Liverpool Reservas', a));
  }
});

test('the F of F.C. / FC is not a women marker', () => {
  assert.ok(namesMatch('F.C. Porto', 'FC Porto'));
  assert.ok(namesMatch('F.C. Porto', 'Porto'));
  assert.ok(namesMatch('Porto F.C.', 'Porto'));
  assert.ok(namesMatch('Valencia C.F.', 'Valencia'));
  assert.ok(!namesMatch('FC Porto', 'Porto Feminino'));
});

test('women events from two houses join; men and women at the same time stay apart', () => {
  const t = '2026-11-22T14:00:00Z';
  const c: Candidate = { providerMatchId: 'w1', league: 'x', sport: 'FOOTBALL', home: 'Arsenal Women', away: 'Chelsea Women', startsAt: t };
  assert.equal(matchEvent(ev({ home: 'Arsenal F.', away: 'Chelsea F.', startsAt: t }), [c])?.providerMatchId, 'w1');
  assert.equal(matchEvent(ev({ home: 'Arsenal (F)', away: 'Chelsea (F)', startsAt: t }), [c])?.providerMatchId, 'w1');
  assert.equal(matchEvent(ev({ home: 'Arsenal Feminino', away: 'Chelsea Feminino', startsAt: t }), [c])?.providerMatchId, 'w1');
  assert.equal(matchEvent(ev({ home: 'Arsenal', away: 'Chelsea', startsAt: t }), [c]), null);
  const m: Candidate = { ...c, providerMatchId: 'm1', home: 'Arsenal', away: 'Chelsea' };
  assert.equal(matchEvent(ev({ home: 'Arsenal F.', away: 'Chelsea F.', startsAt: t }), [m]), null);
});

test('event key is the same across spellings', () => {
  const k = (home: string, away: string) => eventKey(ev({ home, away, startsAt: '2026-11-22T14:00:00Z' }), null);
  assert.equal(k('Sevilha', 'Bolonha'), k('Sevilla', 'Bologna'));
  assert.equal(k('Arsenal F.', 'Chelsea (F)'), k('Arsenal Women', 'Chelsea Feminino'));
  assert.notEqual(k('Arsenal F.', 'Chelsea F.'), k('Arsenal', 'Chelsea'));
});

test('tennis: a trailing first initial is not a women marker', () => {
  for (const [a, b] of [['Tiafoe F.', 'Frances Tiafoe'], ['Auger-Aliassime F.', 'Felix Auger-Aliassime'], ['Cerundolo F.', 'Francisco Cerundolo']] as const) {
    assert.ok(namesMatch(a, b, 'TENNIS'), a);
    const t = '2026-11-22T14:00:00Z';
    const c: Candidate = { providerMatchId: 't1', league: 'atp', sport: 'TENNIS', home: b, away: 'Other Player', startsAt: t };
    assert.equal(matchEvent(ev({ sport: 'TENNIS', home: a, away: 'Other Player', startsAt: t }), [c])?.providerMatchId, 't1', a);
  }
  const k = (h: string, a: string) => eventKey(ev({ sport: 'TENNIS', home: h, away: a, startsAt: '2026-11-22T14:00:00Z' }), null);
  assert.equal(k('Tiafoe F.', 'Sinner J.'), k('Sinner J.', 'Tiafoe F.'));
  assert.ok(!k('Tiafoe F.', 'Sinner J.')!.includes('feminino'));
});

test('football: W and F markers, with or without dot, are the same', () => {
  assert.ok(namesMatch('Arsenal W.', 'Arsenal W'));
  assert.ok(namesMatch('Arsenal W.', 'Arsenal F.'));
  assert.ok(namesMatch('Arsenal F', 'Arsenal (F)'));
  assert.ok(!namesMatch('Arsenal W.', 'Arsenal'));
});

test('tennis namesMatch behaves like teamNamesMatch (trailing W/B initials)', () => {
  assert.ok(namesMatch('Shelton B.', 'Ben Shelton', 'TENNIS'));
  assert.ok(namesMatch('Williams W.', 'Venus Williams', 'TENNIS'));
  assert.ok(namesMatch('Bonzi B.', 'Benjamin Bonzi', 'TENNIS'));
});
