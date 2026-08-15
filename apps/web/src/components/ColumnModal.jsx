import React, { useState } from 'react';
import { X, Trash2, Save, Plus } from 'lucide-react';
import { useOverlayClose } from '../utils/useOverlayClose';

export default function ColumnModal({ mode, initial, onClose, onSave, onDelete, canDelete }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const overlayHandlers = useOverlayClose(onClose);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() });
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>{mode === 'create' ? 'Thêm bảng mới' : 'Sửa bảng'}</h2>
            <button type="button" className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            <div className="form-field">
              <label>Tên bảng</label>
              <input
                type="text"
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Vd: Chờ duyệt, Đang test, Đã launch..."
              />
            </div>
            <div className="form-field">
              <label>Mô tả bảng (hiển thị khi xem thông tin bảng)</label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Bảng này dùng để làm gì, khi nào một thẻ nên nằm ở đây..."
              />
            </div>
          </div>

          <div className="modal-footer">
            {mode === 'edit' && canDelete && (
              <button type="button" className="danger-btn" onClick={onDelete}>
                <Trash2 size={15} /> Xoá bảng
              </button>
            )}
            <div className="modal-footer-spacer" />
            <button type="submit" className="primary-btn">
              {mode === 'create' ? <><Plus size={15} /> Thêm bảng</> : <><Save size={15} /> Lưu thay đổi</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
