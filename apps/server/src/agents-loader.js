import { readdirSync, readFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, '../../../agents');

// Đọc agents/*.md (frontmatter YAML + phần thân là system prompt) vào 1 Map
// trong bộ nhớ lúc khởi động. Định nghĩa agent SỐNG Ở FILE, commit Git bình
// thường - không có bảng agent_defs trong DB (xem plan §3/§6).
let registry = new Map();

export function loadAgentRegistry() {
  registry = new Map();
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  files.forEach((file) => {
    const raw = readFileSync(join(AGENTS_DIR, file), 'utf-8');
    const { data, content } = matter(raw);
    if (!data.id) {
      console.warn(`Bỏ qua ${file}: thiếu "id" trong frontmatter.`);
      return;
    }
    registry.set(data.id, {
      id: data.id,
      moduleId: data.moduleId || null,
      triggerKeywords: data.triggerKeywords || [],
      model: data.model || null,
      temperature: data.temperature ?? null,
      allowedTools: data.allowedTools || [],
      systemPromptBody: content.trim()
    });
  });
  console.log(`Đã nạp ${registry.size} agent từ ${AGENTS_DIR}:`, Array.from(registry.keys()).join(', '));
  return registry;
}

export const getAgentRegistry = () => registry;
export const getAgentById = (id) => registry.get(id);
export const listAgents = () => Array.from(registry.values());

// Phase 4 (plan §7): sửa xong 1 file agents/*.md là có hiệu lực ngay cho lượt
// chạy tiếp theo của worker/CEO/HR meta-agent - không cần restart server. Debounce
// vì editor thường phát ra nhiều fs event (write + rename + metadata) cho 1 lần lưu.
let debounceTimer = null;
export function watchAgentRegistry() {
  watch(AGENTS_DIR, { persistent: false }, (_event, filename) => {
    if (!filename?.endsWith('.md')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        loadAgentRegistry();
      } catch (err) {
        console.error('Nạp lại agent registry thất bại:', err.message);
      }
    }, 300);
  });
  console.log(`Đang theo dõi thay đổi trong ${AGENTS_DIR} để tự nạp lại agent (hot-reload).`);
}
