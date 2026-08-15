import { streamChatCompletion } from './aiClient.js';
import { AGENT_AVAILABLE_TOOLS, needsConfirmation, runAiToolWithAudit, describeToolCall } from './aiTools.js';

// Server-side agent tool-loop as a resumable state machine (Phase 2 rewrite of
// the Phase 1 version). Unlike the browser's agentOrchestrator.js - which
// blocks on `await onConfirmRequired(...)`, a real in-memory Promise tied to
// an open browser tab - a run here has NO tab to block on, so hitting an
// R2/R3 tool just returns `status: 'awaiting_approval'` immediately with
// enough state (`pendingBatch`) to resume later from `POST
// /api/tasks/:id/agent-run/resume` (see routes/agentRuns.js), potentially
// long after this function call has already returned.
const MAX_ROUNDS = 6;
const HISTORY_WINDOW = 12;

// Áp dụng cho MỌI lượt gọi LLM (Chat, worker, HR meta-agent) - trước đây
// không có timeout nào cả nên 1 kết nối treo phía agnes-ai làm cả request
// treo vô thời hạn, không cách nào người dùng biết để thử lại.
const LLM_ROUND_TIMEOUT_MS = 60000;

// Keeps the system prompt AND the first real user message pinned - without
// this, a long tool-calling run (many rounds, each adding an assistant +
// several tool messages) can push message[1] (the actual task instructions)
// out of the window entirely, leaving zero 'role: user' messages in the
// request. Some upstream providers hard-reject that ("No user query found in
// messages") instead of just answering from system+tool context.
const truncateHistory = (messages) => {
  if (messages.length <= HISTORY_WINDOW + 1) return messages;
  const [first, ...rest] = messages;
  if (first?.role !== 'system') return messages.slice(-HISTORY_WINDOW);
  const [firstUser, ...afterFirstUser] = rest;
  if (firstUser?.role === 'user') {
    return [first, firstUser, ...afterFirstUser.slice(-(HISTORY_WINDOW - 1))];
  }
  return [first, ...rest.slice(-HISTORY_WINDOW)];
};

const parseArgs = (raw) => {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
};

const callLlmRound = async ({ baseUrl, apiKey, model, temperature, messages, tools, signal, onEvent }) =>
  new Promise((resolve, reject) => {
    const timeoutSignal = AbortSignal.timeout(LLM_ROUND_TIMEOUT_MS);
    const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    streamChatCompletion({
      baseUrl, apiKey, model, temperature,
      messages: truncateHistory(messages),
      tools,
      signal: effectiveSignal,
      onDelta: (text) => onEvent?.({ type: 'delta', text }),
      onDone: resolve,
      onError: (msg, name) => {
        const err = new Error(msg);
        if (name) err.name = name;
        reject(err);
      }
    });
  });

// Runs tool calls in a batch starting at `startIndex`, stopping early (without
// throwing) the moment one needs human approval. Returns either
// { done: true } (whole batch executed) or
// { done: false, pendingIndex, pendingCall } (paused mid-batch).
const runToolBatch = async (toolCalls, startIndex, messages, { actorType, agentRunId, onEvent }) => {
  for (let i = startIndex; i < toolCalls.length; i += 1) {
    const call = toolCalls[i];
    const name = call.function.name;
    const args = parseArgs(call.function.arguments);

    if (needsConfirmation(name)) {
      return { done: false, pendingIndex: i, pendingCall: { id: call.id, name, args, preview: describeToolCall(name, args) } };
    }

    onEvent?.({ type: 'tool_call', id: call.id, name, args });
    const outcome = await runAiToolWithAudit(name, args, { requestId: call.id, actorType, agentRunId });
    onEvent?.({ type: 'tool_result', id: call.id, name, ok: outcome.ok !== false, result: outcome });
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) });
  }
  return { done: true };
};

// One round: call the LLM, then run whatever tools it asked for (until either
// the batch finishes, one needs approval, or there are no tool calls at all).
const runOneRound = async (ctx, messages, tools) => {
  let result;
  try {
    result = await callLlmRound({ ...ctx, messages, tools });
  } catch (err) {
    const message = err.name === 'TimeoutError'
      ? 'Máy chủ AI không phản hồi trong thời gian cho phép. Vui lòng thử lại.'
      : err.message;
    return { status: 'error', messages, error: message };
  }
  if (result.finishReason === 'abort') return { status: 'error', messages, error: 'Bị huỷ.' };

  const { content, toolCalls } = result;
  if (!toolCalls.length) {
    messages.push({ role: 'assistant', content });
    return { status: 'done', messages, finalContent: content };
  }

  messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
  const batch = await runToolBatch(toolCalls, 0, messages, ctx);
  if (!batch.done) {
    return { status: 'awaiting_approval', messages, pendingBatch: { toolCalls, pendingIndex: batch.pendingIndex }, pendingToolCall: batch.pendingCall };
  }
  return { status: 'round_complete', messages };
};

// Fresh start: system prompt + user/history messages.
export async function runAgentTurn({
  baseUrl, apiKey, model, temperature, systemPrompt, history, allowedToolNames, actorType, agentRunId, signal, onEvent
}) {
  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const tools = allowedToolNames ? AGENT_AVAILABLE_TOOLS.filter((t) => allowedToolNames.includes(t.function.name)) : AGENT_AVAILABLE_TOOLS;
  const ctx = { baseUrl, apiKey, model, temperature, actorType, agentRunId, signal, onEvent };

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const outcome = await runOneRound(ctx, messages, tools);
    if (outcome.status !== 'round_complete') return { ...outcome, roundCount: round + 1 };
  }
  return { status: 'max_rounds', messages, roundCount: MAX_ROUNDS };
}

// Resume from a saved transcript + a human decision on the paused tool call.
// `pendingBatch` is exactly what was returned as `pendingBatch` when this run
// last paused (toolCalls + pendingIndex).
export async function resumeAgentTurn({
  baseUrl, apiKey, model, temperature, messages, pendingBatch, approved, allowedToolNames, actorType, agentRunId, roundsUsed, signal, onEvent
}) {
  const tools = allowedToolNames ? AGENT_AVAILABLE_TOOLS.filter((t) => allowedToolNames.includes(t.function.name)) : AGENT_AVAILABLE_TOOLS;
  const ctx = { baseUrl, apiKey, model, temperature, actorType, agentRunId, signal, onEvent };
  const { toolCalls, pendingIndex } = pendingBatch;
  const call = toolCalls[pendingIndex];
  const name = call.function.name;
  const args = parseArgs(call.function.arguments);

  if (approved) {
    const outcome = await runAiToolWithAudit(name, args, { requestId: call.id, actorType, agentRunId });
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) });
  } else {
    const rejection = { ok: false, error: 'Người dùng đã từ chối thao tác này.' };
    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(rejection) });
  }

  // Finish the rest of this batch (there may be more tool calls after the one
  // we just resolved, possibly hitting another approval-needed call).
  const rest = await runToolBatch(toolCalls, pendingIndex + 1, messages, ctx);
  if (!rest.done) {
    return { status: 'awaiting_approval', messages, pendingBatch: { toolCalls, pendingIndex: rest.pendingIndex }, pendingToolCall: rest.pendingCall, roundCount: roundsUsed };
  }

  // Batch done - keep looping rounds as usual.
  for (let round = roundsUsed; round < MAX_ROUNDS; round += 1) {
    const outcome = await runOneRound(ctx, messages, tools);
    if (outcome.status !== 'round_complete') return { ...outcome, roundCount: round + 1 };
  }
  return { status: 'max_rounds', messages, roundCount: MAX_ROUNDS };
}
