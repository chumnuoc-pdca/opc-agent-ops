// Same-tab pub/sub so pages stay in sync when task data changes from
// anywhere else in the app (manual edits, AI tool calls, another module's
// page). The native `storage` event only fires in OTHER tabs, never the tab
// that made the change, so a tiny custom-event bus is the simplest fix.
const EVENT = 'opc-data-changed';

export const emitDataChanged = (moduleId) => {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { moduleId } }));
};

// handler receives (moduleId) - moduleId is null for structure-wide changes.
export const onDataChanged = (handler) => {
  const listener = (e) => handler(e.detail?.moduleId ?? null);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};
