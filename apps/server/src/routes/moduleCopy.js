import { db } from '../db/client.js';
import { DEFAULT_COLUMNS } from '../orchestrator/serverTaskOps.js';
import { getModuleKvData, setModuleKvData } from '../db/moduleKv.js';
import { readStructure } from './structure.js';

const newId = (prefix) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;

// Sao chép 1 module sang 1 dự án (group) khác: tạo module MỚI (không đụng
// module gốc), copy khung thẻ đầu việc (nội dung/ghi chú/checklist/tag/
// tài liệu đính kèm) nhưng LUÔN reset tiến độ/người phụ trách/ngày hạn/
// trạng thái chặn/lịch sử agent run - đây là "nhân bản quy trình mẫu", không
// phải di chuyển công việc đang chạy dở. Case Study cũng được copy làm
// template. Toàn bộ trong 1 transaction để không tạo module rỗng nếu giữa
// chừng lỗi.
function copyModule(sourceModuleId, { targetGroupId, code, title }) {
  const sourceModule = db.prepare('SELECT * FROM modules WHERE id = ?').get(sourceModuleId);
  if (!sourceModule) throw new Error(`Không tìm thấy module nguồn "${sourceModuleId}".`);

  const targetGroup = db.prepare('SELECT * FROM groups WHERE id = ?').get(targetGroupId);
  if (!targetGroup) throw new Error(`Không tìm thấy dự án đích "${targetGroupId}".`);

  const trimmedCode = (code || '').trim();
  const trimmedTitle = (title || '').trim();
  if (!trimmedCode || !trimmedTitle) throw new Error('Thiếu mã hoặc tên cho module mới.');

  const codeTaken = db.prepare('SELECT 1 FROM modules WHERE LOWER(code) = LOWER(?)').get(trimmedCode);
  if (codeTaken) throw new Error(`Mã "${trimmedCode}" đã được dùng cho module khác.`);

  const newModuleId = newId('mod');

  const tx = db.transaction(() => {
    const { maxSort } = db.prepare('SELECT MAX(sort_order) AS maxSort FROM modules WHERE group_id = ?').get(targetGroupId);
    db.prepare(`
      INSERT INTO modules (id, group_id, code, title, description, details, sort_order, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newModuleId, targetGroupId, trimmedCode, trimmedTitle, sourceModule.description || '', sourceModule.details || '', (maxSort ?? -1) + 1, sourceModule.type || 'product');

    const insertColumn = db.prepare('INSERT INTO columns (id, module_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)');
    DEFAULT_COLUMNS.forEach(([id, colTitle, colDescription], ci) => insertColumn.run(id, newModuleId, colTitle, colDescription, ci));

    const sourceTasks = db.prepare('SELECT * FROM tasks WHERE module_id = ? ORDER BY column_id, position').all(sourceModuleId);
    const insertTask = db.prepare(`
      INSERT INTO tasks (
        id, module_id, column_id, position, code, content, notes, priority, start_date, due_date,
        assignee_type, assignee_name, checklist_json, progress,
        blocked_is_blocked, blocked_reason, blocked_at, depends_on,
        pdca_plan, pdca_do, pdca_check, pdca_act, documents_json, tags_json,
        agent_run_status, agent_run_agent_id, agent_run_id, agent_run_error, agent_run_updated_at, created_at
      ) VALUES (
        @id, @module_id, @column_id, @position, @code, @content, @notes, @priority, @start_date, @due_date,
        @assignee_type, @assignee_name, @checklist_json, @progress,
        @blocked_is_blocked, @blocked_reason, @blocked_at, @depends_on,
        @pdca_plan, @pdca_do, @pdca_check, @pdca_act, @documents_json, @tags_json,
        @agent_run_status, @agent_run_agent_id, @agent_run_id, @agent_run_error, @agent_run_updated_at, @created_at
      )
    `);

    sourceTasks.forEach((t, i) => {
      const checklist = JSON.parse(t.checklist_json || '[]').map((item) => ({
        ...item,
        id: newId('chk'),
        done: false
      }));
      insertTask.run({
        id: newId(`${newModuleId}-task`),
        module_id: newModuleId,
        column_id: 'todo',
        position: i,
        code: `${trimmedCode}-${String(i + 1).padStart(2, '0')}`,
        content: t.content,
        notes: t.notes || '',
        priority: t.priority || 'medium',
        start_date: null,
        due_date: null,
        assignee_type: null,
        assignee_name: null,
        checklist_json: JSON.stringify(checklist),
        progress: 0,
        blocked_is_blocked: 0,
        blocked_reason: '',
        blocked_at: null,
        depends_on: null,
        pdca_plan: '',
        pdca_do: '',
        pdca_check: '',
        pdca_act: '',
        documents_json: t.documents_json || '[]',
        tags_json: t.tags_json || '[]',
        agent_run_status: 'none',
        agent_run_agent_id: null,
        agent_run_id: null,
        agent_run_error: null,
        agent_run_updated_at: null,
        created_at: Date.now()
      });
    });

    const caseStudies = getModuleKvData('module_case_studies', sourceModuleId);
    if (caseStudies && Object.keys(caseStudies).length > 0) {
      setModuleKvData('module_case_studies', newModuleId, caseStudies);
    }
  });
  tx();

  return newModuleId;
}

export default async function moduleCopyRoutes(fastify) {
  fastify.post('/api/modules/:id/copy', async (request, reply) => {
    try {
      copyModule(request.params.id, request.body || {});
      reply.send(readStructure());
    } catch (err) {
      reply.code(400).send({ error: err.message });
    }
  });
}
