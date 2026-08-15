import React, { useState } from 'react';
import { Save, Eye, EyeOff, RotateCcw, Check, Plug, SlidersHorizontal, MessageSquareText, RefreshCw, HardDrive, LogOut } from 'lucide-react';
import { loadAiSettings, saveAiSettings, resetAiSettings, DEFAULT_SETTINGS, MODEL_OPTIONS } from '../utils/aiSettings';
import { loadGoogleDriveSettings, saveGoogleDriveSettings, isGoogleDriveConfigured } from '../utils/googleDriveSettings';
import { logout } from '../utils/authStorage';
import HeaderActions from './HeaderActions';

export default function SettingsPage({ theme, onToggleTheme, onJumpToModule, flatModules, onResyncContent }) {
  const [settings, setSettings] = useState(loadAiSettings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resynced, setResynced] = useState(false);
  const [driveSettings, setDriveSettings] = useState(loadGoogleDriveSettings);
  const [driveSaved, setDriveSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      window.location.reload();
    }
  };

  const updateDrive = (field, value) => {
    setDriveSettings(prev => ({ ...prev, [field]: value }));
    setDriveSaved(false);
  };

  const handleSaveDrive = (e) => {
    e.preventDefault();
    saveGoogleDriveSettings(driveSettings);
    setDriveSaved(true);
    setTimeout(() => setDriveSaved(false), 2000);
  };

  const handleResync = () => {
    if (!window.confirm(
      'Đồng bộ lại mô tả và case study gốc cho các module M1-M14?\n\n' +
      'Thao tác này sẽ ghi đè mọi chỉnh sửa thủ công bạn đã làm trong phần "Thông tin mô hình" của các module đó. ' +
      'Công việc, KPI/OKR, tài sản, tài chính và các module tự thêm sẽ không bị ảnh hưởng.'
    )) return;
    onResyncContent();
    setResynced(true);
    setTimeout(() => setResynced(false), 2500);
  };

  const update = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveAiSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (!window.confirm('Khôi phục cấu hình trợ lý AI về mặc định?')) return;
    resetAiSettings();
    setSettings({ ...DEFAULT_SETTINGS });
  };

  return (
    <div className="board-container">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Cài đặt</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
        <div className="board-title-section">
          <div className="board-title-row">
            <h1>Cài đặt trợ lý AI</h1>
          </div>
          <p className="board-subtitle">Cấu hình kết nối, model và system prompt dùng cho trợ lý AI trong toàn bộ workspace.</p>
        </div>
      </div>

      <div className="settings-scroll">
        <form className="settings-form" onSubmit={handleSave}>
          <div className="settings-section">
            <div className="settings-section-header">
              <span className="page-icon-badge accent-sky settings-section-icon"><Plug size={16} /></span>
              <div>
                <h2>Kết nối</h2>
                <p>Địa chỉ API và khoá xác thực dùng để gọi trợ lý AI.</p>
              </div>
            </div>
            <div className="form-field">
              <label>API Key</label>
              <div className="settings-key-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => update('apiKey', e.target.value)}
                  placeholder="sk-..."
                />
                <button type="button" className="icon-btn" onClick={() => setShowKey(s => !s)}>
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-field">
              <label>Base URL</label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={e => update('baseUrl', e.target.value)}
                placeholder="https://apihub.agnes-ai.com/v1"
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-header">
              <span className="page-icon-badge accent-violet settings-section-icon"><SlidersHorizontal size={16} /></span>
              <div>
                <h2>Hành vi mô hình</h2>
                <p>Chọn model và mức độ sáng tạo khi trợ lý trả lời hoặc gọi tool.</p>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Model</label>
                <select value={settings.model} onChange={e => update('model', e.target.value)}>
                  {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  {!MODEL_OPTIONS.includes(settings.model) && (
                    <option value={settings.model}>{settings.model}</option>
                  )}
                </select>
              </div>
              <div className="form-field">
                <label>Temperature ({settings.temperature})</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={e => update('temperature', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-header">
              <span className="page-icon-badge accent-emerald settings-section-icon"><MessageSquareText size={16} /></span>
              <div>
                <h2>System Prompt</h2>
                <p>Chỉ dẫn nền cho mọi cuộc trò chuyện - vai trò, phạm vi và cách hành xử của trợ lý.</p>
              </div>
            </div>
            <div className="form-field">
              <label>System Prompt</label>
              <textarea
                rows={5}
                value={settings.systemPrompt}
                onChange={e => update('systemPrompt', e.target.value)}
              />
            </div>
          </div>

          <div className="settings-actions">
            <button type="button" className="secondary-btn" onClick={handleReset}>
              <RotateCcw size={15} /> Khôi phục mặc định
            </button>
            <button type="submit" className="primary-btn">
              {saved ? <><Check size={15} /> Đã lưu</> : <><Save size={15} /> Lưu cài đặt</>}
            </button>
          </div>
        </form>

        <form className="settings-form" onSubmit={handleSaveDrive}>
          <div className="settings-section">
            <div className="settings-section-header">
              <span className="page-icon-badge accent-indigo settings-section-icon"><HardDrive size={16} /></span>
              <div>
                <h2>Kết nối Google Drive</h2>
                <p>
                  Cho phép chọn file trực tiếp từ Google Drive khi liên kết tài liệu với đầu việc hoặc tài sản.
                  Cần một OAuth Client ID và API Key từ Google Cloud Console của bạn (bật Drive API + Picker API).
                  {isGoogleDriveConfigured(driveSettings) && (
                    <span className="drive-status-connected"> <Check size={12} /> Đã cấu hình</span>
                  )}
                </p>
              </div>
            </div>
            <div className="form-field">
              <label>OAuth Client ID</label>
              <input
                type="text"
                value={driveSettings.clientId}
                onChange={e => updateDrive('clientId', e.target.value)}
                placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
              />
            </div>
            <div className="form-field">
              <label>API Key</label>
              <input
                type="text"
                value={driveSettings.apiKey}
                onChange={e => updateDrive('apiKey', e.target.value)}
                placeholder="AIza..."
              />
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="primary-btn">
              {driveSaved ? <><Check size={15} /> Đã lưu</> : <><Save size={15} /> Lưu cấu hình Drive</>}
            </button>
          </div>
        </form>

        <div className="settings-section">
          <div className="settings-section-header">
            <span className="page-icon-badge accent-amber settings-section-icon"><RefreshCw size={16} /></span>
            <div>
              <h2>Dữ liệu module</h2>
              <p>Đồng bộ lại mô tả và case study gốc cho M1-M14 khi nội dung mẫu trong app được cập nhật.</p>
            </div>
          </div>
          <div className="settings-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="secondary-btn" onClick={handleResync}>
              {resynced ? <><Check size={15} /> Đã đồng bộ</> : <><RefreshCw size={15} /> Đồng bộ lại nội dung gốc</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
