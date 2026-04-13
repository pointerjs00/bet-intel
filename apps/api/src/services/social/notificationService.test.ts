import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationType } from '@betintel/shared';
import { buildExpoPushMessages, dispatchStoredNotifications } from './notificationService';

test('dispatchStoredNotifications emits each notification and forwards it to push delivery', async () => {
  const rows = [
    {
      id: 'notif-1',
      userId: 'user-1',
      type: 'BOLETIN_SHARED',
      title: 'Novo boletim partilhado',
      body: 'Joao partilhou um boletim contigo',
      data: { boletinId: 'boletin-1' },
      isRead: false,
      createdAt: new Date('2026-04-13T18:00:00.000Z'),
    },
  ] as Parameters<typeof dispatchStoredNotifications>[0];

  const emitted: Array<{ userId: string; notificationId: string }> = [];
  const delivered: Array<{ userId: string; notificationId: string }> = [];

  const notifications = await dispatchStoredNotifications(rows, {
    emitNotification: (userId, notification) => {
      emitted.push({ userId, notificationId: notification.id });
    },
    sendPushNotifications: async (items) => {
      delivered.push(...items.map((item) => ({ userId: item.userId, notificationId: item.notification.id })));
    },
  });

  assert.equal(notifications.length, 1);
  assert.deepEqual(emitted, [{ userId: 'user-1', notificationId: 'notif-1' }]);
  assert.deepEqual(delivered, [{ userId: 'user-1', notificationId: 'notif-1' }]);
});

test('buildExpoPushMessages includes notification data and skips users without a token', () => {
  const messages = buildExpoPushMessages(
    [
      {
        userId: 'user-1',
        notification: {
          id: 'notif-1',
          userId: 'user-1',
          type: NotificationType.BOLETIN_RESULT,
          title: 'Boletim ganho',
          body: 'O teu boletim foi resolvido como ganho.',
          data: { boletinId: 'boletin-1', status: 'WON' },
          isRead: false,
          createdAt: '2026-04-13T18:00:00.000Z',
        },
      },
      {
        userId: 'user-2',
        notification: {
          id: 'notif-2',
          userId: 'user-2',
          type: NotificationType.SYSTEM,
          title: 'Sistema',
          body: 'Mensagem',
          data: null,
          isRead: false,
          createdAt: '2026-04-13T18:00:00.000Z',
        },
      },
    ],
    new Map([['user-1', 'ExponentPushToken[token-1]']]),
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.to, 'ExponentPushToken[token-1]');
  assert.equal(messages[0]?.data.notificationId, 'notif-1');
  assert.equal(messages[0]?.data.boletinId, 'boletin-1');
  assert.equal(messages[0]?.data.status, 'WON');
});