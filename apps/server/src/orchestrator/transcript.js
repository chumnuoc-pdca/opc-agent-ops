// Extracts a flat { name, args, result } tool-call log from a chat messages[]
// transcript (assistant messages with tool_calls, paired with their
// following tool-role result messages by tool_call_id).
export const extractToolLog = (messages) => {
  const argsById = new Map();
  messages.forEach((m) => {
    if (m.role === 'assistant' && m.tool_calls) {
      m.tool_calls.forEach((call) => {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
        argsById.set(call.id, { name: call.function.name, args });
      });
    }
  });
  const log = [];
  messages.forEach((m) => {
    if (m.role === 'tool') {
      const meta = argsById.get(m.tool_call_id) || {};
      let result = null;
      try { result = JSON.parse(m.content); } catch { /* ignore */ }
      log.push({ id: m.tool_call_id, name: meta.name, args: meta.args, result });
    }
  });
  return log;
};
