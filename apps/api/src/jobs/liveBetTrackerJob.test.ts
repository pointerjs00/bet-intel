import test from 'node:test';
import assert from 'node:assert/strict';
import { espnLeagueFor } from './liveBetTrackerJob';
import { teamNamesMatch } from '../services/marketResolutionEngine';

test('competition names stored on bets map to ESPN leagues', () => {
  assert.equal(espnLeagueFor('Liga Portugal Betclic'), 'por.1');
  assert.equal(espnLeagueFor('Premier League'), 'eng.1');
  assert.equal(espnLeagueFor('LaLiga'), 'esp.1');
  assert.equal(espnLeagueFor('Bundesliga'), 'ger.1');
  assert.equal(espnLeagueFor('Serie A'), 'ita.1');
  assert.equal(espnLeagueFor('Ligue 1'), 'fra.1');
  assert.equal(espnLeagueFor('Eredivisie'), 'ned.1');
  assert.equal(espnLeagueFor('Süper Lig'), 'tur.1');
  assert.equal(espnLeagueFor('UEFA Champions League'), 'uefa.champions');
  assert.equal(espnLeagueFor('Liga Europa'), 'uefa.europa');
  assert.equal(espnLeagueFor('2. Bundesliga'), null);
  assert.equal(espnLeagueFor('Liga Portugal 2'), null);
  assert.equal(espnLeagueFor('Championship'), null);
});

test('team names from bets match ESPN names', () => {
  assert.ok(teamNamesMatch('SL Benfica', 'Benfica'));
  assert.ok(teamNamesMatch('Brighton & Hove Albion', 'Brighton'));
  assert.ok(teamNamesMatch('VfB Stuttgart', 'Stuttgart'));
  assert.ok(teamNamesMatch('Estugarda', 'VfB Stuttgart'));
  assert.ok(!teamNamesMatch('Club Brugge', 'Cercle Brugge'));
  assert.ok(!teamNamesMatch('Manchester United', 'Manchester City'));
});
