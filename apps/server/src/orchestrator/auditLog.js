import { db } from '../db/client.js';

// Idempotency lookup (Phase 11): `id` là PRIMARY KEY và bằng đúng
// `requestId` (chính là tool_call.id do LLM sinh ra, ổn định xuyên suốt 1
// lần resume - xem agentOrchestrator.js). Nếu 1 tool R1+ đã ghi THÀNH CÔNG
// với requestId này trước đó (double-click Approve, resume bị gọi lại do
// mạng chập chờn...), trả lại đúng kết quả cũ thay vì chạy lại executeAiTool
// và tạo dữ liệu trùng.
export const findSuccessfulAuditLog = (requestId) => {
  if (!requestId) return null;
  const row = db.prepare('SELECT after_json FROM audit_log WHERE id = ? AND status = ?').get(requestId, 'success');
  if (!row) return null;
  try { return row.after_json ? JSON.parse(row.after_json) : null; } catch { return null; }
};

// Server-side equivalent of apps/web/src/utils/auditLog.js - ghi trực tiếp
// vào bảng audit_log thay vì localStorage, kèm liên kết task_id/agent_run_id
// khi có (dùng làm "nhật ký đánh giá" ở Phase 4 theo plan).
export const appendAuditLog = ({
  actorType = 'agent', action, riskLevel, args, before, after, summary,
  requestId, status, error, taskId, agentRunId
}) => {
  db.prepare(`
    INSERT INTO audit_log (
      id, created_at, actor_type, action, risk_level, args_json, before_json, after_json,
      summary, status, error, task_id, agent_run_id
    ) VALUES (@id, @created_at, @actor_type, @action, @risk_level, @args_json, @before_json, @after_json,
      @summary, @status, @error, @task_id, @agent_run_id)
  `).run({
    id: requestId || `audit-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    created_at: Date.now(),
    actor_type: actorType,
    action,
    risk_level: riskLevel || null,
    args_json: args ? JSON.stringify(args) : null,
    before_json: before ? JSON.stringify(before) : null,
    after_json: after ? JSON.stringify(after) : null,
    summary: summary || '',
    status: status || 'success',
    error: error || null,
    task_id: taskId || null,
    agent_run_id: agentRunId || null
  });
};
