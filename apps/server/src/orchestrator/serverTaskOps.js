// Server-side equivalent of apps/web/src/utils/taskOperations.js +
// boardStorage.js's read helpers, combined - but implemented as direct
// row-level SQL (not "read whole board, mutate in JS, write whole board
// back") so concurrent agent runs in Phase 2+ never clobber each other via
// last-write-wins, unlike the frontend's whole-board bridge (see plan §5).
import { db } from '../db/client.js';
import { readBoard, rowToTask } from '../routes/boards.js';

// 4 cột Kanban cố định seed cho MỌI module mới - dùng chung giữa
// routes/structure.js (PUT /api/structure) và routes/moduleCopy.js (POST
// /api/modules/:id/copy) để không lặp lại định nghĩa 2 nơi.
export const DEFAULT_COLUMNS = [
  ['todo', 'Cần làm', 'Công việc đã lên kế hoạch nhưng chưa bắt đầu thực hiện.'],
  ['inProgress', 'Đang làm', 'Công việc đang được thực hiện trong chu kỳ hiện tại.'],
  ['review', 'Đang review', 'Đã có bản nháp/kết quả, đang chờ kiểm tra hoặc phê duyệt.'],
  ['done', 'Hoàn thành', 'Công việc đã hoàn tất và đạt tiêu chuẩn đầu ra.']
];

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (dueDate) => Boolean(dueDate) && dueDate < todayISO();
export const formatShortDate = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

export const getFlatModules = () => {
  const rows = db.prepare(`
    SELECT m.*, g.title AS group_title, g.code AS group_code, g.accent AS group_accent
    FROM modules m JOIN groups g ON g.id = m.group_id
    ORDER BY g.sort_order, m.sort_order
  `).all();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    details: r.details,
    agentId: r.agent_id,
    groupId: r.group_id,
    groupTitle: r.group_title,
    groupCode: r.group_code,
    accent: r.group_accent
  }));
};

export const resolveModuleRef = (ref) => {
  if (!ref) return null;
  const flat = getFlatModules();
  return flat.find((m) => m.id === ref || m.code?.toLowerCase() === String(ref).toLowerCase()) || null;
};

export const loadModuleBoard = (module) => readBoard(module.id);

export const loadAllBoards = (flatModules) =>
  flatModules.map((module) => ({ module, board: loadModuleBoard(module) }));

// Tasks carry their module_id directly, so this is a single indexed lookup -
// no need to scan every board like the browser version does.
export const findTaskLocation = (taskId) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!row) return null;
  const module = resolveModuleRef(row.module_id);
  if (!module) return null;
  return { module, task: rowToTask(row) };
};

export const compactTask = (module, task) => ({
  taskId: task.id,
  code: task.code,
  moduleCode: module.code,
  moduleTitle: module.title,
  content: task.content.length > 140 ? `${task.content.slice(0, 140)}…` : task.content,
  priority: task.priority,
  progress: task.progress,
  dueDate: task.dueDate,
  overdue: isOverdue(task.dueDate),
  isBlocked: Boolean(task.blocked?.isBlocked),
  assignee: task.assignee ? `${task.assignee.type === 'agent' ? 'AI: ' : ''}${task.assignee.name}` : null,
  tags: task.tags || []
});

// MAX-based, not count-based: COUNT(*) breaks the moment any task in the
// module has ever been deleted (count drops, so count+1 reuses a number a
// surviving task still holds -> duplicate code). Scan for the highest
// existing numeric suffix under this exact prefix instead - safe regardless
// of deletions/gaps.
const nextTaskCode = (moduleId, moduleCode) => {
  const rows = db.prepare('SELECT code FROM tasks WHERE module_id = ?').all(moduleId);
  const prefix = `${moduleCode}-`;
  let maxNum = 0;
  rows.forEach(({ code }) => {
    if (code) {
      let n = NaN;
      if (code.startsWith(prefix)) {
        n = parseInt(code.slice(prefix.length), 10);
      } else {
        const parts = code.split('-');
        n = parseInt(parts[parts.length - 1], 10);
      }
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `${moduleCode}-${String(maxNum + 1).padStart(2, '0')}`;
};

const nextPositionInColumn = (moduleId, columnId) => {
  const row = db.prepare('SELECT MAX(position) AS maxPos FROM tasks WHERE module_id = ? AND column_id = ?').get(moduleId, columnId);
  return (row?.maxPos ?? -1) + 1;
};

// New tasks should land at the TOP of the column (most recently created =
// most visible), not the bottom - shift every existing task in that column
// down by 1 and hand back position 0 for the new row.
const frontPositionInColumn = (moduleId, columnId) => {
  db.prepare('UPDATE tasks SET position = position + 1 WHERE module_id = ? AND column_id = ?').run(moduleId, columnId);
  return 0;
};

export class TaskOpError extends Error {}

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

// `data.id`/`data.code` are accepted (not just auto-generated) so the human
// UI's optimistic local task (see apps/web/src/utils/taskOperations.js) and
// the row this creates server-side end up with the SAME id/code - otherwise
// the client's in-memory cache and the DB would diverge on every create.
// The AI tool executor (aiTools.js) never passes these, so it still gets a
// freshly generated id/code as before.
export const createTask = (moduleId, columnId, data) => {
  const module = resolveModuleRef(moduleId);
  if (!module) throw new TaskOpError(`Không tìm thấy module "${moduleId}".`);
  const columnExists = db.prepare('SELECT 1 FROM columns WHERE module_id = ? AND id = ?').get(moduleId, columnId);
  const targetColumn = columnExists ? columnId : db.prepare('SELECT id FROM columns WHERE module_id = ? ORDER BY sort_order LIMIT 1').get(moduleId)?.id;
  if (!targetColumn) throw new TaskOpError('Module không có bảng nào để thêm việc.');

  const { content, notes } = sanitizeTaskTitleAndNotes(data.content, data.notes);

  const id = data.id || `${moduleId}-task-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const code = data.code || nextTaskCode(moduleId, module.code || moduleId);
  const position = frontPositionInColumn(moduleId, targetColumn);
  const now = data.createdAt || Date.now();
  const pdca = data.pdca || {};
  const blocked = data.blocked || {};

  db.prepare(`
    INSERT INTO tasks (
      id, module_id, column_id, position, code, content, notes, priority, start_date, due_date,
      assignee_type, assignee_name, checklist_json, progress,
      blocked_is_blocked, blocked_reason, blocked_at, depends_on,
      pdca_plan, pdca_do, pdca_check, pdca_act, documents_json, tags_json, cover_color, created_at
    ) VALUES (
      @id, @module_id, @column_id, @position, @code, @content, @notes, @priority, @start_date, @due_date,
      @assignee_type, @assignee_name, @checklist_json, @progress,
      @blocked_is_blocked, @blocked_reason, @blocked_at, @depends_on,
      @pdca_plan, @pdca_do, @pdca_check, @pdca_act, @documents_json, @tags_json, @cover_color, @created_at
    )
  `).run({
    id,
    module_id: moduleId,
    column_id: targetColumn,
    position,
    code,
    content,
    notes,
    priority: data.priority || 'medium',
    start_date: data.startDate || null,
    due_date: data.dueDate || null,
    assignee_type: data.assignee?.type || null,
    assignee_name: data.assignee?.name || null,
    checklist_json: JSON.stringify(data.checklist || []),
    progress: data.progress ?? 0,
    blocked_is_blocked: blocked.isBlocked ? 1 : 0,
    blocked_reason: blocked.reason || '',
    blocked_at: blocked.blockedAt || null,
    depends_on: data.dependsOn || null,
    pdca_plan: pdca.plan || '',
    pdca_do: pdca.do || '',
    pdca_check: pdca.check || '',
    pdca_act: pdca.act || '',
    documents_json: JSON.stringify(data.documents || []),
    tags_json: JSON.stringify(data.tags || []),
    cover_color: data.coverColor || null,
    created_at: now
  });

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return { module, task: rowToTask(row) };
};

const PATCH_COLUMN_MAP = {
  content: 'content',
  notes: 'notes',
  priority: 'priority',
  startDate: 'start_date',
  dueDate: 'due_date',
  progress: 'progress',
  dependsOn: 'depends_on',
  coverColor: 'cover_color'
};

export const updateTask = (moduleId, taskId, patch) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND module_id = ?').get(taskId, moduleId);
  if (!existing) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);

  const sets = [];
  const params = { id: taskId };
  Object.entries(PATCH_COLUMN_MAP).forEach(([jsKey, col]) => {
    if (patch[jsKey] !== undefined) {
      sets.push(`${col} = @${col}`);
      params[col] = patch[jsKey];
    }
  });
  if (patch.assignee !== undefined) {
    sets.push('assignee_type = @assignee_type', 'assignee_name = @assignee_name');
    params.assignee_type = patch.assignee?.type || null;
    params.assignee_name = patch.assignee?.name || null;
  }
  if (patch.blocked !== undefined) {
    sets.push('blocked_is_blocked = @blocked_is_blocked', 'blocked_reason = @blocked_reason', 'blocked_at = @blocked_at');
    params.blocked_is_blocked = patch.blocked?.isBlocked ? 1 : 0;
    params.blocked_reason = patch.blocked?.reason || '';
    params.blocked_at = patch.blocked?.blockedAt || null;
  }
  if (patch.checklist !== undefined) {
    sets.push('checklist_json = @checklist_json');
    params.checklist_json = JSON.stringify(patch.checklist);
  }
  if (patch.documents !== undefined) {
    sets.push('documents_json = @documents_json');
    params.documents_json = JSON.stringify(patch.documents);
  }
  if (patch.pdca !== undefined) {
    sets.push('pdca_plan = @pdca_plan', 'pdca_do = @pdca_do', 'pdca_check = @pdca_check', 'pdca_act = @pdca_act');
    params.pdca_plan = patch.pdca.plan || '';
    params.pdca_do = patch.pdca.do || '';
    params.pdca_check = patch.pdca.check || '';
    params.pdca_act = patch.pdca.act || '';
  }
  if (patch.tags !== undefined) {
    sets.push('tags_json = @tags_json');
    params.tags_json = JSON.stringify(patch.tags || []);
  }
  if (patch.archived !== undefined) {
    sets.push('archived = @archived', 'archived_at = @archived_at');
    params.archived = patch.archived ? 1 : 0;
    params.archived_at = patch.archived ? (patch.archivedAt || Date.now()) : null;
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }

  const module = resolveModuleRef(moduleId);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return { module, task: rowToTask(row) };
};

// Reassigns 0..N-1 positions to `orderedIds` within 1 column - a targeted
// re-index scoped to that single column only, not a whole-board rewrite.
const reindexColumn = (moduleId, columnId, orderedIds) => {
  const stmt = db.prepare('UPDATE tasks SET column_id = ?, position = ? WHERE id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => stmt.run(columnId, i, id));
  });
  tx();
};

export const moveTask = (moduleId, taskId, toColumnId, toIndex) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND module_id = ?').get(taskId, moduleId);
  if (!existing) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const columnExists = db.prepare('SELECT 1 FROM columns WHERE module_id = ? AND id = ?').get(moduleId, toColumnId);
  if (!columnExists) throw new TaskOpError(`Không tìm thấy bảng "${toColumnId}".`);

  if (typeof toIndex !== 'number') {
    const position = nextPositionInColumn(moduleId, toColumnId);
    db.prepare('UPDATE tasks SET column_id = ?, position = ? WHERE id = ?').run(toColumnId, position, taskId);
  } else {
    // Precise drag-drop position: re-index just the target column (source
    // column, if different, loses the row naturally via the WHERE below).
    const targetIds = db.prepare('SELECT id FROM tasks WHERE module_id = ? AND column_id = ? AND id != ? ORDER BY position')
      .all(moduleId, toColumnId, taskId).map((r) => r.id);
    const insertAt = Math.min(Math.max(toIndex, 0), targetIds.length);
    targetIds.splice(insertAt, 0, taskId);
    reindexColumn(moduleId, toColumnId, targetIds);
  }

  const module = resolveModuleRef(moduleId);
  const board = readBoard(moduleId);
  return { module, board };
};

export const deleteTask = (moduleId, taskId) => {
  const existing = db.prepare('SELECT 1 FROM tasks WHERE id = ? AND module_id = ?').get(taskId, moduleId);
  if (!existing) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  db.prepare('UPDATE tasks SET depends_on = NULL WHERE depends_on = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
};

export const clearColumn = (moduleId, columnId) => {
  const columnExists = db.prepare('SELECT 1 FROM columns WHERE module_id = ? AND id = ?').get(moduleId, columnId);
  if (!columnExists) throw new TaskOpError(`Không tìm thấy bảng "${columnId}".`);
  const ids = db.prepare('SELECT id FROM tasks WHERE module_id = ? AND column_id = ?').all(moduleId, columnId).map((r) => r.id);
  const tx = db.transaction(() => {
    ids.forEach((id) => {
      db.prepare('UPDATE tasks SET depends_on = NULL WHERE depends_on = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });
  });
  tx();
  const module = resolveModuleRef(moduleId);
  const board = readBoard(moduleId);
  return { module, board, removedCount: ids.length };
};

export const addChecklistItem = (moduleId, taskId, text) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND module_id = ?').get(taskId, moduleId);
  if (!row) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const checklist = JSON.parse(row.checklist_json || '[]');
  checklist.push({ id: `chk-${Date.now()}`, text, done: false });
  db.prepare('UPDATE tasks SET checklist_json = ? WHERE id = ?').run(JSON.stringify(checklist), taskId);
  const module = resolveModuleRef(moduleId);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return { module, task: rowToTask(updated) };
};

export const toggleChecklistItem = (moduleId, taskId, itemId) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND module_id = ?').get(taskId, moduleId);
  if (!row) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const checklist = JSON.parse(row.checklist_json || '[]').map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item
  );
  db.prepare('UPDATE tasks SET checklist_json = ? WHERE id = ?').run(JSON.stringify(checklist), taskId);
  const module = resolveModuleRef(moduleId);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return { module, task: rowToTask(updated) };
};

export const setBlocked = (moduleId, taskId, isBlocked, reason) => {
  if (isBlocked && !reason?.trim()) throw new TaskOpError('Cần nêu lý do khi đánh dấu bị chặn.');
  const existing = db.prepare('SELECT blocked_at FROM tasks WHERE id = ? AND module_id = ?').get(taskId, moduleId);
  if (!existing) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  db.prepare('UPDATE tasks SET blocked_is_blocked = ?, blocked_reason = ?, blocked_at = ? WHERE id = ?').run(
    isBlocked ? 1 : 0,
    isBlocked ? reason.trim() : '',
    isBlocked ? (existing.blocked_at || Date.now()) : null,
    taskId
  );
  const module = resolveModuleRef(moduleId);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return { module, task: rowToTask(updated) };
};
