import { loadModuleBoard, applyServerBoard } from './boardStorage';
import { loadStructure } from './structureStorage';
import { flattenGroups } from '../data/initialData';
import { emitDataChanged } from './dataBus';

// Canonical, framework-agnostic task/column mutations. Both the Board UI and
// the AI tool executor call these same functions, so a task created or moved
// by a person and one created or moved by the assistant go through identical
// logic, get the same validation, and fire the same refresh event.
//
// Each function computes its result OPTIMISTICALLY against the local board
// cache (same synchronous shape as always - Board.jsx/TaskModal/aiTools.js
// read the return value immediately), then fires a GRANULAR request at the
// matching server-side row-level operation in the background. This replaces
// the earlier whole-board PUT bridge, which was only safe for Phase 0/1:
// once the background worker (Phase 2) mutates individual tasks
// concurrently, a whole-board PUT from a human's open tab would silently
// clobber whatever the worker just wrote via last-write-wins. Granular ops
// mean the server only ever touches the exact row(s) each operation names.
const API_BASE = '';

const jsonFetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TaskOpError(body.error || `Yêu cầu thất bại (mã ${res.status}).`);
    }
    return res.json();
  });

// Reconciles the local cache with the server's authoritative board once the
// background request resolves (self-corrects anything the optimistic local
// computation got slightly wrong, e.g. an interleaved worker write), and
// re-fires the refresh event so any mounted view picks up the correction.
const syncInBackground = (moduleId, promise) => {
  promise
    .then((board) => {
      applyServerBoard(moduleId, board);
      emitDataChanged(moduleId);
    })
    .catch((err) => console.error(`Đồng bộ công việc thất bại (module ${moduleId}):`, err.message));
};

const resolveModule = (moduleId) => flattenGroups(loadStructure()).find(m => m.id === moduleId);

// MAX-based, not count-based: counting rows breaks the moment any task in
// the module has ever been deleted (count drops, so count+1 reuses a number
// still held by a surviving task -> duplicate code). Scanning for the
// highest existing numeric suffix under this exact prefix is safe regardless
// of deletions/gaps.
const nextTaskCode = (tasks, moduleCode) => {
  const prefix = `${moduleCode}-`;
  let maxNum = 0;
  Object.values(tasks || {}).forEach((t) => {
    if (t.code) {
      let n = NaN;
      if (t.code.startsWith(prefix)) {
        n = parseInt(t.code.slice(prefix.length), 10);
      } else {
        const parts = t.code.split('-');
        n = parseInt(parts[parts.length - 1], 10);
      }
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `${moduleCode}-${String(maxNum + 1).padStart(2, '0')}`;
};

const stripTaskEverywhere = (board, taskId) => {
  const nextTasks = { ...board.tasks };
  delete nextTasks[taskId];
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([id, col]) => [id, { ...col, taskIds: col.taskIds.filter(t => t !== taskId) }])
  );
  return { ...board, tasks: nextTasks, columns };
};

export class TaskOpError extends Error {}

export const getModuleBoard = (moduleId) => {
  const module = resolveModule(moduleId);
  if (!module) throw new TaskOpError(`Không tìm thấy module "${moduleId}".`);
  return { module, board: loadModuleBoard(module) };
};

export const sanitizeTaskTitleAndNotes = (rawContent = '', rawNotes = '') => {
  let content = (rawContent || '').trim();
  let notes = (rawNotes || '').trim();

  if (!content) return { content: '', notes };

  content = content.replace(/^[-*•\d.]+\s+/, '');

  if (content.length > 140 || content.includes('\n')) {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || '';
    let title = firstLine;
    const fullText = (rawContent || '').trim();

    if (firstLine.length > 140) {
      const punctMatch = firstLine.slice(0, 140).match(/^(.{40,140}?[.:;?!—–])\s/);
      if (punctMatch && punctMatch[1].length >= 30) {
        title = punctMatch[1];
      } else {
        const lastSpace = firstLine.slice(0, 135).lastIndexOf(' ');
        if (lastSpace > 30) {
          title = firstLine.slice(0, lastSpace) + '...';
        } else {
          title = firstLine.slice(0, 135) + '...';
        }
      }
    }

    content = title.trim();

    if (!notes) {
      notes = fullText;
    } else if (!notes.includes(fullText)) {
      notes = `${fullText}\n\n${notes}`;
    }
  }

  return { content, notes };
};

export const createTask = (moduleId, columnId, data) => {
  const { module, board } = getModuleBoard(moduleId);
  const column = board.columns[columnId] || board.columns[board.columnOrder[0]];
  if (!column) throw new TaskOpError(`Module không có bảng nào để thêm việc.`);

  const { content, notes } = sanitizeTaskTitleAndNotes(data.content, data.notes);

  const newId = `${moduleId}-task-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const code = nextTaskCode(board.tasks, module.code || module.id);
  const task = {
    id: newId,
    moduleId,
    code,
    content,
    notes,
    priority: data.priority || 'medium',
    startDate: data.startDate || null,
    dueDate: data.dueDate || null,
    assignee: data.assignee || null,
    checklist: data.checklist || [],
    progress: data.progress ?? 0,
    blocked: { isBlocked: false, reason: '', blockedAt: null },
    dependsOn: data.dependsOn || null,
    pdca: data.pdca || { plan: '', do: '', check: '', act: '' },
    documents: data.documents || [],
    tags: data.tags || [],
    coverColor: data.coverColor || null,
    estimateMinutes: data.estimateMinutes ?? null,
    actualMinutes: 0,
    createdAt: Date.now()
  };

  const nextBoard = {
    ...board,
    tasks: { ...board.tasks, [newId]: task },
    columns: { ...board.columns, [column.id]: { ...column, taskIds: [newId, ...column.taskIds] } }
  };
  applyServerBoard(moduleId, nextBoard);
  emitDataChanged(moduleId);
  syncInBackground(moduleId, jsonFetch(`${API_BASE}/api/modules/${encodeURIComponent(moduleId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ columnId: column.id, id: newId, code, ...data })
  }));
  return { module, task, board: nextBoard };
};

export const updateTask = (moduleId, taskId, patch) => {
  const { module, board } = getModuleBoard(moduleId);
  const existing = board.tasks[taskId];
  if (!existing) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const task = { ...existing, ...patch };
  const nextBoard = { ...board, tasks: { ...board.tasks, [taskId]: task } };
  applyServerBoard(moduleId, nextBoard);
  emitDataChanged(moduleId);
  syncInBackground(moduleId, jsonFetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ moduleId, patch })
  }));
  return { module, task, board: nextBoard };
};

export const archiveTask = (moduleId, taskId) => {
  return updateTask(moduleId, taskId, { archived: true, archivedAt: Date.now() });
};

export const unarchiveTask = (moduleId, taskId) => {
  return updateTask(moduleId, taskId, { archived: false, archivedAt: null });
};

export const deleteTask = (moduleId, taskId) => {
  const { module, board } = getModuleBoard(moduleId);
  if (!board.tasks[taskId]) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const nextBoard = stripTaskEverywhere(board, taskId);
  applyServerBoard(moduleId, nextBoard);
  emitDataChanged(moduleId);
  syncInBackground(moduleId, jsonFetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ moduleId })
  }));
  return { module, board: nextBoard };
};

export const moveTask = (moduleId, taskId, toColumnId, toIndex) => {
  const { module, board } = getModuleBoard(moduleId);
  if (!board.tasks[taskId]) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const toColumn = board.columns[toColumnId];
  if (!toColumn) throw new TaskOpError(`Không tìm thấy bảng "${toColumnId}".`);

  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([id, col]) => [id, { ...col, taskIds: col.taskIds.filter(t => t !== taskId) }])
  );
  const targetIds = Array.from(columns[toColumnId].taskIds);
  const insertAt = typeof toIndex === 'number' ? Math.min(Math.max(toIndex, 0), targetIds.length) : targetIds.length;
  targetIds.splice(insertAt, 0, taskId);
  columns[toColumnId] = { ...columns[toColumnId], taskIds: targetIds };

  const nextBoard = { ...board, columns };
  applyServerBoard(moduleId, nextBoard);
  emitDataChanged(moduleId);
  syncInBackground(moduleId, jsonFetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ moduleId, toColumnId, toIndex })
  }));
  return { module, board: nextBoard };
};

export const clearColumn = (moduleId, columnId) => {
  const { module, board } = getModuleBoard(moduleId);
  const column = board.columns[columnId];
  if (!column) throw new TaskOpError(`Không tìm thấy bảng "${columnId}".`);
  const nextBoard = column.taskIds.reduce((acc, id) => stripTaskEverywhere(acc, id), board);
  applyServerBoard(moduleId, nextBoard);
  emitDataChanged(moduleId);
  syncInBackground(moduleId, jsonFetch(`${API_BASE}/api/modules/${encodeURIComponent(moduleId)}/columns/${encodeURIComponent(columnId)}/clear`, {
    method: 'POST'
  }));
  return { module, board: nextBoard, removedCount: column.taskIds.length };
};

export const toggleChecklistItem = (moduleId, taskId, itemId) => {
  const { board } = getModuleBoard(moduleId);
  const task = board.tasks[taskId];
  if (!task) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const checklist = (task.checklist || []).map(item => item.id === itemId ? { ...item, done: !item.done } : item);
  return updateTask(moduleId, taskId, { checklist });
};

export const addChecklistItem = (moduleId, taskId, text) => {
  const { board } = getModuleBoard(moduleId);
  const task = board.tasks[taskId];
  if (!task) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const item = { id: `chk-${Date.now()}`, text, done: false };
  return updateTask(moduleId, taskId, { checklist: [...(task.checklist || []), item] });
};

export const setBlocked = (moduleId, taskId, isBlocked, reason) => {
  if (isBlocked && !reason?.trim()) {
    throw new TaskOpError('Cần nêu lý do khi đánh dấu công việc bị chặn.');
  }
  return updateTask(moduleId, taskId, {
    blocked: { isBlocked, reason: isBlocked ? reason.trim() : '', blockedAt: isBlocked ? Date.now() : null }
  });
};
