import { db } from '../db/client.js';

export const rowToTask = (row) => ({
  id: row.id,
  moduleId: row.module_id,
  code: row.code,
  content: row.content,
  notes: row.notes || '',
  priority: row.priority || 'medium',
  startDate: row.start_date || null,
  dueDate: row.due_date || null,
  assignee: row.assignee_type ? { type: row.assignee_type, name: row.assignee_name } : null,
  checklist: JSON.parse(row.checklist_json || '[]'),
  progress: row.progress ?? 0,
  blocked: { isBlocked: !!row.blocked_is_blocked, reason: row.blocked_reason || '', blockedAt: row.blocked_at || null },
  dependsOn: row.depends_on || null,
  pdca: { plan: row.pdca_plan || '', do: row.pdca_do || '', check: row.pdca_check || '', act: row.pdca_act || '' },
  documents: JSON.parse(row.documents_json || '[]'),
  tags: JSON.parse(row.tags_json || '[]'),
  coverColor: row.cover_color || null,
  estimateMinutes: row.estimate_minutes ?? null,
  actualMinutes: row.actual_minutes ?? 0,
  agentRun: {
    status: row.agent_run_status || 'none',
    agentId: row.agent_run_agent_id || null,
    runId: row.agent_run_id || null,
    error: row.agent_run_error || null,
    updatedAt: row.agent_run_updated_at || null
  },
  archived: !!row.archived,
  archivedAt: row.archived_at || null,
  createdAt: row.created_at
});

export function readBoard(moduleId) {
  const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(moduleId);
  if (!module) return null;
  const columns = db.prepare('SELECT * FROM columns WHERE module_id = ? ORDER BY sort_order').all(moduleId);
  const taskRows = db.prepare('SELECT * FROM tasks WHERE module_id = ? ORDER BY column_id, position').all(moduleId);

  const tasks = {};
  const taskIdsByColumn = {};
  columns.forEach((c) => { taskIdsByColumn[c.id] = []; });
  taskRows.forEach((row) => {
    tasks[row.id] = rowToTask(row);
    if (!taskIdsByColumn[row.column_id]) taskIdsByColumn[row.column_id] = [];
    taskIdsByColumn[row.column_id].push(row.id);
  });

  const columnsObj = {};
  columns.forEach((c) => {
    columnsObj[c.id] = { id: c.id, title: c.title, description: c.description || '', taskIds: taskIdsByColumn[c.id] || [] };
  });

  return {
    tasks,
    description: module.description || '',
    details: module.details || '',
    columns: columnsObj,
    columnOrder: columns.map((c) => c.id)
  };
}

export default async function boardRoutes(fastify) {
  // Dùng 1 lần lúc app boot để hydrate cache trong bộ nhớ (xem apps/web/src/utils/boardStorage.js).
  fastify.get('/api/boards', async () => {
    const modules = db.prepare('SELECT id FROM modules').all();
    const result = {};
    modules.forEach((m) => { result[m.id] = readBoard(m.id); });
    return result;
  });

  fastify.get('/api/modules/:id/board', async (request, reply) => {
    const board = readBoard(request.params.id);
    if (!board) return reply.code(404).send({ error: 'Module không tồn tại' });
    return board;
  });

  // Phase 2: chỉ sửa 2 cột description/details của module - KHÔNG đụng
  // tasks/columns, nên không thể race với worker nền (khác hẳn PUT nguyên
  // board của Phase 0/1, đã bỏ vì đúng rủi ro đó - xem plan §5).
  fastify.patch('/api/modules/:id/details', async (request, reply) => {
    const moduleId = request.params.id;
    const exists = db.prepare('SELECT 1 FROM modules WHERE id = ?').get(moduleId);
    if (!exists) return reply.code(404).send({ error: 'Module không tồn tại' });
    const { description, details } = request.body || {};
    db.prepare('UPDATE modules SET description = ?, details = ? WHERE id = ?')
      .run(description || '', details || '', moduleId);
    reply.send(readBoard(moduleId));
  });

  fastify.delete('/api/modules/:id/board', async (request, reply) => {
    const moduleId = request.params.id;
    db.prepare('DELETE FROM tasks WHERE module_id = ?').run(moduleId);
    reply.send({ ok: true });
  });
}
