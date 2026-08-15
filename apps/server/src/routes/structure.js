import { db } from '../db/client.js';
import { DEFAULT_COLUMNS } from '../orchestrator/serverTaskOps.js';

// Trả về đúng shape INITIAL_MODULES cũ: groups[] với modules[] lồng bên trong,
// để frontend (flattenGroups, Sidebar, Board...) không cần đổi gì. Export vì
// routes/moduleCopy.js cũng cần trả cấu trúc mới nhất sau khi sao chép module.
export function readStructure() {
  const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order').all();
  const modules = db.prepare('SELECT * FROM modules ORDER BY sort_order').all();
  const modulesByGroup = new Map();
  modules.forEach((m) => {
    const list = modulesByGroup.get(m.group_id) || [];
    list.push({ id: m.id, code: m.code, title: m.title, description: m.description, details: m.details, type: m.type || 'product' });
    modulesByGroup.set(m.group_id, list);
  });
  return groups.map((g) => ({
    id: g.id,
    title: g.title,
    code: g.code,
    accent: g.accent,
    logoUrl: g.logo_url || null,
    customAccentColor: g.custom_accent_color || null,
    coverUrl: g.cover_url || null,
    description: g.description || '',
    modules: modulesByGroup.get(g.id) || []
  }));
}

// Ghi đè toàn bộ cấu trúc groups/modules (bridge Phase 0 — giống hệt cách
// structureStorage.js cũ ghi nguyên mảng groups vào localStorage).
function writeStructure(groups) {
  const upsertGroup = db.prepare(`
    INSERT INTO groups (id, title, code, accent, sort_order, logo_url, custom_accent_color, cover_url, description)
    VALUES (@id, @title, @code, @accent, @sort_order, @logo_url, @custom_accent_color, @cover_url, @description)
    ON CONFLICT(id) DO UPDATE SET title=@title, code=@code, accent=@accent, sort_order=@sort_order, logo_url=@logo_url,
      custom_accent_color=@custom_accent_color, cover_url=@cover_url, description=@description
  `);
  const upsertModule = db.prepare(`
    INSERT INTO modules (id, group_id, code, title, description, details, sort_order, type)
    VALUES (@id, @group_id, @code, @title, @description, @details, @sort_order, @type)
    ON CONFLICT(id) DO UPDATE SET group_id=@group_id, code=@code, title=@title, description=@description, details=@details, sort_order=@sort_order, type=@type
  `);
  const defaultColumns = db.prepare('SELECT id, title, description, sort_order FROM columns WHERE module_id = ?');
  const insertColumn = db.prepare('INSERT INTO columns (id, module_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)');

  const knownGroupIds = new Set(groups.map((g) => g.id));
  const knownModuleIds = new Set(groups.flatMap((g) => g.modules.map((m) => m.id)));

  const tx = db.transaction(() => {
    groups.forEach((g, gi) => {
      upsertGroup.run({
        id: g.id, title: g.title, code: g.code || null, accent: g.accent || null, sort_order: gi,
        logo_url: g.logoUrl || null, custom_accent_color: g.customAccentColor || null,
        cover_url: g.coverUrl || null, description: g.description || null
      });
      g.modules.forEach((m, mi) => {
        const modCode = m.code || m.id;
        upsertModule.run({
          id: m.id, group_id: g.id, code: modCode, title: m.title,
          description: m.description || '', details: m.details || '', sort_order: mi,
          type: m.type === 'operation' ? 'operation' : 'product'
        });
        if (defaultColumns.all(m.id).length === 0) {
          DEFAULT_COLUMNS.forEach(([id, title, description], ci) => insertColumn.run(id, m.id, title, description, ci));
        }

        // Cập nhật lại mã thẻ đầu việc (task code) nếu mã module thay đổi
        const updateTaskCode = db.prepare('UPDATE tasks SET code = ? WHERE id = ?');
        const tasks = db.prepare('SELECT id, code FROM tasks WHERE module_id = ? ORDER BY created_at ASC, rowid ASC').all(m.id);
        const prefix = `${modCode}-`;
        tasks.forEach((t, idx) => {
          if (!t.code || !t.code.startsWith(prefix)) {
            let seq = idx + 1;
            if (t.code) {
              const parts = t.code.split('-');
              const num = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(num) && num > 0) seq = num;
            }
            updateTaskCode.run(`${modCode}-${String(seq).padStart(2, '0')}`, t.id);
          }
        });
      });
    });
    // Xoá group/module không còn trong payload (đồng bộ với deleteGroup/deleteModule phía client)
    db.prepare('SELECT id FROM groups').all().forEach((row) => {
      if (!knownGroupIds.has(row.id)) db.prepare('DELETE FROM groups WHERE id = ?').run(row.id);
    });
    db.prepare('SELECT id FROM modules').all().forEach((row) => {
      if (!knownModuleIds.has(row.id)) db.prepare('DELETE FROM modules WHERE id = ?').run(row.id);
    });
  });
  tx();
}

export default async function structureRoutes(fastify) {
  fastify.get('/api/structure', async () => readStructure());

  fastify.put('/api/structure', async (request, reply) => {
    writeStructure(request.body);
    reply.send(readStructure());
  });
}
