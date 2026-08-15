import { db } from './client.js';

// Helper đọc/ghi dùng chung cho 4 bảng KV giống hệt nhau (module_assets/
// module_case_studies/module_okr/module_finance - mỗi bảng chỉ là
// {module_id, data_json, updated_at}). Dùng lại ở cả routes/moduleKv.js
// (REST cho người dùng) lẫn orchestrator/aiTools.js (tool cho agent).
const selectStmt = {};
const upsertStmt = {};

const stmts = (table) => {
  if (!selectStmt[table]) {
    selectStmt[table] = db.prepare(`SELECT data_json FROM ${table} WHERE module_id = ?`);
    upsertStmt[table] = db.prepare(`
      INSERT INTO ${table} (module_id, data_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(module_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
    `);
  }
  return { select: selectStmt[table], upsert: upsertStmt[table] };
};

export const getModuleKvData = (table, moduleId) => {
  const row = stmts(table).select.get(moduleId);
  return row ? JSON.parse(row.data_json) : {};
};

export const setModuleKvData = (table, moduleId, data) => {
  stmts(table).upsert.run(moduleId, JSON.stringify(data), Date.now());
  return data;
};
