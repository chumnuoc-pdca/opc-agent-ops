-- OPC Agent Ops — schema Phase 0 (chưa có agent_runs, Phase 1 sẽ thêm)

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT,
  accent TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Ảnh avatar/logo tròn của dự án - data URL base64 (đã resize nhỏ phía
  -- client trước khi lưu), NULL nếu dự án chưa đặt logo riêng.
  logo_url TEXT,
  -- Mã màu hex tự do lấy từ logo (hoặc tự chọn) - ưu tiên hơn `accent` (8
  -- màu preset cố định) ở mọi nơi hiển thị màu đại diện dự án khi có giá trị.
  custom_accent_color TEXT,
  -- Ảnh bìa hero cho trang Tổng quan Dự án - data URL base64, NULL nếu chưa đặt.
  cover_url TEXT,
  -- Mô tả dự án hiển thị/sửa được trên trang Tổng quan Dự án.
  description TEXT
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  code TEXT,
  title TEXT NOT NULL,
  description TEXT,
  details TEXT,
  accent TEXT,
  agent_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- 'product' (sản phẩm/dịch vụ dự án cung ứng) | 'operation' (vận hành nội
  -- bộ dự án) - chỉ ảnh hưởng hiển thị (icon/màu) ở sidebar, không đổi logic.
  type TEXT NOT NULL DEFAULT 'product'
);

CREATE TABLE IF NOT EXISTS columns (
  id TEXT NOT NULL,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (module_id, id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  code TEXT,
  content TEXT NOT NULL,
  notes TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  start_date TEXT,
  due_date TEXT,
  assignee_type TEXT,
  assignee_name TEXT,
  checklist_json TEXT DEFAULT '[]',
  progress INTEGER DEFAULT 0,
  blocked_is_blocked INTEGER DEFAULT 0,
  blocked_reason TEXT DEFAULT '',
  blocked_at INTEGER,
  depends_on TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  pdca_plan TEXT DEFAULT '',
  pdca_do TEXT DEFAULT '',
  pdca_check TEXT DEFAULT '',
  pdca_act TEXT DEFAULT '',
  documents_json TEXT DEFAULT '[]',
  tags_json TEXT DEFAULT '[]',
  cover_color TEXT,
  -- Phase 12: theo dõi thời gian - estimate_minutes do người dùng nhập tay,
  -- actual_minutes là cache cộng dồn từ time_entries (cập nhật lúc Stop),
  -- KHÔNG sửa trực tiếp qua PATCH thường (xem timeTrackingOps.js).
  estimate_minutes INTEGER,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  -- Trạng thái vận hành agent — field trên thẻ, KHÔNG phải cột Kanban mới (xem plan mục Context).
  agent_run_status TEXT DEFAULT 'none',
  agent_run_agent_id TEXT,
  agent_run_id TEXT,
  agent_run_error TEXT,
  agent_run_updated_at INTEGER,
  archived INTEGER DEFAULT 0,
  archived_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_module ON tasks(module_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_pickup ON tasks(assignee_type, agent_run_status);

CREATE TABLE IF NOT EXISTS module_assets (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS module_case_studies (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS module_okr (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS module_finance (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

-- Phase 2: 1 dòng / 1 lần agent thực thi 1 task (xem plan §4).
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL, -- queued|running|awaiting_approval|awaiting_handoff|error|done|aborted
  round_count INTEGER DEFAULT 0,
  transcript_json TEXT DEFAULT '[]',
  pending_tool_call_json TEXT,
  error_text TEXT,
  eval_score INTEGER,
  eval_notes TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);

-- Phase 5: cookie session cho auth cơ bản (1 mật khẩu chung, xem plan §4).
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  risk_level TEXT,
  args_json TEXT,
  before_json TEXT,
  after_json TEXT,
  summary TEXT,
  status TEXT,
  error TEXT,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  agent_run_id TEXT
);

-- Phase 12: 1 dòng / 1 phiên theo dõi thời gian thật (Start→Stop) trên 1 task,
-- gắn theo personnel_id (không gắn session đăng nhập - xem plan Phase 12,
-- app chỉ có 1 mật khẩu chung, không có tài khoản người dùng thật).
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER,
  note TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_personnel ON time_entries(personnel_id);
-- Ràng buộc cứng ở tầng DB: tối đa 1 phiên đang chạy (ended_at IS NULL) cho
-- mỗi personnel_id, bất kể logic tầng ứng dụng có bug hay không.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_active ON time_entries(personnel_id) WHERE ended_at IS NULL;

-- Phase 13: ghi chú/kho tri thức, tách biệt hoàn toàn khỏi field `notes` đơn
-- (tự do) đã có sẵn trên tasks - đây là hệ nhiều-note-per-scope. scope_id
-- NULL khi scope_type='knowledge' (note độc lập, không gắn task/module/group
-- nào - kho tri thức chung của cả workspace).
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL, -- 'task' | 'module' | 'group' | 'knowledge'
  scope_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  author_personnel_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_scope ON notes(scope_type, scope_id);

-- Phase 14: AI RAG "nhẹ" bằng SQLite FTS5 full-text search (built-in, không
-- cần vector DB/embedding API mới - xem lý do ở plan Phase 14). Bảng độc
-- lập (không dùng external-content vì tasks/notes có TEXT PRIMARY KEY, khó
-- khớp rowid) - đồng bộ thủ công qua knowledgeIndex.js mỗi khi note/task
-- được tạo/sửa/xoá, cộng với 1 lần rebuild toàn bộ lúc server khởi động
-- (self-healing nếu có chỗ nào lỡ quên gọi index).
-- key = "<source_type>:<source_id>" - dùng để định vị đúng dòng cần xoá khi
-- re-index (FTS5 không có UPDATE, phải DELETE rồi INSERT lại).
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  key UNINDEXED,
  source_type UNINDEXED,
  source_id UNINDEXED,
  nav_type UNINDEXED,
  nav_id UNINDEXED,
  title,
  content
);

-- Phase 15: "time block" (khoảng dự kiến LÀM việc, kéo-thả trên lịch giờ) -
-- hoàn toàn tách biệt tasks.due_date (hạn PHẢI xong). Kéo/tạo/resize trên
-- lưới giờ chỉ được đụng vào bảng này, KHÔNG BAO GIỜ ghi due_date (xem
-- CalendarPage.jsx/TimeBlockGrid.jsx). 1 task có thể có nhiều time_block.
CREATE TABLE IF NOT EXISTS time_blocks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_time_blocks_task ON time_blocks(task_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_starts ON time_blocks(starts_at);

CREATE TABLE IF NOT EXISTS personnel (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'human',
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  avatar_url TEXT,
  skills TEXT,
  project_ids_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL
);
