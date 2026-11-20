import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapEspnSummary } from '../sportsData/espnFootball';
import { mapEspnNbaSummary } from '../sportsData/espnBasketball';
import { mapEspnTennisScoreboard } from '../sportsData/espnTennis';
import { basketballCandidate, eventKey, footballCandidate, matchEvent, tennisCandidate, type Candidate } from './matcher';
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
