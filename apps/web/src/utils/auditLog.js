const KEY = 'opc-audit-log';
const MAX_ENTRIES = 500;

// Lightweight but real audit trail for AI actions (spec: "actor_type,
// before/after, request_id"). Local-only, but every write the assistant
// performs on behalf of the user is recorded here, in order, and readable
// from the "Nhật ký AI" page.
export const loadAuditLog = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // corrupt/unavailable storage - start fresh below
  }
  return [];
};

export const appendAuditLog = (entry) => {
  const log = loadAuditLog();
  const next = [
    {
      id: `audit-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      createdAt: Date.now(),
      actorType: 'ai_on_behalf_of_user',
      ...entry
    },
    ...log
  ].slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
};

export const clearAuditLog = () => localStorage.removeItem(KEY);
