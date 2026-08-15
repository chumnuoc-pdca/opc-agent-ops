// Seed DB từ đúng nguồn INITIAL_MODULES/buildModuleBoardState của frontend fork
// (không viết lại logic seed lần 2 — import thẳng từ apps/web để tránh lệch dữ liệu).
import { db, runMigrations } from './client.js';
import {
  INITIAL_MODULES,
  DEFAULT_COLUMNS,
  buildModuleBoardState
} from '../../../web/src/data/initialData.js';

runMigrations();

const alreadySeeded = db.prepare('SELECT COUNT(*) AS c FROM groups').get().c > 0;
if (alreadySeeded) {
  console.log('DB đã có dữ liệu — bỏ qua seed. Xoá data/opc.db nếu muốn seed lại từ đầu.');
  process.exit(0);
}

const insertGroup = db.prepare(
  'INSERT INTO groups (id, title, code, accent, sort_order) VALUES (@id, @title, @code, @accent, @sort_order)'
);
const insertModule = db.prepare(
  `INSERT INTO modules (id, group_id, code, title, description, details, accent, agent_id, sort_order)
   VALUES (@id, @group_id, @code, @title, @description, @details, @accent, @agent_id, @sort_order)`
);
const insertColumn = db.prepare(
  'INSERT INTO columns (id, module_id, title, description, sort_order) VALUES (@id, @module_id, @title, @description, @sort_order)'
);
const insertTask = db.prepare(`
  INSERT INTO tasks (
    id, module_id, column_id, position, code, content, notes, priority, start_date, due_date,
    assignee_type, assignee_name, checklist_json, progress,
    blocked_is_blocked, blocked_reason, blocked_at, depends_on,
    pdca_plan, pdca_do, pdca_check, pdca_act, documents_json, tags_json, created_at
  ) VALUES (
    @id, @module_id, @column_id, @position, @code, @content, @notes, @priority, @start_date, @due_date,
    @assignee_type, @assignee_name, @checklist_json, @progress,
    @blocked_is_blocked, @blocked_reason, @blocked_at, @depends_on,
    @pdca_plan, @pdca_do, @pdca_check, @pdca_act, @documents_json, @tags_json, @created_at
  )
`);

const seedAll = db.transaction(() => {
  INITIAL_MODULES.forEach((group, gi) => {
    insertGroup.run({ id: group.id, title: group.title, code: group.code || null, accent: group.accent || null, sort_order: gi });

    group.modules.forEach((module, mi) => {
      insertModule.run({
        id: module.id,
        group_id: group.id,
        code: module.code || module.id,
        title: module.title,
        description: module.description || '',
        details: module.details || '',
        accent: group.accent || null,
        agent_id: null, // Phase 1 sẽ gán agent_id khi có agents/*.md tương ứng
        sort_order: mi
      });

      DEFAULT_COLUMNS.forEach((col, ci) => {
        insertColumn.run({ id: col.id, module_id: module.id, title: col.title, description: col.description, sort_order: ci });
      });

      const board = buildModuleBoardState({ ...module, groupId: group.id, groupTitle: group.title, accent: group.accent });

      board.columnOrder.forEach((columnId) => {
        const column = board.columns[columnId];
        column.taskIds.forEach((taskId, position) => {
          const task = board.tasks[taskId];
          insertTask.run({
            id: task.id,
            module_id: module.id,
            column_id: columnId,
            position,
            code: task.code,
            content: task.content,
            notes: task.notes || '',
            priority: task.priority || 'medium',
            start_date: task.startDate || null,
            due_date: task.dueDate || null,
            assignee_type: task.assignee?.type || null,
            assignee_name: task.assignee?.name || null,
            checklist_json: JSON.stringify(task.checklist || []),
            progress: task.progress ?? 0,
            blocked_is_blocked: task.blocked?.isBlocked ? 1 : 0,
            blocked_reason: task.blocked?.reason || '',
            blocked_at: task.blocked?.blockedAt || null,
            depends_on: task.dependsOn || null,
            pdca_plan: task.pdca?.plan || '',
            pdca_do: task.pdca?.do || '',
            pdca_check: task.pdca?.check || '',
            pdca_act: task.pdca?.act || '',
            documents_json: JSON.stringify(task.documents || []),
            tags_json: JSON.stringify([]),
            created_at: task.createdAt || Date.now()
          });
        });
      });
    });
  });
});

seedAll();

const counts = {
  groups: db.prepare('SELECT COUNT(*) c FROM groups').get().c,
  modules: db.prepare('SELECT COUNT(*) c FROM modules').get().c,
  tasks: db.prepare('SELECT COUNT(*) c FROM tasks').get().c
};
console.log('Seed xong:', counts);
