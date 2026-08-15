import { db } from './db/client.js';
import { getAgentById } from './agents-loader.js';
import { buildSystemPrompt } from './orchestrator/systemPrompt.js';
import { runAgentTurn } from './orchestrator/agentOrchestrator.js';
import { AI_CONFIG } from './config.js';
import { emitBoardChanged } from './events.js';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// Số liệu THẬT (không do agent tự nghĩ ra) về các module chưa có agent phụ
// trách - đây là input duy nhất cho HR meta-agent quyết định có đề xuất hay
// không (xem plan §6 "HR meta-agent").
function gatherCandidateModules() {
  const modules = db.prepare(`SELECT id, code, title FROM modules WHERE agent_id IS NULL`).all();
  const cutoff = Date.now() - FOURTEEN_DAYS_MS;

  return modules
    .map((m) => {
      const total = db.prepare('SELECT COUNT(*) c FROM tasks WHERE module_id = ?').get(m.id).c;
      const doneCount = db.prepare(`SELECT COUNT(*) c FROM tasks WHERE module_id = ? AND column_id = 'done'`).get(m.id).c;
      const recentCount = db.prepare('SELECT COUNT(*) c FROM tasks WHERE module_id = ? AND created_at >= ?').get(m.id, cutoff).c;
      return { ...m, total, doneCount, recentCount };
    })
    .filter((m) => m.total > 0);
}

export async function runHrMetaScan() {
  const agentDef = getAgentById('hr-meta-agent');
  if (!agentDef) throw new Error('Không tìm thấy định nghĩa hr-meta-agent (agents/hr-meta-agent.md).');

  const candidates = gatherCandidateModules();
  const systemPrompt = buildSystemPrompt(agentDef);

  const lines = candidates.length
    ? candidates.map((m) => `- ${m.code} (${m.title}): tổng ${m.total} việc, ${m.doneCount} đã hoàn thành, ${m.recentCount} việc tạo mới trong 14 ngày qua.`)
    : ['(Không có module nào đang thiếu agent phụ trách và có việc thật.)'];

  const userContent = [
    'Đây là số liệu thật hôm nay về các module CHƯA có agent phụ trách (agent_id rỗng):',
    lines.join('\n'),
    'Chỉ đề xuất (gọi create_task) nếu có tín hiệu rõ ràng về khối lượng việc lặp lại đáng để giao cho 1 agent chuyên trách. Nếu không đủ tín hiệu, không gọi tool nào cả.'
  ].join('\n\n');

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
      agentRunId: null
    });
  } catch (err) {
    result = { status: 'error', messages: [], error: err.message };
  }

  emitBoardChanged('HR-META');
  return { candidates, result };
}

// Lịch quét định kỳ (plan §6: "1 agent định kỳ - cron tuần"). Mặc định 7 ngày;
// đổi qua biến môi trường khi cần chu kỳ khác. Endpoint POST /api/hr-meta/run
// (routes/hrMeta.js) cho phép kích hoạt thủ công để kiểm chứng/demo ngay mà
// không phải đợi cả tuần.
const SCAN_INTERVAL_MS = Number(process.env.HR_META_INTERVAL_MS) || 7 * 24 * 60 * 60 * 1000;
let timer = null;

export function startHrMetaSchedule() {
  if (timer) return;
  timer = setInterval(() => {
    runHrMetaScan().catch((err) => console.error('HR meta-agent scan lỗi:', err.message));
  }, SCAN_INTERVAL_MS);
  console.log(`HR meta-agent đã lên lịch quét mỗi ${Math.round(SCAN_INTERVAL_MS / 3600000)} giờ.`);
}

export function stopHrMetaSchedule() {
  if (timer) clearInterval(timer);
  timer = null;
}
