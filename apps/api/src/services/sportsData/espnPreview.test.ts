import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEspnPreview } from './espnPreview';

// Shape recorded from the ESPN summary (Brighton vs Brentford, 2026-11), trimmed to the fields read.
const summary = {
  header: { competitions: [{ competitors: [{ homeAway: 'home', team: { id: '331' } }, { homeAway: 'away', team: { id: '337' } }] }] },
  standings: {
    header: 'English Premier League Standings',
    groups: [{ standings: { entries: [
      { team: 'Brentford', id: '337', stats: [{ name: 'rank', value: 2 }, { name: 'gamesPlayed', value: 10 }, { name: 'wins', value: 6 }, { name: 'ties', value: 2 }, { name: 'losses', value: 2 }, { name: 'pointDifferential', displayValue: '+7' }, { name: 'points', value: 20 }] },
      { team: 'Arsenal', id: '359', stats: [{ name: 'rank', value: 1 }, { name: 'gamesPlayed', value: 10 }, { name: 'wins', value: 9 }, { name: 'ties', value: 0 }, { name: 'losses', value: 1 }, { name: 'pointDifferential', displayValue: '+10' }, { name: 'points', value: 27 }] },
    ] } }],
  },
  lastFiveGames: [
    { team: { id: '331' }, events: [{ gameResult: 'D' }, { gameResult: 'W' }, { gameResult: 'L' }] },
    { team: { id: '337' }, events: [{ gameResult: 'W' }] },
  ],
  seasonseries: [{ type: 'head-to-head', events: [
    { date: '2026-02-21T15:00:00Z', competitionName: '2025-26 English Premier League', competitors: [{ homeAway: 'home', score: '0', team: { displayName: 'Brentford' } }, { homeAway: 'away', score: '2', team: { displayName: 'Brighton & Hove Albion' } }] },
  ] }],
};

test('maps standings sorted by rank, form per side and head-to-head', () => {
  const p = mapEspnPreview(summary);
  assert.equal(p.standings?.rows[0]?.team, 'Arsenal');
  assert.equal(p.standings?.rows[1]?.points, 20);
  assert.equal(p.standings?.rows[1]?.goalDiff, '+7');
  assert.equal(p.standings?.rows[0]?.logo, 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png');
  assert.deepEqual(p.form, { home: ['D', 'W', 'L'], away: ['W'] });
  assert.deepEqual(p.h2h[0], { date: '2026-02-21T15:00:00Z', home: 'Brentford', away: 'Brighton & Hove Albion', homeScore: 0, awayScore: 2, competition: 'English Premier League' });
});

test('empty summary gives an empty preview', () => {
  assert.deepEqual(mapEspnPreview({}), { standings: null, form: { home: [], away: [] }, h2h: [] });
});
