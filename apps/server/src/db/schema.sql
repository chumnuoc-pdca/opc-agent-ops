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
