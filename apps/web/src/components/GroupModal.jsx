import React, { useState, useRef } from 'react';
import { X, Trash2, Save, Plus, Upload, Wand2 } from 'lucide-react';
import { ACCENT_OPTIONS } from '../data/initialData';
import { useOverlayClose } from '../utils/useOverlayClose';
import { fileToResizedDataUrl } from '../utils/imageResize';
import { extractDominantColorHex } from '../utils/colorFromImage';

export default function GroupModal({ mode, initial, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [code, setCode] = useState(initial?.code || '');
  const [accent, setAccent] = useState(initial?.accent || ACCENT_OPTIONS[0]);
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || '');
  const [logoError, setLogoError] = useState('');
  const [customAccentColor, setCustomAccentColor] = useState(initial?.customAccentColor || null);
  const [suggestedColor, setSuggestedColor] = useState(null);
  const fileInputRef = useRef(null);
  const overlayHandlers = useOverlayClose(onClose);

  const avatarStyle = customAccentColor ? { background: customAccentColor } : undefined;
  const avatarClassName = `group-avatar-preview ${customAccentColor ? '' : `accent-${accent}`}`;

  const handleLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 200 });
      setLogoUrl(dataUrl);
      setLogoError('');

      // Tự đề xuất màu chủ đạo thật lấy từ logo vừa chọn - người dùng vẫn có
      // thể bấm dùng hoặc bỏ qua, không tự áp dụng.
      const img = new Image();
      img.onload = () => {
        const hex = extractDominantColorHex(img);
        setSuggestedColor(hex);
      };
      img.src = dataUrl;
    } catch (err) {
      setLogoError(err.message || 'Không tải được ảnh.');
    }
  };

  const pickPreset = (opt) => {
    setAccent(opt);
    setCustomAccentColor(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      code: (code.trim() || title.trim().charAt(0).toUpperCase()).slice(0, 3),
      accent,
      logoUrl: logoUrl || null,
      customAccentColor: customAccentColor || null
    });
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>{mode === 'create' ? 'Thêm dự án mới' : 'Sửa dự án'}</h2>
            <button type="button" className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            <div className="form-field">
              <label>Ảnh đại diện (logo) dự án</label>
              <div className="group-avatar-picker">
                <button
                  type="button"
                  className={avatarClassName}
                  style={avatarStyle}
                  onClick={() => fileInputRef.current?.click()}
                  title="Bấm để chọn ảnh"
                >
                  {logoUrl ? <img src={logoUrl} alt="" /> : <span>{(code || title || '?').charAt(0).toUpperCase()}</span>}
                  <span className="group-avatar-upload-overlay"><Upload size={14} /></span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleLogoPick}
                />
                {logoUrl && (
                  <button type="button" className="group-avatar-remove-btn" onClick={() => setLogoUrl('')}>
                    <Trash2 size={13} /> Xoá ảnh
                  </button>
                )}
              </div>
              {logoError && <p className="form-error">{logoError}</p>}
            </div>

            <div className="form-field">
              <label>Tên dự án</label>
              <input
                type="text"
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Vd: Biztro - AI-powered MMO & Affiliate"
              />
            </div>
            <div className="form-field">
              <label>Mã hiển thị (tối đa 3 ký tự, hiện trên chip chuyển dự án)</label>
              <input
                type="text"
                value={code}
                maxLength={3}
                onChange={e => setCode(e.target.value)}
                placeholder="Vd: B"
              />
            </div>
            <div className="form-field">
              <label>Màu dự án</label>
              <div className="accent-picker">
                {ACCENT_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`accent-swatch accent-${opt} ${!customAccentColor && accent === opt ? 'active' : ''}`}
                    onClick={() => pickPreset(opt)}
                    title={opt}
                  />
                ))}
                {suggestedColor && (
                  <button
                    type="button"
                    className={`accent-swatch custom-color-swatch ${customAccentColor === suggestedColor ? 'active' : ''}`}
                    style={{ background: suggestedColor }}
                    onClick={() => setCustomAccentColor(suggestedColor)}
                    title={`Màu từ logo (${suggestedColor})`}
                  >
                    <Wand2 size={11} />
                  </button>
                )}
                <label
                  className={`accent-swatch custom-color-swatch custom-color-input-swatch ${customAccentColor && customAccentColor !== suggestedColor ? 'active' : ''}`}
                  style={customAccentColor ? { background: customAccentColor } : undefined}
                  title="Tự chọn màu"
                >
                  <input
                    type="color"
                    value={customAccentColor || '#3452c4'}
                    onChange={e => setCustomAccentColor(e.target.value)}
                  />
                </label>
              </div>
              {customAccentColor && (
                <p className="form-hint">Đang dùng màu tự do <strong>{customAccentColor}</strong> thay vì màu preset.</p>
              )}
            </div>
          </div>

          <div className="modal-footer">
            {mode === 'edit' && onDelete && (
              <button type="button" className="danger-btn" onClick={onDelete}>
                <Trash2 size={15} /> Xoá dự án
              </button>
            )}
            <div className="modal-footer-spacer" />
            <button type="submit" className="primary-btn">
              {mode === 'create' ? <><Plus size={15} /> Thêm dự án</> : <><Save size={15} /> Lưu thay đổi</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
