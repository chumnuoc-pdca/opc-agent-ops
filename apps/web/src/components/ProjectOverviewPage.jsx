import React, { useState, useMemo } from 'react';
import { Camera, Edit2, Edit3, Save, Plus, Search } from 'lucide-react';
import HeaderActions from './HeaderActions';
import GroupModal from './GroupModal';
import ModuleModal from './ModuleModal';
import { ModuleTypeIcon } from './ModuleTypeBadge';
import { loadAllBoards } from '../utils/boardStorage';
import { fileToResizedDataUrl } from '../utils/imageResize';
import { hexToRgba } from '../utils/colorFromImage';

export default function ProjectOverviewPage({
  group, groups = [], flatModules, theme, onToggleTheme, onJumpToModule, onSelectModule,
  onUpdateProfile, onUpdateGroup, onDeleteGroup, onCreateModule, onUpdateModule, onDeleteModule
}) {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(group.description || '');
  const [coverError, setCoverError] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Module modal state: null | { mode: 'create' } | { mode: 'edit', module }
  const [moduleModalState, setModuleModalState] = useState(null);
  const [moduleSearchQuery, setModuleSearchQuery] = useState('');

  const projectModules = useMemo(() => flatModules.filter(m => m.groupId === group.id), [flatModules, group.id]);
  const boards = useMemo(() => loadAllBoards(projectModules), [projectModules]);

  const items = useMemo(() => boards.map(({ module, board }) => {
    const taskCount = Object.keys(board.tasks || {}).length;
    const doneCount = board.columns?.done?.taskIds?.length || 0;
    const pct = taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100);
    return { module, taskCount, doneCount, pct };
  }), [boards]);

  // Tách riêng 2 nhóm module theo đúng phân loại vận hành/sản phẩm - mỗi
  // nhóm 1 lưới riêng có tiêu đề rõ ràng, thay vì gộp chung 1 lưới như
  // trước (khó phân biệt module nào thuộc nhóm nào khi nhìn từ trang dự án).
  const operationItems = useMemo(() => items.filter(i => (i.module.type || 'product') === 'operation'), [items]);
  const productItems = useMemo(() => items.filter(i => (i.module.type || 'product') !== 'operation'), [items]);

  // Nền toàn trang hạ tone pastel theo màu dự án - preset dùng biến CSS
  // `--X-soft` có sẵn, màu tự do từ logo phải tự tính rgba lúc runtime vì
  // không thể định nghĩa trước biến CSS cho vô hạn mã hex.
  const pastelStyle = group.customAccentColor ? { background: hexToRgba(group.customAccentColor, 0.16) } : undefined;
  const pastelClassName = group.customAccentColor ? '' : `accent-${group.accent || 'indigo'}`;
  const avatarStyle = group.customAccentColor ? { background: group.customAccentColor } : undefined;
  const avatarClassName = `project-hero-avatar ${group.customAccentColor ? '' : `accent-${group.accent || 'indigo'}`}`;

  const startEditDesc = () => { setDescDraft(group.description || ''); setIsEditingDesc(true); };
  const saveDesc = () => { onUpdateProfile(group.id, { description: descDraft }); setIsEditingDesc(false); };

  const handleCoverPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 1200 });
      onUpdateProfile(group.id, { coverUrl: dataUrl });
      setCoverError('');
    } catch (err) {
      setCoverError(err.message || 'Không tải được ảnh.');
    }
  };

  const handleDeleteGroupClick = () => {
    if (!window.confirm(`Xoá dự án "${group.title}" sẽ xoá vĩnh viễn ${group.modules.length} module và toàn bộ công việc bên trong. Tiếp tục?`)) return;
    onDeleteGroup(group.id);
    setIsGroupModalOpen(false);
  };

  return (
    <div className={`project-overview-container ${pastelClassName}`} style={pastelStyle}>
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{group.title}</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
      </div>

      <div className="overview-scroll">
        <div className="project-hero">
          <div className={`project-hero-cover ${group.coverUrl ? '' : pastelClassName}`} style={!group.coverUrl ? pastelStyle : undefined}>
            {group.coverUrl && <img src={group.coverUrl} alt="" />}
            <label className="project-hero-cover-edit-btn">
              <Camera size={14} /> Đổi ảnh bìa
              <input type="file" accept="image/*" hidden onChange={handleCoverPick} />
            </label>
          </div>

          <div className="project-hero-body">
            <button type="button" className={avatarClassName} style={avatarStyle} onClick={() => setIsGroupModalOpen(true)} title="Sửa dự án">
              {group.logoUrl ? <img src={group.logoUrl} alt="" /> : <span>{(group.code || group.title || '?').charAt(0).toUpperCase()}</span>}
            </button>
            <div className="project-hero-title-block">
              <h1>{group.title}</h1>
              <button type="button" className="project-hero-edit-link" onClick={() => setIsGroupModalOpen(true)}>
                <Edit2 size={12} /> Sửa dự án
              </button>
            </div>
          </div>
          {coverError && <p className="form-error">{coverError}</p>}
        </div>

        <div className="project-description-card">
          <div className="board-subtitle-card-header">
            {!isEditingDesc ? (
              <button className="board-subtitle-edit-btn" onClick={startEditDesc}>
                <Edit2 size={12} /> Chỉnh sửa
              </button>
            ) : (
              <div className="board-subtitle-edit-actions">
                <button className="board-subtitle-cancel-btn" onClick={() => setIsEditingDesc(false)}>Huỷ</button>
                <button className="board-subtitle-save-btn" onClick={saveDesc}><Save size={12} /> Lưu</button>
              </div>
            )}
          </div>
          {isEditingDesc ? (
            <textarea
              className="board-subtitle-textarea"
              rows={3}
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              placeholder="Mô tả về dự án này..."
              autoFocus
            />
          ) : (
            <p className="project-description-text">
              {group.description || 'Chưa có mô tả cho dự án này. Bấm "Chỉnh sửa" để thêm.'}
            </p>
          )}
        </div>

        <div className="project-actions-bar">
          <button
            type="button"
            className="add-module-quick-btn"
            onClick={() => setModuleModalState({ mode: 'create' })}
          >
            <Plus size={16} /> Tạo module mới cho dự án
          </button>
        </div>

        {operationItems.length > 0 && (
          <div className="group-section">
            <h3 className="group-section-title">
              <ModuleTypeIcon type="operation" size={15} /> Module vận hành ({operationItems.length})
            </h3>
            <div className="module-grid">
              {operationItems.map(({ module, taskCount, doneCount, pct }) => (
                <div key={module.id} className="module-card-wrapper" style={{ position: 'relative' }}>
                  <button className="module-card" onClick={() => onSelectModule(module)}>
                    <div className="module-card-top">
                      <span className={pastelClassName ? `task-code-chip ${pastelClassName}` : 'task-code-chip'} style={group.customAccentColor ? { color: group.customAccentColor, background: hexToRgba(group.customAccentColor, 0.16) } : undefined}>
                        {module.code || module.id}
                      </span>
                      <span className="module-card-pct">{pct}%</span>
                    </div>
                    <div className="module-card-title">{module.title}</div>
                    <div className="module-card-progress">
                      <div className="module-card-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="module-card-meta">{doneCount}/{taskCount} công việc hoàn thành</div>
                  </button>
                  <button
                    type="button"
                    className="module-card-quick-edit-btn"
                    onClick={(e) => { e.stopPropagation(); setModuleModalState({ mode: 'edit', module }); }}
                    title="Chỉnh sửa mô hình này"
                  >
                    <Edit3 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {productItems.length > 0 && (
          <div className="group-section">
            <h3 className="group-section-title">
              <ModuleTypeIcon type="product" size={15} /> Module sản phẩm ({productItems.length})
            </h3>
            <div className="module-grid">
              {productItems.map(({ module, taskCount, doneCount, pct }) => (
                <div key={module.id} className="module-card-wrapper" style={{ position: 'relative' }}>
                  <button className="module-card" onClick={() => onSelectModule(module)}>
                    <div className="module-card-top">
                      <span className={pastelClassName ? `task-code-chip ${pastelClassName}` : 'task-code-chip'} style={group.customAccentColor ? { color: group.customAccentColor, background: hexToRgba(group.customAccentColor, 0.16) } : undefined}>
                        {module.code || module.id}
                      </span>
                      <span className="module-card-pct">{pct}%</span>
                    </div>
                    <div className="module-card-title">{module.title}</div>
                    <div className="module-card-progress">
                      <div className="module-card-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="module-card-meta">{doneCount}/{taskCount} công việc hoàn thành</div>
                  </button>
                  <button
                    type="button"
                    className="module-card-quick-edit-btn"
                    onClick={(e) => { e.stopPropagation(); setModuleModalState({ mode: 'edit', module }); }}
                    title="Chỉnh sửa mô hình này"
                  >
                    <Edit3 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="group-section">
            <p className="sidebar-empty">Chưa có module nào trong dự án này.</p>
          </div>
        )}
      </div>

      {isGroupModalOpen && (
        <GroupModal
          mode="edit"
          initial={group}
          onClose={() => setIsGroupModalOpen(false)}
          onSave={(data) => { onUpdateGroup(group.id, data); setIsGroupModalOpen(false); }}
          onDelete={handleDeleteGroupClick}
        />
      )}

      {moduleModalState && (
        <ModuleModal
          mode={moduleModalState.mode}
          initial={moduleModalState.module}
          groups={groups.length > 0 ? groups : [group]}
          defaultGroupId={group.id}
          onClose={() => setModuleModalState(null)}
          onSave={(data) => {
            if (moduleModalState.mode === 'create') {
              onCreateModule(data.groupId || group.id, data);
            } else {
              onUpdateModule(moduleModalState.module.id, data);
            }
            setModuleModalState(null);
          }}
          onDelete={moduleModalState.mode === 'edit' ? () => {
            if (window.confirm(`Xoá module "${moduleModalState.module.title}"?`)) {
              onDeleteModule(moduleModalState.module.id);
              setModuleModalState(null);
            }
          } : undefined}
        />
      )}
    </div>
  );
}
