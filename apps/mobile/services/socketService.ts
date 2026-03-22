import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';
import type {
  BoletinResultPayload,
  EventStatusChangePayload,
  Notification,
  OddsUpdatedPayload,
  FriendActivityPayload,
} from '@betintel/shared';

type SocketEventMap = {
  'odds:updated': OddsUpdatedPayload;
  'event:statusChange': EventStatusChangePayload;
  'boletin:result': BoletinResultPayload;
  'friend:activity': FriendActivityPayload;
  'notification:new': { notification: Notification };
};

interface UntypedSocketListenerHost {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
}

type SocketListener = (...args: unknown[]) => void;

let socket: Socket | null = null;
let currentToken: string | null = null;
let appStateSubscription: { remove: () => void } | null = null;
const eventSubscriptionCounts = new Map<string, number>();
const persistentListeners = new Map<keyof SocketEventMap, Set<SocketListener>>();

const expoExtra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? expoExtra?.apiBaseUrl ?? 'http://localhost:3000/api';
const socketBaseUrl = apiBaseUrl.replace(/\/api\/?$/, '');

/** Ensures the authenticated socket client exists and connects with the current JWT. */
export function connectSocket(token: string): void {
  currentToken = token;

  if (!socket) {
    socket = io(socketBaseUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      transports: ['websocket'],
      auth: { token },
    });

    attachPersistentListeners();
  }

  socket.auth = { token };
  if (!socket.connected) {
    socket.connect();
  }

  resubscribeRooms();
}

/** Disconnects the socket client and clears room subscription state. */
export function disconnectSocket(): void {
  currentToken = null;
  eventSubscriptionCounts.clear();

  if (socket) {
    socket.disconnect();
  }
}

/** Starts foreground listeners so the socket reconnects whenever the app becomes active. */
export function startSocketForegroundSync(getAccessToken: () => string | null): void {
  if (appStateSubscription) {
    return;
  }

  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state !== 'active') {
      return;
    }

    const token = getAccessToken();
    if (token) {
      connectSocket(token);
    }
  });
}

/** Stops foreground sync lifecycle listeners. */
export function stopSocketForegroundSync(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

/** Subscribes the client to a specific live event room with local ref counting. */
export function subscribeToEvent(eventId: string): void {
  const normalized = eventId.trim();
  if (!normalized) {
    return;
  }

  const current = eventSubscriptionCounts.get(normalized) ?? 0;
  eventSubscriptionCounts.set(normalized, current + 1);

  if (current === 0) {
    socket?.emit('subscribe:event', { eventId: normalized });
  }
}

/** Removes a local subscription from an event room and unsubscribes once no listeners remain. */
export function unsubscribeFromEvent(eventId: string): void {
  const normalized = eventId.trim();
  if (!normalized) {
    return;
  }

  const current = eventSubscriptionCounts.get(normalized) ?? 0;
  if (current <= 1) {
    eventSubscriptionCounts.delete(normalized);
    socket?.emit('unsubscribe:event', { eventId: normalized });
    return;
  }

  eventSubscriptionCounts.set(normalized, current - 1);
}

/** Subscribes the socket to the shared live-events room. */
export function subscribeToLive(): void {
  socket?.emit('subscribe:live');
}

/** Registers a typed Socket.io event listener and returns an unsubscribe callback. */
export function addSocketListener<TEvent extends keyof SocketEventMap>(
  event: TEvent,
  handler: (payload: SocketEventMap[TEvent]) => void,
): () => void {
  const host = socket as unknown as UntypedSocketListenerHost | null;
  const listener = handler as unknown as (...args: unknown[]) => void;
  let listeners = persistentListeners.get(event);

  if (!listeners) {
    listeners = new Set<SocketListener>();
    persistentListeners.set(event, listeners);
  }

  listeners.add(listener);
  host?.on(event, listener);

  return () => {
    persistentListeners.get(event)?.delete(listener);
    host?.off(event, listener);
  };
}

function attachPersistentListeners(): void {
  const host = socket as unknown as UntypedSocketListenerHost | null;
  if (!host) {
    return;
  }

  persistentListeners.forEach((listeners, event) => {
    listeners.forEach((listener) => {
      host.on(event, listener);
    });
  });
}

function resubscribeRooms(): void {
  if (!socket?.connected) {
    socket?.once('connect', () => {
      // Always join the live feed room so the client receives odds:updated
      // and event:statusChange events without needing an explicit subscription call
      socket?.emit('subscribe:live');
      eventSubscriptionCounts.forEach((_count, eventId) => {
        socket?.emit('subscribe:event', { eventId });
      });
    });
    return;
  }

  // Already connected — re-join rooms immediately
  socket.emit('subscribe:live');
  eventSubscriptionCounts.forEach((_count, eventId) => {
    socket?.emit('subscribe:event', { eventId });
  });
}