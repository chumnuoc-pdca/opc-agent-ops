import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Eye, Code, Save, X } from 'lucide-react';
import { listNotes, createNote, updateNote, deleteNote } from '../utils/notesOperations';
import { renderMarkdownLite } from '../utils/markdownLite';
import { getActivePersonnelId } from '../utils/timeTrackingOperations';

const formatWhen = (ts) => new Date(ts).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

// Component dùng chung cho cả 3 nơi hiển thị ghi chú/kho tri thức (Phase 13):
// TaskModal (scope='task'), ProjectOverviewPage (scope='group'), trang Kho
// tri thức độc lập (scope='knowledge', không có scopeId). Markdown thuần,
// không rich-text editor - xem lý do trong markdownLite.js.
export default function NotesPanel({ scopeType, scopeId, emptyHint = 'Chưa có ghi chú nào.' }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // note.id | 'new' | null
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listNotes(scopeType, scopeId).then(setNotes).catch(() => {}).finally(() => setLoading(false));
  }, [scopeType, scopeId]);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => {
    setEditingId('new');
    setDraftTitle('');
    setDraftContent('');
    setShowPreview(false);
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setDraftTitle(note.title);
    setDraftContent(note.content);
    setShowPreview(false);
  };

  const cancelEdit = () => setEditingId(null);

  const handleSave = async () => {
    if (!draftContent.trim() && !draftTitle.trim()) return;
    setSaving(true);
    try {
      if (editingId === 'new') {
        await createNote(scopeType, scopeId, {
          title: draftTitle,
          content: draftContent,
          authorPersonnelId: getActivePersonnelId() || null
        });
      } else {
        await updateNote(editingId, { title: draftTitle, content: draftContent });
      }
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.message || 'Không lưu được ghi chú.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm('Xoá ghi chú này? Không thể hoàn tác.')) return;
    try {
      await deleteNote(noteId);
      load();
    } catch (err) {
      alert(err.message || 'Không xoá được ghi chú.');
    }
  };

  return (
    <div className="notes-panel">
      <div className="notes-panel-header">
        {editingId === null && (
          <button type="button" className="notes-panel-add-btn" onClick={startCreate}>
            <Plus size={14} /> Thêm ghi chú
          </button>
        )}
      </div>

      {editingId !== null && (
        <div className="notes-editor">
          <input
            type="text"
            className="notes-editor-title"
            placeholder="Tiêu đề ghi chú..."
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
          />
          <div className="notes-editor-toolbar">
            <button type="button" className={!showPreview ? 'active' : ''} onClick={() => setShowPreview(false)}>
              <Code size={12} /> Soạn (Markdown)
            </button>
            <button type="button" className={showPreview ? 'active' : ''} onClick={() => setShowPreview(true)}>
              <Eye size={12} /> Xem trước
            </button>
          </div>
          {showPreview ? (
            <div className="notes-editor-preview" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(draftContent) }} />
          ) : (
            <textarea
              rows={6}
              placeholder="# Tiêu đề&#10;- Gạch đầu dòng&#10;- [ ] Việc cần làm&#10;**In đậm**, *in nghiêng*, `code`"
              value={draftContent}
              onChange={e => setDraftContent(e.target.value)}
            />
          )}
          <div className="notes-editor-actions">
            <button type="button" className="notes-editor-cancel" onClick={cancelEdit}><X size={13} /> Huỷ</button>
            <button type="button" className="notes-editor-save" disabled={saving} onClick={handleSave}>
              <Save size={13} /> Lưu ghi chú
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="notes-panel-empty">Đang tải...</p>
      ) : notes.length === 0 && editingId === null ? (
        <p className="notes-panel-empty">{emptyHint}</p>
      ) : (
        <div className="notes-list">
          {notes.filter(n => n.id !== editingId).map(note => (
            <div key={note.id} className="notes-list-item">
              <div className="notes-list-item-header">
                <span className="notes-list-item-title">{note.title || '(Không tiêu đề)'}</span>
                <span className="notes-list-item-actions">
                  <button type="button" onClick={() => startEdit(note)} title="Sửa"><Pencil size={12} /></button>
                  <button type="button" onClick={() => handleDelete(note.id)} title="Xoá"><Trash2 size={12} /></button>
                </span>
              </div>
              <div className="notes-list-item-body" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(note.content) }} />
              <span className="notes-list-item-when">Cập nhật {formatWhen(note.updatedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
