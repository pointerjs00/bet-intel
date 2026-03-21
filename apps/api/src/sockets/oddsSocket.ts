import type { OddsUpdatedPayload } from '@betintel/shared';
import { getSocketServer, liveRoomName, eventRoomName } from './index';

/** Emits an odds change to subscribers of the specific event and live feed room. */
export function emitOddsUpdated(payload: OddsUpdatedPayload): void {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  io.to(eventRoomName(payload.eventId)).emit('odds:updated', payload);
  io.to(liveRoomName()).emit('odds:updated', payload);
}