import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationRoute } from './notificationRoute';

test('football live notification opens the match with league', () => {
  assert.deepEqual(
    notificationRoute({ type: 'GOAL_SCORED', espnMatchId: '123', sport: 'FOOTBALL', league: 'por.1', boletinId: 'b1' }),
    { pathname: '/jogo/[id]', params: { id: '123', league: 'por.1' } },
  );
});

test('football without league falls back to the boletim', () => {
  assert.equal(notificationRoute({ type: 'GOAL_SCORED', espnMatchId: '123', sport: 'FOOTBALL', boletinId: 'b1' }), '/boletins/b1');
});

test('basketball opens the NBA match', () => {
  assert.deepEqual(
    notificationRoute({ type: 'HALF_TIME', espnMatchId: '9', sport: 'BASKETBALL', boletinId: 'b1' }),
    { pathname: '/jogo/nba/[id]', params: { id: '9' } },
  );
});

test('tennis needs the date', () => {
  assert.deepEqual(
    notificationRoute({ type: 'MATCH_FINISHED', espnMatchId: '7', sport: 'TENNIS', date: '2026-05-01', boletinId: 'b1' }),
    { pathname: '/jogo/tenis/[id]', params: { id: '7', date: '2026-05-01' } },
  );
  assert.equal(notificationRoute({ type: 'MATCH_FINISHED', espnMatchId: '7', sport: 'TENNIS', boletinId: 'b1' }), '/boletins/b1');
});

test('lowercase sport is accepted', () => {
  assert.deepEqual(
    notificationRoute({ type: 'RED_CARD', espnMatchId: '5', sport: 'basketball' }),
    { pathname: '/jogo/nba/[id]', params: { id: '5' } },
  );
});

test('BET_DECIDED opens the boletim', () => {
  assert.equal(notificationRoute({ type: 'BET_DECIDED', espnMatchId: '1', sport: 'FOOTBALL', league: 'por.1', boletinId: 'b1' }), '/boletins/b1');
});

test('KICKOFF_REMINDER opens the boletim', () => {
  assert.equal(notificationRoute({ type: 'KICKOFF_REMINDER', boletinId: 'b2', espnMatchId: '1', sport: 'FOOTBALL', league: 'x' }), '/boletins/b2');
});

test('legacy payload without match params opens the boletim', () => {
  assert.equal(notificationRoute({ type: 'GOAL_SCORED', boletinId: 'b3', fixtureId: 'f' }), '/boletins/b3');
});

test('social notifications open the notification centre', () => {
  assert.equal(notificationRoute({ type: 'FRIEND_REQUEST' }), '/notifications');
  assert.equal(notificationRoute({ type: 'FRIEND_ACCEPTED' }), '/notifications');
});

test('generic notificationId falls back to the centre; nothing known gives null', () => {
  assert.equal(notificationRoute({ notificationId: 'n' }), '/notifications');
  assert.equal(notificationRoute({}), null);
});
