// Cấu hình LLM phía server - cùng cổng agnes/OpenAI-compatible đã dùng trong
// app OPC gốc (src/utils/aiSettings.js), override được qua biến môi trường.
export const AI_CONFIG = {
  apiKey: process.env.AGENT_API_KEY || '',
  baseUrl: process.env.AGENT_BASE_URL || 'https://apihub.agnes-ai.com/v1',
  model: process.env.AGENT_MODEL || 'agnes-2.0-flash',
  temperature: 0.4
};

// Mật khẩu chung duy nhất để đăng nhập app (1 người dùng nội bộ, xem
// CLAUDE.md "Khoảng trống đã biết"). Override được qua env var APP_PASSWORD
// nếu cần đổi mà không sửa code.
export const APP_PASSWORD = process.env.APP_PASSWORD || '1407@Cam';
