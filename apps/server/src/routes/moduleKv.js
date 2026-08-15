import { db } from '../db/client.js';
import { setModuleKvData } from '../db/moduleKv.js';

// Factory cho 4 bảng KV giống hệt nhau (module_assets/module_case_studies/
// module_okr/module_finance) - mỗi bảng chỉ là { module_id, data_json,
// updated_at }, dùng chung logic đọc-tất-cả / ghi-1-module qua db/moduleKv.js
// (helper này cũng được orchestrator/aiTools.js dùng lại cho các tool agent).
function registerModuleKvRoutes(fastify, { table, listPath, itemPath }) {
  const selectAll = db.prepare(`SELECT module_id, data_json FROM ${table}`);

  fastify.get(listPath, async () => {
    const rows = selectAll.all();
    const result = {};
    rows.forEach((row) => { result[row.module_id] = JSON.parse(row.data_json); });
    return result;
  });

  fastify.put(itemPath, async (request, reply) => {
    const moduleId = request.params.id;
    const exists = db.prepare('SELECT 1 FROM modules WHERE id = ?').get(moduleId);
    if (!exists) return reply.code(404).send({ error: 'Module không tồn tại' });
    return setModuleKvData(table, moduleId, request.body);
  });
}

export default async function moduleKvRoutes(fastify) {
  registerModuleKvRoutes(fastify, { table: 'module_assets', listPath: '/api/assets', itemPath: '/api/modules/:id/assets' });
  registerModuleKvRoutes(fastify, { table: 'module_case_studies', listPath: '/api/case-studies', itemPath: '/api/modules/:id/case-studies' });
  registerModuleKvRoutes(fastify, { table: 'module_okr', listPath: '/api/okr', itemPath: '/api/modules/:id/okr' });
  registerModuleKvRoutes(fastify, { table: 'module_finance', listPath: '/api/finance', itemPath: '/api/modules/:id/finance' });
}
