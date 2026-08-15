import React, { useState } from 'react';
import { X, Trash2, Save, Plus, Wrench, Package, Pin, Target } from 'lucide-react';
import { isCodeTaken } from '../utils/structureStorage';
import { parseHeaderInfo, applyHeaderInfo } from '../utils/boardStorage';
import { useOverlayClose } from '../utils/useOverlayClose';

const MODULE_TYPES = [
  { id: 'product', label: 'Module sản phẩm', hint: 'Sản phẩm/dịch vụ/chương trình dự án cung ứng', icon: Package },
  { id: 'operation', label: 'Module vận hành', hint: 'Vận hành nội bộ dự án (website, thiết kế...)', icon: Wrench }
];

export default function ModuleModal({ mode, initial, groups, defaultGroupId, onClose, onSave, onDelete }) {
  const [code, setCode] = useState(initial?.code || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [groupId, setGroupId] = useState(initial?.groupId || defaultGroupId || groups[0]?.id || '');
  const [type, setType] = useState(initial?.type === 'operation' ? 'operation' : 'product');
  const [{ nature, targetAudience }, setHeaderInfo] = useState(() => parseHeaderInfo(initial?.details));
  const [error, setError] = useState('');
  const overlayHandlers = useOverlayClose(onClose);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCode || !trimmedTitle) {
      setError('Vui lòng nhập mã và tên module.');
      return;
    }
    if (isCodeTaken(groups, trimmedCode, initial?.id)) {
      setError(`Mã "${trimmedCode}" đã được dùng cho module khác. Hãy chọn mã khác.`);
      return;
    }
    const details = applyHeaderInfo(initial?.details, { nature: nature.trim(), targetAudience: targetAudience.trim() });
    onSave({ code: trimmedCode, title: trimmedTitle, description: description.trim(), groupId, type, details });
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>{mode === 'create' ? 'Thêm module mới' : 'Sửa module'}</h2>
            <button type="button" className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            <div className="form-row">
              <div className="form-field">
                <label>Mã module</label>
                <input
                  type="text"
                  autoFocus
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(''); }}
                  placeholder="Vd: M1, M15, AFF-01..."
                />
              </div>
              <div className="form-field">
                <label>Thuộc dự án</label>
                <select value={groupId} onChange={e => setGroupId(e.target.value)}>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Tên module</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Vd: M15. Tên mô hình mới"
              />
            </div>

            <div className="form-field">
              <label>Loại module</label>
              <div className="module-type-picker">
                {MODULE_TYPES.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`module-type-option module-type-${opt.id} ${type === opt.id ? 'active' : ''}`}
                      onClick={() => setType(opt.id)}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{opt.label}</strong>
                        <small>{opt.hint}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-field">
              <label>Mô tả ngắn (hiển thị dưới tiêu đề)</label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Mô tả một câu về mô hình này..."
              />
            </div>

            <div className="form-field">
              <label><Pin size={13} /> Bản chất & Mô tả</label>
              <textarea
                rows={2}
                value={nature}
                onChange={e => setHeaderInfo(prev => ({ ...prev, nature: e.target.value }))}
                placeholder="Bản chất mô hình này là gì..."
              />
            </div>

            <div className="form-field">
              <label><Target size={13} /> Đối tượng phù hợp</label>
              <textarea
                rows={2}
                value={targetAudience}
                onChange={e => setHeaderInfo(prev => ({ ...prev, targetAudience: e.target.value }))}
                placeholder="Ai phù hợp với mô hình này..."
              />
            </div>

            {error && <p className="form-error">{error}</p>}
          </div>

          <div className="modal-footer">
            {mode === 'edit' && (
              <button type="button" className="danger-btn" onClick={onDelete}>
                <Trash2 size={15} /> Xoá module
              </button>
            )}
            <div className="modal-footer-spacer" />
            <button type="submit" className="primary-btn">
              {mode === 'create' ? <><Plus size={15} /> Thêm module</> : <><Save size={15} /> Lưu thay đổi</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
