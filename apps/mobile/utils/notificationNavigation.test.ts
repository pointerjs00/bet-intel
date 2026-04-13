import test from 'node:test';
import assert from 'node:assert/strict';
import { getNotificationTarget, isNotificationNavigateTap } from './notificationNavigation';

test('getNotificationTarget routes friend notifications to the friends tab', () => {
  assert.equal(
    getNotificationTarget({ type: 'FRIEND_REQUEST', data: { requestId: 'req-1' } } as never),
    '/(tabs)/friends',
  );
  assert.equal(
    getNotificationTarget({ type: 'FRIEND_ACCEPTED', data: { friendId: 'user-2' } } as never),
    '/(tabs)/friends',
  );
});

test('getNotificationTarget routes boletim notifications to the boletim detail screen', () => {
  assert.equal(
    getNotificationTarget({ type: 'BOLETIN_SHARED', data: { boletinId: 'abc123' } } as never),
    '/boletins/abc123',
  );
  assert.equal(
    getNotificationTarget({ type: 'BOLETIN_RESULT', data: { boletinId: 'xyz987' } } as never),
    '/boletins/xyz987',
  );
  assert.equal(getNotificationTarget({ type: 'SYSTEM', data: null } as never), null);
});

test('isNotificationNavigateTap only treats taps in the trailing zone as navigation taps', () => {
  assert.equal(isNotificationNavigateTap(170, 200, true), true);
  assert.equal(isNotificationNavigateTap(120, 200, true), false);
  assert.equal(isNotificationNavigateTap(170, 200, false), false);
});