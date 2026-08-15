// OpenAI-compatible streaming chat client. POSTs to `${baseUrl}/chat/completions`
// with stream:true and parses the Server-Sent-Events response token-by-token.
// Also accumulates streamed `tool_calls` deltas (each arrives as partial JSON
// spread across many chunks, keyed by array index) so the caller can run the
// agent tool-loop on top of a normal streaming UX.
export async function streamChatCompletion({
  baseUrl, apiKey, model, temperature, messages, tools, signal, onDelta, onDone, onError
}) {
  try {
    const body = { model, temperature, stream: true, messages };
    if (tools && tools.length) body.tools = tools;

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok || !response.body) {
      let detail = '';
      try { detail = await response.text(); } catch { /* ignore */ }
      throw new Error(`Yêu cầu thất bại (mã ${response.status}). ${detail.slice(0, 300)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCalls = []; // sparse array indexed by delta.tool_calls[].index
    let finishReason = null;

    const applyToolCallDelta = (deltaCalls) => {
      deltaCalls.forEach(dc => {
        const idx = dc.index ?? 0;
        if (!toolCalls[idx]) toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
        const slot = toolCalls[idx];
        if (dc.id) slot.id = dc.id;
        if (dc.function?.name) slot.function.name += dc.function.name;
        if (dc.function?.arguments) slot.function.arguments += dc.function.arguments;
      });
    };

    const finalize = () => {
      const compactToolCalls = toolCalls.filter(Boolean);
      onDone({ content, toolCalls: compactToolCalls, finishReason });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex = buffer.indexOf('\n\n');
      while (sepIndex !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const dataLines = rawEvent.split('\n').filter(line => line.startsWith('data:'));
        for (const line of dataLines) {
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') {
            finalize();
            return;
          }
          try {
            const json = JSON.parse(payload);
            const choice = json.choices?.[0];
            const delta = choice?.delta ?? {};
            if (delta.content) {
              content += delta.content;
              onDelta(delta.content);
            }
            if (delta.tool_calls) applyToolCallDelta(delta.tool_calls);
            if (choice?.finish_reason) finishReason = choice.finish_reason;
          } catch {
            // ignore a malformed/partial SSE chunk
          }
        }
        sepIndex = buffer.indexOf('\n\n');
      }
    }
    finalize();
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone({ content: '', toolCalls: [], finishReason: 'abort' });
      return;
    }
    // Truyền kèm err.name (vd 'TimeoutError' khi do AbortSignal.timeout kích
    // hoạt) - caller cần phân biệt được timeout với lỗi kết nối thường để
    // dịch thông báo phù hợp.
    onError(err.message || 'Không thể kết nối tới trợ lý AI.', err.name);
  }
}
