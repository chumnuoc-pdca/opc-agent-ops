import { getAgentById, listAgents } from '../agents-loader.js';
import { buildSystemPrompt } from '../orchestrator/systemPrompt.js';
import { runAgentTurn } from '../orchestrator/agentOrchestrator.js';
import { extractToolLog } from '../orchestrator/transcript.js';
import { AI_CONFIG } from '../config.js';

export default async function orchestratorRoutes(fastify) {
  fastify.get('/api/agents', async () =>
    listAgents().map((a) => ({
      id: a.id, moduleId: a.moduleId, triggerKeywords: a.triggerKeywords,
      model: a.model, temperature: a.temperature, allowedTools: a.allowedTools
    }))
  );

  // Số lượt hội thoại trước đó tối đa gửi kèm - khớp HISTORY_WINDOW của bản
  // browser cũ (utils/agentOrchestrator.js) để không phá vỡ khả năng nhớ ngữ
  // cảnh khi Chat chuyển sang gọi endpoint này thay vì gọi thẳng LLM.
  const HISTORY_WINDOW = 12;

  // CEO agent nhận lệnh tự nhiên, phân rã thành đầu việc, gọi create_task để
  // giao cho agent chuyên trách. CEO chỉ được phép dùng tool R0/R1 (xem
  // agents/ceo-orchestrator.md) nên không bao giờ dừng ở awaiting_approval -
  // đây vẫn là phản hồi đồng bộ trong 1 request.
  fastify.post('/api/orchestrator/command', async (request, reply) => {
    const { command, history } = request.body || {};
    if (!command?.trim()) return reply.code(400).send({ error: 'Thiếu nội dung lệnh.' });

    const ceo = getAgentById('ceo-orchestrator');
    if (!ceo) return reply.code(500).send({ error: 'Chưa nạp được agent "ceo-orchestrator".' });

    const systemPrompt = buildSystemPrompt(ceo);
    const priorTurns = Array.isArray(history)
      ? history.slice(-HISTORY_WINDOW).filter((m) => m?.role && m?.content)
      : [];

    const result = await runAgentTurn({
      baseUrl: AI_CONFIG.baseUrl,
      apiKey: AI_CONFIG.apiKey,
      model: ceo.model || AI_CONFIG.model,
      temperature: ceo.temperature ?? AI_CONFIG.temperature,
      systemPrompt,
      history: [...priorTurns, { role: 'user', content: command.trim() }],
      allowedToolNames: ceo.allowedTools,
      actorType: 'agent'
    });

    if (result.status === 'error') return reply.code(502).send({ error: result.error || 'Gọi LLM thất bại.' });

    const toolLog = extractToolLog(result.messages);
    const createdTasks = toolLog
      .filter((t) => t.name === 'create_task' && t.result?.ok)
      .map((t) => t.result.result.created);

    reply.send({
      finalContent: result.finalContent,
      status: result.status,
      toolLog,
      createdTasks
    });
  });

  // Bản streaming của route trên - cùng logic CEO agent, chỉ khác cách trả
  // kết quả: đẩy từng sự kiện tiến trình (chữ sinh dần, tool đang chạy/xong)
  // qua SSE thay vì chặn tới khi xong mới trả 1 lần. Route cũ ở trên GIỮ
  // NGUYÊN không đổi - không nơi nào khác gọi nó ngoài ChatPage.jsx nhưng
  // giữ lại làm lưới an toàn không tốn gì.
  fastify.post('/api/orchestrator/command/stream', async (request, reply) => {
    const { command, history } = request.body || {};
    if (!command?.trim()) return reply.code(400).send({ error: 'Thiếu nội dung lệnh.' });

    const ceo = getAgentById('ceo-orchestrator');
    if (!ceo) return reply.code(500).send({ error: 'Chưa nạp được agent "ceo-orchestrator".' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    reply.raw.write('\n');
    const send = (event) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

    // Dùng reply.raw (ServerResponse), KHÔNG phải request.raw (IncomingMessage)
    // - request.raw 'close' bắn ngay khi body request đã đọc xong (~100ms,
    // đã xác nhận bằng test thật), gần như ngay lập tức, không phải khi
    // client thật sự ngắt kết nối - dùng nhầm sẽ huỷ lệnh LLM tức thì. reply.raw
    // 'close' mới đúng là tín hiệu "kết nối phía client đã đóng".
    const controller = new AbortController();
    reply.raw.on('close', () => controller.abort());

    const systemPrompt = buildSystemPrompt(ceo);
    const priorTurns = Array.isArray(history)
      ? history.slice(-HISTORY_WINDOW).filter((m) => m?.role && m?.content)
      : [];

    try {
      const result = await runAgentTurn({
        baseUrl: AI_CONFIG.baseUrl,
        apiKey: AI_CONFIG.apiKey,
        model: ceo.model || AI_CONFIG.model,
        temperature: ceo.temperature ?? AI_CONFIG.temperature,
        systemPrompt,
        history: [...priorTurns, { role: 'user', content: command.trim() }],
        allowedToolNames: ceo.allowedTools,
        actorType: 'agent',
        signal: controller.signal,
        onEvent: send
      });

      const toolLog = extractToolLog(result.messages || []);
      const createdTasks = toolLog
        .filter((t) => t.name === 'create_task' && t.result?.ok)
        .map((t) => t.result.result.created);

      // Sự kiện `final` là nguồn sự thật duy nhất - đủ mọi field để client
      // dựng lại đúng trạng thái cuối kể cả khi có sự kiện delta/tool_call
      // nào đó bị lỡ dọc đường.
      send({
        type: 'final',
        status: result.status,
        finalContent: result.finalContent,
        error: result.error,
        toolLog,
        createdTasks
      });
    } catch (err) {
      send({ type: 'error', message: err.message || 'Lỗi không xác định.' });
    } finally {
      reply.raw.end();
    }
  });
}
