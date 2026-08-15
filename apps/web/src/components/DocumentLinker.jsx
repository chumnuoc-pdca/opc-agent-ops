import React, { useState } from 'react';
import { FileText, Plus, Trash2, HardDrive, Loader2 } from 'lucide-react';
import { loadGoogleDriveSettings, isGoogleDriveConfigured } from '../utils/googleDriveSettings';
import { openGoogleDrivePicker } from '../utils/googleDrivePicker';

// Reusable "linked documents" list + add controls, shared by task cards and
// asset items. Manual paste-a-link always works with zero setup; the real
// Google Drive picker button only appears once Client ID/API Key are
// configured in Settings (it needs the user's own Google Cloud project).
export default function DocumentLinker({ documents = [], onChange }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState('');

  const driveSettings = loadGoogleDriveSettings();
  const driveReady = isGoogleDriveConfigured(driveSettings);

  const addManualLink = () => {
    if (!url.trim()) return;
    onChange([
      ...documents,
      {
        id: `doc-${Date.now()}`,
        name: name.trim() || url.trim(),
        url: url.trim(),
        source: 'manual',
        addedAt: Date.now()
      }
    ]);
    setUrl('');
    setName('');
  };

  const handleUrlKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualLink();
    }
  };

  const removeDoc = (id) => {
    onChange(documents.filter(d => d.id !== id));
  };

  const handlePickFromDrive = async () => {
    setError('');
    setIsPicking(true);
    try {
      await openGoogleDrivePicker({
        clientId: driveSettings.clientId,
        apiKey: driveSettings.apiKey,
        onPicked: (file) => {
          onChange([
            ...documents,
            {
              id: `doc-${file.id}`,
              name: file.name,
              url: file.url,
              iconUrl: file.iconUrl,
              source: 'drive',
              addedAt: Date.now()
            }
          ]);
        }
      });
    } catch {
      setError('Không thể mở Google Drive. Kiểm tra lại Client ID / API Key trong Cài đặt.');
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div className="doc-linker">
      {documents.length > 0 && (
        <div className="doc-linker-list">
          {documents.map(doc => (
            <a
              key={doc.id}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="doc-linker-item"
              title={doc.url}
            >
              {doc.iconUrl ? (
                <img src={doc.iconUrl} alt="" className="doc-linker-icon-img" />
              ) : (
                <FileText size={13} />
              )}
              <span className="doc-linker-name">{doc.name}</span>
              <button
                type="button"
                className="doc-linker-remove"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDoc(doc.id); }}
                title="Gỡ liên kết"
              >
                <Trash2 size={12} />
              </button>
            </a>
          ))}
        </div>
      )}

      <div className="doc-linker-add-row">
        <input
          type="text"
          className="doc-linker-url-input"
          placeholder="Dán link Google Drive (file hoặc folder)..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleUrlKeyDown}
        />
        <input
          type="text"
          className="doc-linker-name-input"
          placeholder="Tên hiển thị (tuỳ chọn)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleUrlKeyDown}
        />
        <button type="button" className="doc-linker-add-btn" onClick={addManualLink} title="Thêm link">
          <Plus size={14} />
        </button>
      </div>

      {driveReady ? (
        <button type="button" className="doc-linker-drive-btn" onClick={handlePickFromDrive} disabled={isPicking}>
          {isPicking ? <Loader2 size={14} className="spin" /> : <HardDrive size={14} />}
          {isPicking ? 'Đang mở Google Drive...' : 'Chọn từ Google Drive'}
        </button>
      ) : (
        <p className="doc-linker-hint">Cấu hình Google Drive trong Cài đặt hệ thống để chọn file trực tiếp từ Drive.</p>
      )}
      {error && <p className="doc-linker-error">{error}</p>}
    </div>
  );
}
