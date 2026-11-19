// Phase 15: CRUD cho time_blocks - "khoảng dự kiến làm việc" kéo-thả trên
// lưới giờ, tách biệt hoàn toàn task.due_date (xem schema.sql). Cùng phong
// cách row-level SQL trực tiếp như timeTrackingOps.js/notesOps.js.
import { db } from '../db/client.js';
import { TaskOpError } from './serverTaskOps.js';

const genId = () => `tb-${Date.now()}-${Math.round(Math.random() * 1000)}`;

const rowToTimeBlock = (row) => ({
  id: row.id,
  taskId: row.task_id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  createdAt: row.created_at,
  task: {
    id: row.task_id,
    code: row.task_code,
    content: row.task_content,
    priority: row.task_priority,
    moduleId: row.module_id,
    moduleCode: row.module_code,
    moduleAccent: row.group_accent
  }
});

const SELECT_WITH_TASK = `
  SELECT tb.*, t.code AS task_code, t.content AS task_content, t.priority AS task_priority,
         t.module_id AS module_id, m.code AS module_code, g.accent AS group_accent
  FROM time_blocks tb
  JOIN tasks t ON t.id = tb.task_id
  JOIN modules m ON m.id = t.module_id
  JOIN groups g ON g.id = m.group_id
`;

// `dateISO` là ngày theo giờ máy chủ (app này chỉ vận hành 1 múi giờ, không
// có nhu cầu đa múi giờ - xem CLAUDE.md). Lấy mọi block có điểm bắt đầu rơi
// trong đúng ngày đó.
export const listTimeBlocksForDate = (dateISO) => {
  const start = new Date(`${dateISO}T00:00:00`).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  const rows = db.prepare(`${SELECT_WITH_TASK} WHERE tb.starts_at >= ? AND tb.starts_at < ? ORDER BY tb.starts_at`).all(start, end);
  return rows.map(rowToTimeBlock);
};

export const createTimeBlock = (taskId, startsAt, endsAt) => {
  if (!(endsAt > startsAt)) throw new TaskOpError('Giờ kết thúc phải sau giờ bắt đầu.');
  const task = db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId);
  if (!task) throw new TaskOpError(`Không tìm thấy công việc "${taskId}".`);
  const id = genId();
  db.prepare('INSERT INTO time_blocks (id, task_id, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, taskId, startsAt, endsAt, Date.now());
  const row = db.prepare(`${SELECT_WITH_TASK} WHERE tb.id = ?`).get(id);
  return rowToTimeBlock(row);
};

export const updateTimeBlock = (id, { startsAt, endsAt }) => {
  const existing = db.prepare('SELECT * FROM time_blocks WHERE id = ?').get(id);
  if (!existing) throw new TaskOpError(`Không tìm thấy time block "${id}".`);
  const nextStart = startsAt ?? existing.starts_at;
  const nextEnd = endsAt ?? existing.ends_at;
  if (!(nextEnd > nextStart)) throw new TaskOpError('Giờ kết thúc phải sau giờ bắt đầu.');
  db.prepare('UPDATE time_blocks SET starts_at = ?, ends_at = ? WHERE id = ?').run(nextStart, nextEnd, id);
  const row = db.prepare(`${SELECT_WITH_TASK} WHERE tb.id = ?`).get(id);
  return rowToTimeBlock(row);
};

export const deleteTimeBlock = (id) => {
  const existing = db.prepare('SELECT 1 FROM time_blocks WHERE id = ?').get(id);
  if (!existing) throw new TaskOpError(`Không tìm thấy time block "${id}".`);
  db.prepare('DELETE FROM time_blocks WHERE id = ?').run(id);
};
