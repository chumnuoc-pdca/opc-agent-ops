import { db } from '../db/client.js';
import { resumeAgentTurn } from '../orchestrator/agentOrchestrator.js';
import { findModuleAgent, updateTaskRunState, finalizeRun } from '../worker/index.js';
import { AI_CONFIG } from '../config.js';

export default async function agentRunRoutes(fastify) {
  // Nhật ký đánh giá (Phase 4, plan §6): danh sách mọi lần agent thực thi,
  // kèm mã/nội dung công việc để hiển thị mà không cần gọi thêm request.
  fastify.get('/api/agent-runs', async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 200, 500);
    const rows = db.prepare(`
      SELECT ar.*, t.code AS task_code, t.content AS task_content, t.module_id AS task_module_id
      FROM agent_runs ar
      LEFT JOIN tasks t ON t.id = ar.task_id
      ORDER BY ar.created_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      taskCode: row.task_code,
      taskContent: row.task_content,
      moduleId: row.task_module_id,
      agentId: row.agent_id,
      status: row.status,
      roundCount: row.round_count,
      errorText: row.error_text,
      evalScore: row.eval_score,
      evalNotes: row.eval_notes,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at
    }));
  });

  fastify.get('/api/agent-runs/:id', async (request, reply) => {
    const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Không tìm thấy agent run.' });
    return {
      id: row.id,
      taskId: row.task_id,
      agentId: row.agent_id,
      status: row.status,
      roundCount: row.round_count,
      transcript: JSON.parse(row.transcript_json || '[]'),
      pendingToolCall: row.pending_tool_call_json ? JSON.parse(row.pending_tool_call_json) : null,
      errorText: row.error_text,
      evalScore: row.eval_score,
      evalNotes: row.eval_notes,
      startedAt: row.started_at,
      endedAt: row.ended_at
    };
  });

  fastify.patch('/api/agent-runs/:id', async (request, reply) => {
    const { evalScore, evalNotes } = request.body || {};
    const exists = db.prepare('SELECT 1 FROM agent_runs WHERE id = ?').get(request.params.id);
    if (!exists) return reply.code(404).send({ error: 'Không tìm thấy agent run.' });
    db.prepare('UPDATE agent_runs SET eval_score = ?, eval_notes = ? WHERE id = ?')
      .run(evalScore ?? null, evalNotes ?? '', request.params.id);
    reply.send({ ok: true });
  });

  // Duyệt/Từ chối tool R2/R3 đang tạm dừng, resume đúng chỗ dừng của agent.
  fastify.post('/api/tasks/:id/agent-run/resume', async (request, reply) => {
    const taskId = request.params.id;
    const { approved } = request.body || {};
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!taskRow) return reply.code(404).send({ error: 'Không tìm thấy công việc.' });
    if (!taskRow.agent_run_id) return reply.code(400).send({ error: 'Công việc này chưa có agent run nào.' });

    const runRow = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(taskRow.agent_run_id);
    if (!runRow) return reply.code(404).send({ error: 'Không tìm thấy agent run.' });
    if (runRow.status !== 'awaiting_approval') {
      return reply.code(400).send({ error: `Run này không ở trạng thái chờ duyệt (đang là "${runRow.status}").` });
    }

    const agentDef = findModuleAgent(taskRow.module_id);
    if (!agentDef) return reply.code(500).send({ error: 'Không tìm thấy agent phụ trách module này.' });

    const pending = JSON.parse(runRow.pending_tool_call_json);
    const messages = JSON.parse(runRow.transcript_json || '[]');

    updateTaskRunState(taskId, { agent_run_status: 'running', agent_run_updated_at: Date.now() });

    let result;
    try {
      result = await resumeAgentTurn({
        baseUrl: AI_CONFIG.baseUrl,
        apiKey: AI_CONFIG.apiKey,
        model: agentDef.model || AI_CONFIG.model,
        temperature: agentDef.temperature ?? AI_CONFIG.temperature,
        messages,
        pendingBatch: pending.pendingBatch,
        approved: Boolean(approved),
        allowedToolNames: agentDef.allowedTools,
        actorType: 'agent',
        agentRunId: runRow.id,
        roundsUsed: runRow.round_count || 0
      });
    } catch (err) {
      result = { status: 'error', messages, error: err.message };
    }

    finalizeRun(runRow.id, taskRow, result);
    reply.send({ ok: true, status: result.status });
  });
}
