import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Cho phép trỏ ra ổ đĩa bền (volume) khi deploy - vd Railway/Fly.io mount
// volume ở 1 đường dẫn cố định, KHÔNG dùng path tương đối trong container
// (mất dữ liệu mỗi lần redeploy nếu không có volume trỏ đúng chỗ này).
const DB_PATH = process.env.DB_PATH || join(__dirname, '../../../../data/opc.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // `CREATE TABLE IF NOT EXISTS` trong schema.sql không tự thêm cột mới vào
  // bảng đã tồn tại có dữ liệu thật - các cột thêm sau lần tạo bảng đầu tiên
  // cần ALTER TABLE thủ công ở đây, chỉ chạy nếu cột thực sự chưa có.
  const moduleColumns = db.prepare("PRAGMA table_info(modules)").all().map((c) => c.name);
  if (!moduleColumns.includes('type')) {
    db.exec("ALTER TABLE modules ADD COLUMN type TEXT NOT NULL DEFAULT 'product'");
  }

  const groupColumns = db.prepare("PRAGMA table_info(groups)").all().map((c) => c.name);
  if (!groupColumns.includes('logo_url')) {
    db.exec('ALTER TABLE groups ADD COLUMN logo_url TEXT');
  }
  if (!groupColumns.includes('custom_accent_color')) {
    db.exec('ALTER TABLE groups ADD COLUMN custom_accent_color TEXT');
  }
  if (!groupColumns.includes('cover_url')) {
    db.exec('ALTER TABLE groups ADD COLUMN cover_url TEXT');
  }
  if (!groupColumns.includes('description')) {
    db.exec('ALTER TABLE groups ADD COLUMN description TEXT');
  }

  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!taskColumns.includes('archived')) {
    db.exec('ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0');
  }
  if (!taskColumns.includes('archived_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN archived_at INTEGER');
  }
  if (!taskColumns.includes('cover_color')) {
    db.exec('ALTER TABLE tasks ADD COLUMN cover_color TEXT');
  }

  // Tự động đồng bộ và sửa mã thẻ đầu việc (task code) cho đúng theo mã module (module.code)
  const modules = db.prepare('SELECT id, code FROM modules').all();
  const updateTaskCode = db.prepare('UPDATE tasks SET code = ? WHERE id = ?');
  modules.forEach((mod) => {
    const modCode = mod.code || mod.id;
    const tasks = db.prepare('SELECT id, code FROM tasks WHERE module_id = ? ORDER BY created_at ASC, rowid ASC').all(mod.id);
    const prefix = `${modCode}-`;
    tasks.forEach((t, idx) => {
      if (!t.code || !t.code.startsWith(prefix)) {
        let seq = idx + 1;
        if (t.code) {
          const parts = t.code.split('-');
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num) && num > 0) seq = num;
        }
        const newCode = `${modCode}-${String(seq).padStart(2, '0')}`;
        updateTaskCode.run(newCode, t.id);
      }
    });
  });

  // Seed dữ liệu nhân sự con người & AI mặc định nếu bảng personnel chưa có dữ liệu
  const personnelCount = db.prepare('SELECT COUNT(*) AS c FROM personnel').get().c;
  if (personnelCount === 0) {
    const insertPerson = db.prepare(`
      INSERT INTO personnel (id, type, name, role, email, avatar_url, skills, project_ids_json, status, created_at)
      VALUES (@id, @type, @name, @role, @email, @avatar_url, @skills, @project_ids_json, @status, @created_at)
    `);

    const defaultPersonnel = [
      { id: 'p-h1', type: 'human', name: 'Linh - Content Lead', role: 'Content Strategy Lead', email: 'linh@company.com', avatar_url: null, skills: 'Kịch bản TikTok, AI Short Video, Social Commerce', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-h2', type: 'human', name: 'Trang - Scriptwriter', role: 'Senior Scriptwriter', email: 'trang@company.com', avatar_url: null, skills: 'Kịch bản Drama, Copywriting bán hàng', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-h3', type: 'human', name: 'Minh - Fullstack Developer', role: 'Lead Software Engineer', email: 'minh@company.com', avatar_url: null, skills: 'Vibe Coding, Web App, Fastify, React', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-h4', type: 'human', name: 'Project Lead', role: 'Quản lý Dự án', email: 'lead@company.com', avatar_url: null, skills: 'Điều phối dự án, Quản lý tiến độ KPI/OKR', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-a1', type: 'agent', name: 'Alex Research', role: 'Research & Insights Agent', email: null, avatar_url: null, skills: 'Nghiên cứu thị trường, Phân tích đối thủ, Tổng hợp Use Case', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-a2', type: 'agent', name: 'Kai Delivery', role: 'Automation & SOP Execution Agent', email: null, avatar_url: null, skills: 'Tự động hoá quy trình, Kiểm thử SOP, Thực thi tác vụ', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-a3', type: 'agent', name: 'Nova Copywriter', role: 'AI Content Copywriter', email: null, avatar_url: null, skills: 'Viết bài chuẩn SEO, Prompt kịch bản video ngắn, Caption bán hàng', project_ids_json: '[]', status: 'active', created_at: Date.now() },
      { id: 'p-a4', type: 'agent', name: 'Maya Design', role: 'AI Visual & Graphic Agent', email: null, avatar_url: null, skills: 'Thiết kế banner, Gợi ý concept hình ảnh AI, Layout UI/UX', project_ids_json: '[]', status: 'active', created_at: Date.now() }
    ];

    defaultPersonnel.forEach(p => insertPerson.run(p));
  }
}
