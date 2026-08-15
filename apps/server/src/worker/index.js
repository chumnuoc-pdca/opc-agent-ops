import { db } from '../db/client.js';
import { getAgentById } from '../agents-loader.js';
import { buildSystemPrompt } from '../orchestrator/systemPrompt.js';
import { runAgentTurn } from '../orchestrator/agentOrchestrator.js';
import { extractToolLog } from '../orchestrator/transcript.js';
import { moveTask } from '../orchestrator/serverTaskOps.js';
import { AI_CONFIG } from '../config.js';
import { emitBoardChanged } from '../events.js';

// Bounded-concurrency poll loop (see plan §4/§7 Phase 2) - deliberately not a
// job queue library (BullMQ/Redis) at this scale. SQLite's single-writer
// serialization makes the claim UPDATE atomic across ticks without a
// SELECT ... FOR UPDATE.
const POLL_INTERVAL_MS = 3000;
const MAX_CONCURRENT = 4;
let runningCount = 0;
let timer = null;

const findModuleAgent = (moduleId) => {
  const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(moduleId);
  if (!module?.agent_id) return null;
  return getAgentById(module.agent_id);
};

const claimNextTask = () => {
  const candidate = db.prepare(`
    SELECT * FROM tasks WHERE assignee_type = 'agent' AND agent_run_status = 'none'
    ORDER BY created_at ASC LIMIT 1
  `).get();
  if (!candidate) return null;
  const res = db.prepare(`UPDATE tasks SET agent_run_status = 'queued' WHERE id = ? AND agent_run_status = 'none'`).run(candidate.id);
  if (res.changes === 0) return null; // another tick already claimed it first
  return candidate;
};

const updateTaskRunState = (taskId, patch) => {
  const sets = [];
  const params = { id: taskId };
  Object.entries(patch).forEach(([col, val]) => { sets.push(`${col} = @${col}`); params[col] = val; });
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
};

// Convenience-only column movement (never touches "done" - human-only, see
// plan Context). Best-effort: if the module doesn't have these exact column
// ids, this silently no-ops rather than failing the run.
const tryMoveColumn = (moduleId, taskId, toColumnId) => {
  try { moveTask(moduleId, taskId, toColumnId); } catch { /* column may not exist - fine */ }
};

async function runTaskWithAgent(taskRow) {
  const runId = `run-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const now = Date.now();
  const agentDef = findModuleAgent(taskRow.module_id);

  if (!agentDef) {
    updateTaskRunState(taskRow.id, {
      agent_run_status: 'error',
      agent_run_error: `Không tìm thấy agent phụ trách module "${taskRow.module_id}".`,
      agent_run_updated_at: Date.now()
    });
    return;
  }

  db.prepare(`
    INSERT INTO agent_runs (id, task_id, agent_id, status, round_count, transcript_json, started_at, created_at)
    VALUES (?, ?, ?, 'running', 0, '[]', ?, ?)
  `).run(runId, taskRow.id, agentDef.id, now, now);

  updateTaskRunState(taskRow.id, {
    agent_run_status: 'running', agent_run_agent_id: agentDef.id, agent_run_id: runId, agent_run_updated_at: now
  });
  tryMoveColumn(taskRow.module_id, taskRow.id, 'inProgress');
  emitBoardChanged(taskRow.module_id);

  const systemPrompt = buildSystemPrompt(agentDef);
  const checklist = JSON.parse(taskRow.checklist_json || '[]');
  const userContent = [
    `Mã công việc (taskId) của việc này: ${taskRow.id} (code: ${taskRow.code}). Dùng chính taskId này khi cần gọi tool tham chiếu tới công việc hiện tại (ví dụ fromTaskId của handoff_to_agent).`,
    taskRow.content,
    taskRow.notes ? `Ghi chú: ${taskRow.notes}` : '',
    checklist.length ? `Việc nhỏ cần làm:\n${checklist.map((c) => `- ${c.text}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n');

  let result;
  try {
    result = await runAgentTurn({
      baseUrl: AI_CONFIG.baseUrl,
      apiKey: AI_CONFIG.apiKey,
      model: agentDef.model || AI_CONFIG.model,
      temperature: agentDef.temperature ?? AI_CONFIG.temperature,
      systemPrompt,
      history: [{ role: 'user', content: userContent }],
      allowedToolNames: agentDef.allowedTools,
      actorType: 'agent',
      agentRunId: runId
    });
  } catch (err) {
    result = { status: 'error', messages: [], error: err.message };
  }

  finalizeRun(runId, taskRow, result);
}

function finalizeRun(runId, taskRow, result) {
  const endedAt = Date.now();
  const transcriptJson = JSON.stringify(result.messages || []);

  if (result.status === 'awaiting_approval') {
    db.prepare(`UPDATE agent_runs SET status='awaiting_approval', round_count=?, transcript_json=?, pending_tool_call_json=? WHERE id=?`)
      .run(result.roundCount || 0, transcriptJson, JSON.stringify({ ...result.pendingToolCall, pendingBatch: result.pendingBatch }), runId);
    updateTaskRunState(taskRow.id, { agent_run_status: 'awaiting_approval', agent_run_updated_at: endedAt });
    emitBoardChanged(taskRow.module_id);
    return;
  }

  if (result.status === 'done') {
    const toolLog = extractToolLog(result.messages || []);
    const didHandoff = toolLog.some((t) => t.name === 'handoff_to_agent' && t.result?.ok);
    const finalStatus = didHandoff ? 'awaiting_handoff' : 'done';
    db.prepare(`UPDATE agent_runs SET status=?, round_count=?, transcript_json=?, ended_at=? WHERE id=?`)
      .run(finalStatus, result.roundCount || 0, transcriptJson, endedAt, runId);
    updateTaskRunState(taskRow.id, { agent_run_status: finalStatus, agent_run_updated_at: endedAt });
    tryMoveColumn(taskRow.module_id, taskRow.id, 'review');
    emitBoardChanged(taskRow.module_id);
    return;
  }

  // error | max_rounds
  const errorText = result.error || (result.status === 'max_rounds' ? 'Đạt giới hạn số vòng lặp.' : 'Lỗi không xác định.');
  db.prepare(`UPDATE agent_runs SET status='error', round_count=?, transcript_json=?, error_text=?, ended_at=? WHERE id=?`)
    .run(result.roundCount || 0, transcriptJson, errorText, endedAt, runId);
  updateTaskRunState(taskRow.id, { agent_run_status: 'error', agent_run_error: errorText, agent_run_updated_at: endedAt });
  emitBoardChanged(taskRow.module_id);
}

export function startWorker() {
  if (timer) return;
  timer = setInterval(() => {
    while (runningCount < MAX_CONCURRENT) {
      const task = claimNextTask();
      if (!task) break;
      runningCount += 1;
      runTaskWithAgent(task).finally(() => { runningCount -= 1; });
    }
  }, POLL_INTERVAL_MS);
  console.log(`Worker agent đã khởi động (poll mỗi ${POLL_INTERVAL_MS}ms, tối đa ${MAX_CONCURRENT} task song song).`);
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Dùng lại khi resume 1 run đang awaiting_approval (route agentRuns.js).
export { findModuleAgent, updateTaskRunState, tryMoveColumn, finalizeRun };
