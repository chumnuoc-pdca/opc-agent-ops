const KEY = 'opc-ai-settings';

// A default API key/endpoint is shipped so the assistant works out of the box;
// both are plain user-editable settings stored in localStorage, never a
// server-side secret, and can be changed or cleared from the Settings page.
export const DEFAULT_SETTINGS = {
  apiKey: 'sk-ZHfn3CLqkfO32bnd1quE1rkXeU8hZYgmhm1xfNcDVDHpMCFO',
  baseUrl: 'https://apihub.agnes-ai.com/v1',
  model: 'agnes-2.0-pro',
  temperature: 0.7,
  systemPrompt: 'Bạn là trợ lý AI của OPC Workspace, giúp người dùng quản lý công việc, tra cứu thông tin các mô hình kinh doanh AI trong hệ thống và trả lời câu hỏi liên quan một cách ngắn gọn, rõ ràng.'
};

export const MODEL_OPTIONS = ['agnes-2.0-flash', 'agnes-2.0-pro', 'gpt-4o', 'gpt-4o-mini'];

export const loadAiSettings = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {
    // corrupt/unavailable storage - fall back to defaults below
  }
  return { ...DEFAULT_SETTINGS };
};

export const saveAiSettings = (settings) => {
  localStorage.setItem(KEY, JSON.stringify(settings));
};

export const resetAiSettings = () => {
  localStorage.removeItem(KEY);
};
