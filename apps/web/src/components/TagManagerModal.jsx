import React, { useState } from 'react';
import { X, Plus, Pencil, Trash2, Check, Tag } from 'lucide-react';
import { getTags, addTag, updateTag, deleteTag, TAG_COLORS } from '../utils/tagStorage';
import { useOverlayClose } from '../utils/useOverlayClose';

export default function TagManagerModal({ onClose, onTagsUpdated }) {
  const [tags, setTags] = useState(() => getTags());
  const [editingTagId, setEditingTagId] = useState(null);

  // Form states for new tag
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('indigo');

  // Form states for editing tag
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('indigo');

  const [error, setError] = useState('');
  const overlayHandlers = useOverlayClose(onClose);

  const refreshTags = (updatedList) => {
    setTags(updatedList);
    if (onTagsUpdated) onTagsUpdated(updatedList);
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Vui lòng nhập tên nhãn.');
      return;
    }
    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`Nhãn "${trimmed}" đã tồn tại.`);
      return;
    }
    const updated = addTag({ name: trimmed, color: newColor });
    refreshTags(updated);
    setNewName('');
    setNewColor('indigo');
    setError('');
  };

  const startEditing = (tag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || 'indigo');
    setError('');
  };

  const cancelEditing = () => {
    setEditingTagId(null);
    setEditName('');
    setError('');
  };

  const handleSaveEdit = (tagId) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Tên nhãn không được để trống.');
      return;
    }
    if (tags.some(t => t.id !== tagId && t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`Nhãn "${trimmed}" đã tồn tại.`);
      return;
    }
    const updated = updateTag(tagId, { name: trimmed, color: editColor });
    refreshTags(updated);
    setEditingTagId(null);
    setError('');
  };

  const handleDelete = (tag) => {
    if (!window.confirm(`Xoá nhãn "${tag.name}"?`)) return;
    const updated = deleteTag(tag.id);
    refreshTags(updated);
    if (editingTagId === tag.id) cancelEditing();
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content tag-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Tag size={18} />
            <h2>Quản lý Tag nghiệp vụ</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Create New Tag Section */}
          <form className="tag-create-box" onSubmit={handleAddTag}>
            <h3><Plus size={14} /> Thêm tag nghiệp vụ mới</h3>
            <div className="tag-form-row">
              <input
                type="text"
                placeholder="Tên tag (vd: Kinh doanh, Tiếp thị, AI...)"
                value={newName}
                onChange={e => { setNewName(e.target.value); setError(''); }}
              />
              <button type="submit" className="primary-btn sm">
                <Plus size={14} /> Thêm
              </button>
            </div>
            <div className="color-picker-row">
              <span className="color-picker-label">Màu nhãn:</span>
              <div className="color-picker-options">
                {TAG_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`color-swatch-btn accent-${c.id} ${newColor === c.id ? 'active' : ''}`}
                    title={c.label}
                    onClick={() => setNewColor(c.id)}
                  >
                    {newColor === c.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {error && <p className="form-error">{error}</p>}

          {/* List of Current Tags */}
          <div className="tag-list-section">
            <h3>Danh sách tag nghiệp vụ ({tags.length})</h3>
            <div className="tag-list">
              {tags.map(tag => {
                const isEditing = editingTagId === tag.id;
                return (
                  <div key={tag.id} className="tag-manager-item">
                    {isEditing ? (
                      <div className="tag-edit-form">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          autoFocus
                        />
                        <div className="color-picker-options compact">
                          {TAG_COLORS.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className={`color-swatch-btn accent-${c.id} ${editColor === c.id ? 'active' : ''}`}
                              title={c.label}
                              onClick={() => setEditColor(c.id)}
                            >
                              {editColor === c.id && <Check size={10} />}
                            </button>
                          ))}
                        </div>
                        <div className="tag-edit-actions">
                          <button
                            type="button"
                            className="primary-btn sm"
                            onClick={() => handleSaveEdit(tag.id)}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            className="secondary-btn sm"
                            onClick={cancelEditing}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className={`tag-chip accent-${tag.color || 'indigo'}`}>
                          {tag.name}
                        </span>
                        <div className="tag-item-actions">
                          <button
                            type="button"
                            className="icon-btn-sm"
                            title="Sửa nhãn"
                            onClick={() => startEditing(tag)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn-sm danger"
                            title="Xoá nhãn"
                            onClick={() => handleDelete(tag)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
