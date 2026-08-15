import { refreshModuleBoard } from './boardStorage';
import { emitDataChanged } from './dataBus';

// Phase 3: subscribes to the server's SSE stream (routes/stream.js) so an
// open Board tab reflects agent/worker changes within ~1 event round-trip
// instead of waiting up to 4s for the polling fallback (still kept in
// Board.jsx as a safety net if the SSE connection drops).
//
// On each `{moduleId}` push, the board cache is refreshed from the server
// BEFORE re-dispatching the same `opc-data-changed` event dataBus.js already
// uses - every existing consumer (Board.jsx, RightSidebarPanel.jsx) keeps
// reading `loadModuleBoard`'s in-memory cache with zero code changes, it
// just now finds fresh data waiting for it instead of stale data.
let source = null;

export const connectLiveUpdates = () => {
  if (source) return;
  source = new EventSource('/api/stream');
  source.onmessage = (event) => {
    try {
      const { moduleId } = JSON.parse(event.data);
      if (!moduleId) return;
      refreshModuleBoard({ id: moduleId })
        .then(() => emitDataChanged(moduleId))
        .catch(() => {
          // best-effort - the 4s poll in Board.jsx will catch up regardless
        });
    } catch {
      // heartbeat/comment lines have no JSON payload - ignore
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects on its own; nothing to do here.
  };
};
