import { EventEmitter } from 'node:events';

// Singleton in-process event bus - every route/worker step that mutates a
// module's board (granular task ops, worker claim/finish, agent-run resume)
// calls `emitBoardChanged(moduleId)` so routes/stream.js's SSE endpoint can
// push it to any connected browser tab in near-real-time (Phase 3 - replaces
// the Phase 2 4s polling as the primary channel; polling stays as a fallback
// in case the SSE connection drops).
export const boardEvents = new EventEmitter();
boardEvents.setMaxListeners(50);

export const emitBoardChanged = (moduleId) => {
  boardEvents.emit('changed', moduleId);
};
