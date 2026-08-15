import { buildModuleBoardState, PROJECT_LOGIC } from '../data/initialData';

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const isOverdue = (dueDate) => Boolean(dueDate) && dueDate < todayISO();

// Buckets a due date's proximity to today so due-date readouts (esp. on
// collapsed task cards, where the timeline bar is hidden) can still signal
// urgency through color alone: overdue > due today/tomorrow > due this week.
export const getDeadlineUrgency = (dueDate) => {
  if (!dueDate) return 'none';
  const today = todayISO();
  if (dueDate < today) return 'overdue';
  const daysLeft = Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000);
  if (daysLeft <= 1) return 'urgent';
  if (daysLeft <= 6) return 'soon';
  return 'normal';
};

// 'YYYY-MM-DD' -> 'DD/MM/YYYY', used on task cards and the overdue popover.
export const formatShortDate = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

// Percentage (0-100) of a start->due window elapsed as of today; used to draw
// the timeline bar on a task card so it reflects real wall-clock time on every
// render, with no separately stored "progress" value to fall out of sync.
export const computeTimelineProgress = (startDate, dueDate) => {
  if (!startDate || !dueDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(dueDate).getTime();
  if (!(end > start)) return null;
  const now = Date.now();
  const pct = ((now - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

// The module info modal stores its long-form write-up as a single string of
// "Label: text" lines (one per array entry, blank-line separated). These two
// helpers turn that string into structured {label, text} sections for display
// and back again after editing, without needing to migrate any stored data.
export const parseDetailSections = (text) => {
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const idx = line.indexOf(': ');
      if (idx === -1) return { label: '', text: line };
      return { label: line.slice(0, idx), text: line.slice(idx + 2) };
    });
};

export const serializeDetailSections = (sections) =>
  sections
    .map(section => (section.label ? `${section.label}: ${section.text}` : section.text))
    .join('\n\n');

// "Bản chất & Mô tả" / "Đối tượng phù hợp" are just the "Bản chất"/audience
// lines inside `details` - shared parsing+merge logic so Board.jsx's header
// card and ModuleModal.jsx's create/edit form read and write the exact same
// 2 lines instead of duplicating the label-matching regex in two places.
const AUDIENCE_LABELS = ['ai phù hợp', 'đối tượng phù hợp', 'khách hàng', 'khách hàng/đối tượng phục vụ'];

export const parseHeaderInfo = (details) => {
  let nature = '';
  let targetAudience = '';
  if (details) {
    details.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('bản chất:')) {
        nature = trimmed.replace(/^bản chất:\s*/i, '');
      } else if (AUDIENCE_LABELS.some(label => trimmed.toLowerCase().startsWith(`${label}:`))) {
        targetAudience = trimmed.replace(/^(ai|đối tượng|khách hàng(\/đối tượng phục vụ)?)\s*(phù hợp)?:?\s*/i, '');
      }
    });
  }
  return { nature, targetAudience };
};

// Updates the "Bản chất"/audience sections in place if already present
// (keeping every other section - KPI, nguồn tiền...) or prepends new ones -
// never wipes out the rest of a module's `details`.
export const applyHeaderInfo = (details, { nature, targetAudience }) => {
  let sections = parseDetailSections(details);

  const natureIdx = sections.findIndex(s => (s.label || '').trim().toLowerCase() === 'bản chất');
  if (natureIdx !== -1) {
    sections = sections.map((s, i) => i === natureIdx ? { ...s, text: nature } : s);
  } else if ((nature || '').trim()) {
    sections = [{ label: 'Bản chất', text: nature }, ...sections];
  }

  const audienceIdx = sections.findIndex(s => AUDIENCE_LABELS.includes((s.label || '').trim().toLowerCase()));
  if (audienceIdx !== -1) {
    sections = sections.map((s, i) => i === audienceIdx ? { ...s, text: targetAudience } : s);
  } else if ((targetAudience || '').trim()) {
    const insertAt = sections.findIndex(s => (s.label || '').trim().toLowerCase() === 'bản chất') + 1;
    sections.splice(Math.max(insertAt, 0), 0, { label: 'Ai phù hợp', text: targetAudience });
  }

  return serializeDetailSections(sections);
};

// Splits a prose KPI line into individual KPI phrases. Modules separate items
// with either ',' or ';' depending on how the source playbook text was
// written, so both are treated as delimiters - but only at paren-depth 0, so
// a parenthetical target like "(tối thiểu 80%)" never gets split apart.
export const splitKpiText = (text) => {
  if (!text) return [];
  const items = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      items.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items.map(s => s.replace(/\.$/, '').trim()).filter(Boolean);
};

// Pulls the "KPI cốt lõi" line straight out of a module's own description
// (`details`) instead of maintaining a second hand-written copy. Falls back
// to the curated PROJECT_LOGIC.kpis (used for modules like M6 that describe
// success via Gates rather than a single KPI line).
export const getModuleKpiList = (module) => {
  const sections = parseDetailSections(module.details);
  const kpiSection = sections.find(s => s.label.toLowerCase().includes('kpi'));
  if (kpiSection) {
    const parsed = splitKpiText(kpiSection.text);
    if (parsed.length > 0) return parsed;
  }
  return PROJECT_LOGIC[module.id]?.kpis || [];
};

// Extracts a short target note from a KPI phrase's own parenthetical, e.g.
// "Tỷ lệ hoàn thành học tập (tối thiểu 80%)" -> "tối thiểu 80%". Returns null
// when the phrase carries no explicit numeric/qualified target.
export const extractKpiTarget = (kpiText) => {
  const match = kpiText.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
};

// Older saved boards (pre column-merge) kept two independent column sets -
// 'kanban' and 'pdca' - for the same tasks. Since Kanban/PDCA are now a single
// customizable board, we promote the Kanban placement as the source of truth
// and drop the separate PDCA placement (the columns themselves survive, just
// unified into one board the user can rename/extend).
export const normalizeBoardData = (raw, module) => {
  if (!raw) return buildModuleBoardState(module);
  if (raw.columns && raw.columnOrder) {
    // Already the current shape - just make sure every column has a description.
    const columns = Object.fromEntries(
      Object.entries(raw.columns).map(([id, col]) => [id, { description: '', ...col }])
    );
    return { ...raw, columns };
  }
  if (raw.kanban?.columns && raw.kanban?.columnOrder) {
    const columns = Object.fromEntries(
      Object.entries(raw.kanban.columns).map(([id, col]) => [id, { description: '', ...col }])
    );
    return {
      tasks: raw.tasks || {},
      description: raw.description,
      details: raw.details,
      columns,
      columnOrder: raw.kanban.columnOrder
    };
  }
  return buildModuleBoardState(module);
};

// Boards now live in the server's SQLite DB, not localStorage. Since
// taskOperations.js/Board.jsx call loadModuleBoard *synchronously* (e.g.
// `useState(() => loadModuleBoard(module))`), we keep that signature
// unchanged by maintaining an in-memory cache that's hydrated once via
// `hydrateBoardCache()` at app boot (see App.jsx). taskOperations.js writes
// directly to this cache via `applyServerBoard` (optimistic update, then
// reconciled with the server's response) - see that file for why per-task
// granular requests replaced a single whole-board PUT here.
let boardCache = {};
let cacheHydrated = false;

// Bumped every time a LOCAL mutation (create/move/update/...) writes to
// boardCache via applyServerBoard - lets refreshModuleBoard notice if one
// landed while its own fetch was still in flight, so it can discard its now-
// stale response instead of clobbering the newer local state (was causing
// drag-drop to visually "snap back": the 4s poll started before a drag, the
// drag completed and applied its own correct result, then the poll's older
// response arrived and overwrote it).
let mutationVersion = {};

export const hydrateBoardCache = async () => {
  const res = await fetch('/api/boards');
  if (!res.ok) throw new Error('Không tải được dữ liệu board từ server.');
  boardCache = await res.json();
  cacheHydrated = true;
};

// Phase 2's background worker mutates tasks server-side, independent of any
// open browser tab - there is no SSE/WebSocket channel yet (planned for
// Phase 3), so an open Board page polls this to see agent progress
// (queued → running → done/awaiting_approval) without a manual reload.
export const refreshModuleBoard = async (module) => {
  if (!module || !module.id) return buildModuleBoardState(module);
  const versionAtStart = mutationVersion[module.id] || 0;
  const res = await fetch(`/api/modules/${encodeURIComponent(module.id)}/board`);
  if (!res.ok) throw new Error('Không tải lại được board.');
  const board = await res.json();
  if ((mutationVersion[module.id] || 0) !== versionAtStart) {
    // A local mutation (drag-drop, create, ...) landed while this request was
    // in flight - its result is newer than what we just fetched, keep it.
    return boardCache[module.id];
  }
  boardCache[module.id] = board;
  return board;
};

// Reads a module's board from the in-memory cache, falling back to its seed
// backlog when the cache has nothing for it yet (module chưa từng tải/mới tạo).
export const loadModuleBoard = (module) => {
  if (!module || !module.id) return buildModuleBoardState(module);
  if (cacheHydrated && boardCache[module.id]) return boardCache[module.id];
  return buildModuleBoardState(module);
};

// Loads every module's board (persisted or seeded) in one pass, used by the
// Overview dashboard, sidebar search and the header's overdue-tasks popover.
export const loadAllBoards = (flatModules) =>
  (flatModules || []).filter(Boolean).map(module => ({ module, board: loadModuleBoard(module) }));

// Real task counts by Kanban status, used by the progress sidebar so it
// reflects where cards actually sit instead of a separate per-task
// `progress` field (a manual 0-100 estimate the user sets on a task, which
// has no relationship to which column the card is in). The first column is
// treated as "todo", the last as "done", everything between as "in progress"
// - this holds for the default 4-column board and stays sensible even if the
// user renames/reorders/adds columns.
export const getBoardTaskCounts = (boardData) => {
  const total = Object.keys(boardData?.tasks || {}).length;
  const columnOrder = boardData?.columnOrder || [];
  const columns = boardData?.columns || {};
  if (columnOrder.length < 2) {
    return { total, todo: total, inProgress: 0, done: 0 };
  }
  const countIn = (colId) => (columns[colId]?.taskIds || []).length;
  const todo = countIn(columnOrder[0]);
  const done = countIn(columnOrder[columnOrder.length - 1]);
  const inProgress = Math.max(0, total - todo - done);
  return { total, todo, inProgress, done };
};

// Called when a module is deleted from the structure, so its board data
// doesn't linger in the DB forever.
export const deleteModuleBoard = (moduleId) => {
  delete boardCache[moduleId];
  fetch(`/api/modules/${encodeURIComponent(moduleId)}/board`, { method: 'DELETE' }).catch(() => {
    // best-effort - the module row itself is already gone from the structure
  });
};

// Overwrites just the in-memory cache entry (no network call) - used by
// taskOperations.js to apply its own optimistic update immediately, and
// again to reconcile with the server's authoritative board once a granular
// request resolves. Never talks to the network itself, so it can't
// accidentally reintroduce the whole-board clobber risk the granular
// per-task endpoints (routes/tasks.js) were built to remove.
export const applyServerBoard = (moduleId, board) => {
  boardCache[moduleId] = board;
  mutationVersion[moduleId] = (mutationVersion[moduleId] || 0) + 1;
};

// For the one legitimate whole-board-shaped edit that ISN'T a task mutation:
// the module's own description/details text (see Board.jsx's header-card and
// "Thông tin mô hình" editors). Touches only those two columns server-side,
// never tasks/columns, so it can never race with the background worker.
export const updateModuleDetails = (moduleId, { description, details }) => {
  const current = boardCache[moduleId];
  if (current) boardCache[moduleId] = { ...current, description, details };
  fetch(`/api/modules/${encodeURIComponent(moduleId)}/details`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, details })
  }).catch((err) => console.error('Lưu mô tả module thất bại:', err));
};
