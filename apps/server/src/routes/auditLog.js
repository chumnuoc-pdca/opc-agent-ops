import { db } from '../db/client.js';

// Đọc nhật ký hành động thật của agent/con người (ghi bởi
// orchestrator/auditLog.js) - thay cho utils/auditLog.js cũ ở frontend vốn
// chỉ lưu localStorage theo từng tab, không thấy được việc worker làm nền.
export default async function auditLogRoutes(fastify) {
  fastify.get('/api/audit-log', async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 300, 1000);
    const taskId = request.query?.taskId || null;
    const rows = taskId
      ? db.prepare(`
        SELECT al.*, t.code AS task_code
        FROM audit_log al
        LEFT JOIN tasks t ON t.id = al.task_id
        WHERE al.task_id = ?
        ORDER BY al.created_at DESC
        LIMIT ?
      `).all(taskId, limit)
      : db.prepare(`
        SELECT al.*, t.code AS task_code
        FROM audit_log al
        LEFT JOIN tasks t ON t.id = al.task_id
        ORDER BY al.created_at DESC
        LIMIT ?
      `).all(limit);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      actorType: row.actor_type,
      action: row.action,
      riskLevel: row.risk_level,
      summary: row.summary,
      status: row.status,
      error: row.error,
      taskId: row.task_id,
      taskCode: row.task_code,
      agentRunId: row.agent_run_id,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null
    }));
  });
}
