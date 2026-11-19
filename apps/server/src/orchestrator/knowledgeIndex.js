// Phase 14: AI RAG "nhẹ" bằng SQLite FTS5 - index/tìm kiếm trên
// `knowledge_fts` (xem schema.sql). Nguồn dữ liệu: Task (content+notes) và
// Note (title+content, mọi scope). Đồng bộ thủ công (JS-level hook) thay vì
// trigger SQL - đơn giản hơn khi tasks/notes dùng TEXT PRIMARY KEY, dễ debug.
import { db } from '../db/client.js';

const buildKey = (sourceType, sourceId) => `${sourceType}:${sourceId}`;

// Ghi/ghi đè 1 mục vào chỉ mục - FTS5 không có UPDATE, phải xoá dòng cũ
// (theo key) rồi insert lại. `navType`/`navId` là gợi ý điều hướng cho
// frontend khi hiện trích dẫn ('module'|'group'|'page'|null).
export const indexKnowledgeItem = ({ sourceType, sourceId, title, content, navType = null, navId = null }) => {
  const key = buildKey(sourceType, sourceId);
  const text = (content || '').trim();
  db.prepare('DELETE FROM knowledge_fts WHERE key = ?').run(key);
  // Không index mục rỗng hoàn toàn (task chưa có notes, note chưa có nội
  // dung) - tránh rác vô nghĩa trong kết quả tìm kiếm.
  if (!text && !(title || '').trim()) return;
  db.prepare(`
    INSERT INTO knowledge_fts (key, source_type, source_id, nav_type, nav_id, title, content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(key, sourceType, sourceId, navType, navId, title || '', text);
};

export const removeKnowledgeItem = (sourceType, sourceId) => {
  db.prepare('DELETE FROM knowledge_fts WHERE key = ?').run(buildKey(sourceType, sourceId));
};

// Mỗi từ trong câu hỏi người dùng được escape thành 1 chuỗi FTS5 riêng -
// tránh vỡ cú pháp MATCH khi câu hỏi có ký tự đặc biệt (dấu ngoặc, gạch
// nối...) mà FTS5 coi là toán tử. `mode` quyết định nối bằng AND (khớp chặt,
// ít nhiễu) hay OR (khớp rộng, dự phòng khi AND không ra kết quả).
const toMatchQuery = (query, mode) => {
  const words = (query || '').split(/\s+/).map(w => w.trim()).filter(Boolean).slice(0, 12);
  if (words.length === 0) return null;
  return words.map(w => `"${w.replace(/"/g, '""')}"`).join(` ${mode} `);
};

const runFtsQuery = (matchQuery, limit) => {
  const rows = db.prepare(`
    SELECT source_type, source_id, nav_type, nav_id, title,
           snippet(knowledge_fts, 6, '**', '**', '…', 20) AS snippet
    FROM knowledge_fts
    WHERE knowledge_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(matchQuery, limit);
  return rows.map((r) => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    navType: r.nav_type,
    navId: r.nav_id,
    title: r.title,
    snippet: r.snippet
  }));
};

// Thử khớp CHẶT (AND - mọi từ phải có mặt) trước để kết quả gọn, ít nhiễu -
// chỉ nới ra khớp RỘNG (OR) nếu AND không ra dòng nào. Phát hiện qua kiểm
// thử thật: chỉ dùng OR khiến AI nhận về quá nhiều kết quả không liên quan
// lẫn với kết quả đúng, dẫn đến AI không chắc chắn và gọi lại tool nhiều lần
// thay vì trả lời ngay dù kết quả đúng đã có ngay từ lần gọi đầu.
export const searchKnowledge = (query, limit = 5) => {
  const cappedLimit = Math.min(limit, 10);
  const andQuery = toMatchQuery(query, 'AND');
  if (!andQuery) return [];
  const strict = runFtsQuery(andQuery, cappedLimit);
  if (strict.length > 0) return strict;
  const orQuery = toMatchQuery(query, 'OR');
  return runFtsQuery(orQuery, cappedLimit);
};

// Rebuild toàn bộ chỉ mục từ nguồn thật (tasks + notes) - chạy 1 lần lúc
// server khởi động (index.js). Tự chữa lành nếu có lần tạo/sửa nào đó lỡ
// quên gọi indexKnowledgeItem (vd task tạo qua 1 code path cũ chưa cập
// nhật) - chi phí rẻ ở quy mô vài trăm task/note của app này.
export const rebuildKnowledgeIndex = () => {
  db.prepare('DELETE FROM knowledge_fts').run();

  const tasks = db.prepare('SELECT id, module_id, content, notes FROM tasks WHERE archived = 0').all();
  const insertTask = db.prepare(`
    INSERT INTO knowledge_fts (key, source_type, source_id, nav_type, nav_id, title, content)
    VALUES (?, 'task', ?, 'module', ?, ?, ?)
  `);
  const tx1 = db.transaction((rows) => {
    rows.forEach((t) => {
      const text = (t.notes || '').trim();
      if (!text) return; // task chỉ có title, không có notes thật thì không đáng index riêng
      insertTask.run(buildKey('task', t.id), t.id, t.module_id, t.content || '', text);
    });
  });
  tx1(tasks);

  const notes = db.prepare('SELECT id, scope_type, scope_id, title, content FROM notes').all();
  const insertNote = db.prepare(`
    INSERT INTO knowledge_fts (key, source_type, source_id, nav_type, nav_id, title, content)
    VALUES (?, 'note', ?, ?, ?, ?, ?)
  `);
  const tx2 = db.transaction((rows) => {
    rows.forEach((n) => {
      const navType = n.scope_type === 'group' ? 'group' : n.scope_type === 'knowledge' ? 'page' : null;
      const navId = n.scope_type === 'group' ? n.scope_id : n.scope_type === 'knowledge' ? 'knowledge' : null;
      insertNote.run(buildKey('note', n.id), n.id, navType, navId, n.title || '', n.content || '');
    });
  });
  tx2(notes);
};

// Dùng lại đúng quy tắc navType/navId ở trên khi index 1 note đơn lẻ lúc
// tạo/sửa (notesOps.js) - tránh lặp logic if/else 2 nơi.
export const noteNav = (note) => {
  if (note.scopeType === 'group') return { navType: 'group', navId: note.scopeId };
  if (note.scopeType === 'knowledge') return { navType: 'page', navId: 'knowledge' };
  return { navType: null, navId: null };
};
