import React, { useState } from 'react';
import { X, Copy } from 'lucide-react';
import { isCodeTaken } from '../utils/structureStorage';
import { useOverlayClose } from '../utils/useOverlayClose';

// Sao chép 1 module (kèm khung thẻ đầu việc + Case Study làm template) sang
// 1 dự án khác - tạo module MỚI, không đụng gì tới module gốc. Tiến độ/người
// phụ trách/ngày hạn của từng thẻ LUÔN được reset (không sao chép), đúng
// tinh thần "nhân bản quy trình" chứ không phải di chuyển việc đang chạy dở.
export default function CopyModuleModal({ sourceModule, sourceGroupId, groups, onClose, onCopy }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState(`${sourceModule.title} (Bản sao)`);
  const [targetGroupId, setTargetGroupId] = useState(
    groups.find(g => g.id !== sourceGroupId)?.id || groups[0]?.id || ''
  );
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const overlayHandlers = useOverlayClose(onClose);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCode || !trimmedTitle) {
      setError('Vui lòng nhập mã và tên cho module mới.');
      return;
    }
    if (isCodeTaken(groups, trimmedCode)) {
      setError(`Mã "${trimmedCode}" đã được dùng cho module khác. Hãy chọn mã khác.`);
      return;
    }
    if (!targetGroupId) {
      setError('Vui lòng chọn dự án đích.');
      return;
    }
    setIsSaving(true);
    try {
      await onCopy({ targetGroupId, code: trimmedCode, title: trimmedTitle });
    } catch (err) {
      setError(err.message || 'Sao chép thất bại.');
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>Sao chép module sang dự án khác</h2>
            <button type="button" className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            <p className="form-hint">
              Tạo 1 module mới từ <strong>{sourceModule.title}</strong>: giữ nguyên khung thẻ đầu việc
              (tên, mô tả, checklist) và Case Study làm template - tiến độ, người phụ trách, ngày hạn của
              từng thẻ sẽ được reset về ban đầu trong module mới.
            </p>

            <div className="form-field">
              <label>Dự án đích</label>
              <select value={targetGroupId} onChange={e => setTargetGroupId(e.target.value)}>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Mã module mới</label>
                <input
                  type="text"
                  autoFocus
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(''); }}
                  placeholder="Vd: M15, AFF-02..."
                />
              </div>
              <div className="form-field">
                <label>Tên module mới</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="form-error">{error}</p>}
          </div>

          <div className="modal-footer">
            <div className="modal-footer-spacer" />
            <button type="submit" className="primary-btn" disabled={isSaving}>
              <Copy size={15} /> {isSaving ? 'Đang sao chép...' : 'Sao chép module'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
