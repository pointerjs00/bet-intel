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
  assert.ok(teamNamesMatch('Alexander Shevchenko', 'Aleksandr Shevchenko'));
  assert.ok(!teamNamesMatch('Real Madrid', 'Atletico Madrid'));
});

test('national-team competitions map to ESPN leagues', () => {
  assert.equal(espnLeagueFor('Liga das Nações'), 'uefa.nations');
  assert.equal(espnLeagueFor('UEFA Nations League'), 'uefa.nations');
  assert.equal(espnLeagueFor('Amigável Internacional'), 'fifa.friendly');
  assert.equal(espnLeagueFor('Qualificação Mundial 2026'), 'fifa.worldq.uefa');
  assert.equal(espnLeagueFor('Mundial 2026'), 'fifa.world');
  assert.equal(espnLeagueFor('Europeu 2028'), 'uefa.euro');
  assert.equal(espnLeagueFor('Liga Europa'), 'uefa.europa');
});

test('Portuguese country names match ESPN English names', () => {
  assert.ok(teamNamesMatch('Dinamarca', 'Denmark'));
  assert.ok(teamNamesMatch('País de Gales', 'Wales'));
  assert.ok(teamNamesMatch('Holanda', 'Netherlands'));
  assert.ok(teamNamesMatch('República Checa', 'Czechia'));
  assert.ok(teamNamesMatch('Irlanda', 'Republic of Ireland'));
  assert.ok(!teamNamesMatch('Portugal', 'Spain'));
});
