// Phase 13: ghi chú/kho tri thức - CRUD đơn giản, row-level SQL trực tiếp
// (đúng phong cách serverTaskOps.js/timeTrackingOps.js), không đi qua pattern
// "đọc-sửa-ghi cả board" vì notes là bảng hoàn toàn độc lập.
import { db } from '../db/client.js';
import { TaskOpError } from './serverTaskOps.js';
import { indexKnowledgeItem, removeKnowledgeItem, noteNav } from './knowledgeIndex.js';

const VALID_SCOPES = new Set(['task', 'module', 'group', 'knowledge']);

const genId = () => `note-${Date.now()}-${Math.round(Math.random() * 1000)}`;

export const rowToNote = (row) => ({
  id: row.id,
  scopeType: row.scope_type,
  scopeId: row.scope_id || null,
  title: row.title || '',
  content: row.content || '',
  authorPersonnelId: row.author_personnel_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const assertValidScope = (scopeType, scopeId) => {
  if (!VALID_SCOPES.has(scopeType)) throw new TaskOpError(`Phạm vi ghi chú không hợp lệ: "${scopeType}".`);
  if (scopeType !== 'knowledge' && !scopeId) throw new TaskOpError('Thiếu scopeId cho phạm vi ghi chú này.');
};

export const listNotes = (scopeType, scopeId) => {
  assertValidScope(scopeType, scopeId ?? null);
  const rows = scopeType === 'knowledge'
    ? db.prepare('SELECT * FROM notes WHERE scope_type = ? ORDER BY updated_at DESC').all(scopeType)
    : db.prepare('SELECT * FROM notes WHERE scope_type = ? AND scope_id = ? ORDER BY updated_at DESC').all(scopeType, scopeId);
  return rows.map(rowToNote);
};

export const createNote = (scopeType, scopeId, { title, content, authorPersonnelId }) => {
  assertValidScope(scopeType, scopeId ?? null);
  const id = genId();
  const now = Date.now();
  db.prepare(`
    INSERT INTO notes (id, scope_type, scope_id, title, content, author_personnel_id, created_at, updated_at)
    VALUES (@id, @scope_type, @scope_id, @title, @content, @author_personnel_id, @created_at, @updated_at)
  `).run({
    id,
    scope_type: scopeType,
    scope_id: scopeType === 'knowledge' ? null : scopeId,
    title: (title || '').trim(),
    content: content || '',
    author_personnel_id: authorPersonnelId || null,
    created_at: now,
    updated_at: now
  });
  const note = rowToNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
  indexKnowledgeItem({ sourceType: 'note', sourceId: note.id, title: note.title, content: note.content, ...noteNav(note) });
  return note;
};

export const updateNote = (noteId, { title, content }) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!existing) throw new TaskOpError(`Không tìm thấy ghi chú "${noteId}".`);
  db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
    title !== undefined ? (title || '').trim() : existing.title,
    content !== undefined ? content : existing.content,
    Date.now(),
    noteId
  );
  const note = rowToNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId));
  indexKnowledgeItem({ sourceType: 'note', sourceId: note.id, title: note.title, content: note.content, ...noteNav(note) });
  return note;
};

export const deleteNote = (noteId) => {
  const existing = db.prepare('SELECT 1 FROM notes WHERE id = ?').get(noteId);
  if (!existing) throw new TaskOpError(`Không tìm thấy ghi chú "${noteId}".`);
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
  removeKnowledgeItem('note', noteId);
};
