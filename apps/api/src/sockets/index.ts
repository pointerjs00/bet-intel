import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import type { BoletinResultPayload, FriendActivityPayload } from '@betintel/shared';
import { verifyAccessToken, type JwtPayload } from '../services/auth/tokenService';
import { logger } from '../utils/logger';
import type { LiveScorePayload } from '../jobs/liveScoreJob';

const LIVE_ROOM = 'live';
let io: Server | null = null;

interface SocketUserData {
  user?: JwtPayload;
}

/** Returns the user-specific room name used by authenticated sockets. */
export function userRoomName(userId: string): string {
  return `user:${userId}`;
}

/** Returns the event-specific room name used for live odds subscriptions. */
export function eventRoomName(eventId: string): string {
  return `event:${eventId}`;
}

/** Returns the room used by subscribers of all live events. */
export function liveRoomName(): string {
  return LIVE_ROOM;
}

/** Returns the shared Socket.io server instance when initialized. */
export function getSocketServer(): Server | null {
  return io;
}

/** Initializes the Socket.io server with JWT-based handshake authentication. */
export function initializeSocketServer(server: HttpServer): Server {
  if (io) {
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? false
        : true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error('Token de autenticação em falta'));
      return;
    }

    try {
      (socket.data as SocketUserData).user = verifyAccessToken(token);
      next();
    } catch (error) {
      logger.debug('Socket authentication failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as SocketUserData).user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.join(userRoomName(user.sub));

    socket.on('subscribe:event', (payload: { eventId?: string }) => {
      const eventId = payload?.eventId?.trim();
      if (!eventId) {
        return;
      }

      socket.join(eventRoomName(eventId));
    });

    socket.on('unsubscribe:event', (payload: { eventId?: string }) => {
      const eventId = payload?.eventId?.trim();
      if (!eventId) {
        return;
      }

      socket.leave(eventRoomName(eventId));
    });

    socket.on('subscribe:live', () => {
      socket.join(liveRoomName());
    });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { userId: user.sub, socketId: socket.id });
    });
  });

  return io;
}

/** Emits a boletim result update to the owner's private room. */
export function emitBoletinResult(userId: string, payload: BoletinResultPayload): void {
  const server = getSocketServer();
  if (!server) {
    return;
  }

  server.to(userRoomName(userId)).emit('boletim:result', payload);
}

/** Emits friend activity updates to one or more private user rooms. */
export function emitFriendActivity(targetUserIds: string[], payload: FriendActivityPayload): void {
  const server = getSocketServer();
  if (!server) {
    return;
  }

  for (const userId of new Set(targetUserIds)) {
    server.to(userRoomName(userId)).emit('friend:activity', payload);
  }
}

/** Broadcasts a live fixture score to all clients in the `live` room. */
export function emitLiveScore(payload: LiveScorePayload): void {
  const server = getSocketServer();
  if (!server) {
    return;
  }
  server.to(liveRoomName()).emit('fixture:score', payload);
}

function extractToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  return null;
}