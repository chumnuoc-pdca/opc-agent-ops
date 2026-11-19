// Phase 12: theo dõi thời gian thật (Start/Stop) - cùng phong cách row-level
// SQL trực tiếp như serverTaskOps.js (không "đọc cả board rồi ghi lại cả
// board"), vì time_entries là bảng độc lập, không nằm trong board JSON.
import { db } from '../db/client.js';
import { rowToTask } from '../routes/boards.js';
import { TaskOpError } from './serverTaskOps.js';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;

const getTaskRow = (taskId) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
const getPersonnelRow = (personnelId) => db.prepare('SELECT * FROM personnel WHERE id = ?').get(personnelId);
const getActiveEntryRow = (personnelId) =>
  db.prepare('SELECT * FROM time_entries WHERE personnel_id = ? AND ended_at IS NULL').get(personnelId);

// Dừng 1 phiên đang chạy (dùng chung bởi stopTimer và startTimer's auto-switch
// - xem TIME-03: bắt đầu task mới trong lúc đang chạy task khác thì tự dừng
// phiên cũ, không tạo 2 phiên ngầm).
const closeEntry = (entryRow) => {
  const endedAt = Date.now();
  const durationSeconds = Math.max(0, Math.round((endedAt - entryRow.started_at) / 1000));
  db.prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?')
    .run(endedAt, durationSeconds, entryRow.id);

  const durationMinutes = Math.round(durationSeconds / 60);
  if (durationMinutes > 0) {
    db.prepare('UPDATE tasks SET actual_minutes = actual_minutes + ? WHERE id = ?')
      .run(durationMinutes, entryRow.task_id);
  }
  return { ...entryRow, ended_at: endedAt, duration_seconds: durationSeconds };
};

export const rowToTimeEntry = (row) => ({
  id: row.id,
  taskId: row.task_id,
  personnelId: row.personnel_id,
  startedAt: row.started_at,
  endedAt: row.ended_at || null,
  durationSeconds: row.duration_seconds ?? null,
  note: row.note || '',
  createdAt: row.created_at
});

// Bắt đầu 1 phiên cho `personnelId` trên `taskId`. Nếu personnel này đang có
// phiên khác chạy, tự dừng phiên đó trước (auto-switch, không hỏi lại) rồi
// mới mở phiên mới - giữ đúng ràng buộc unique-index "tối đa 1 phiên active/
// personnel" ở tầng DB.
export const startTimer = (taskId, personnelId) => {
  const taskRow = getTaskRow(taskId);
  if (!taskRow) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const personnel = getPersonnelRow(personnelId);
  if (!personnel) throw new TaskOpError(`Không tìm thấy nhân sự "${personnelId}".`);

  const existingActive = getActiveEntryRow(personnelId);
  let previousTask = null;
  if (existingActive) {
    if (existingActive.task_id === taskId) {
      // Đã đang chạy đúng task này rồi - trả về nguyên trạng, không tạo phiên trùng.
      return { activeEntry: rowToTimeEntry(existingActive), task: rowToTask(taskRow), previousTask: null };
    }
    closeEntry(existingActive);
    const previousTaskRow = getTaskRow(existingActive.task_id);
    if (previousTaskRow) previousTask = rowToTask(previousTaskRow);
  }

  const id = genId('time');
  const now = Date.now();
  db.prepare(`
    INSERT INTO time_entries (id, task_id, personnel_id, started_at, ended_at, duration_seconds, note, created_at)
    VALUES (@id, @task_id, @personnel_id, @started_at, NULL, NULL, '', @created_at)
  `).run({ id, task_id: taskId, personnel_id: personnelId, started_at: now, created_at: now });

  const entryRow = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  const freshTaskRow = getTaskRow(taskId);
  return { activeEntry: rowToTimeEntry(entryRow), task: rowToTask(freshTaskRow), previousTask };
};

// Dừng phiên đang chạy của `personnelId` (không cần truyền taskId - tối đa
// 1 phiên active/personnel nên không cần chọn).
export const stopTimer = (personnelId) => {
  const personnel = getPersonnelRow(personnelId);
  if (!personnel) throw new TaskOpError(`Không tìm thấy nhân sự "${personnelId}".`);
  const activeRow = getActiveEntryRow(personnelId);
  if (!activeRow) throw new TaskOpError('Không có phiên nào đang chạy để dừng.');

  const stopped = closeEntry(activeRow);
  const taskRow = getTaskRow(activeRow.task_id);
  return { stoppedEntry: rowToTimeEntry(stopped), task: rowToTask(taskRow) };
};

// Dùng cho thanh timer toàn cục - trả kèm thông tin task/module rút gọn để
// hiện ngay không cần fetch thêm board.
export const getActiveEntryForPersonnel = (personnelId) => {
  const activeRow = getActiveEntryRow(personnelId);
  if (!activeRow) return { activeEntry: null, task: null, module: null };
  const taskRow = getTaskRow(activeRow.task_id);
  if (!taskRow) return { activeEntry: null, task: null, module: null };
  const moduleRow = db.prepare('SELECT id, code, title FROM modules WHERE id = ?').get(taskRow.module_id);
  return {
    activeEntry: rowToTimeEntry(activeRow),
    task: rowToTask(taskRow),
    module: moduleRow ? { id: moduleRow.id, code: moduleRow.code, title: moduleRow.title } : null
  };
};

export const listTimeEntriesForTask = (taskId) => {
  const rows = db.prepare(`
    SELECT te.*, p.name AS personnel_name, p.type AS personnel_type
    FROM time_entries te
    JOIN personnel p ON p.id = te.personnel_id
    WHERE te.task_id = ?
    ORDER BY te.started_at DESC
  `).all(taskId);
  return rows.map((row) => ({ ...rowToTimeEntry(row), personnelName: row.personnel_name, personnelType: row.personnel_type }));
};
