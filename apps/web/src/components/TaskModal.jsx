import React, { useState, useRef, useEffect } from 'react';
import {
  X, Trash2, Save, Plus, User, Bot, Check, ChevronDown, ChevronRight, Ban, Sparkles, Loader2, Tag, Settings, Archive,
  Palette, MoreVertical, CheckSquare, Paperclip, History
} from 'lucide-react';
import { PRIORITY_LABELS } from '../data/initialData';
import { generateSmartSubtasks } from '../utils/aiTaskGenerator';
import { getTags, TAG_COLORS } from '../utils/tagStorage';
import DocumentLinker from './DocumentLinker';
import AgentRunPanel from './AgentRunPanel';
import TagManagerModal from './TagManagerModal';
import PersonnelModal from './PersonnelModal';
import ActionSheet from './ActionSheet';
import TimeTrackingSection from './TimeTrackingSection';
import NotesPanel from './NotesPanel';
import { getPersonnelForProject } from '../utils/personnelStorage';
import { useOverlayClose } from '../utils/useOverlayClose';
import { useIsMobile } from '../utils/useIsMobile';

const AUDIT_ACTION_LABELS = {
  create_task: 'Tạo công việc',
  update_task_fields: 'Cập nhật công việc',
  move_task_status: 'Chuyển trạng thái',
  set_task_blocked: 'Đánh dấu bị chặn',
  add_checklist_item: 'Thêm việc nhỏ',
  toggle_checklist_item: 'Đánh dấu việc nhỏ',
  bulk_update_tasks: 'Cập nhật hàng loạt'
};

const formatAuditWhen = (ts) => new Date(ts).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

export default function TaskModal({ mode, initial, allTasks = [], module = null, groups = [], onClose, onSave, onDelete, onArchive }) {
  const [content, setContent] = useState(initial?.content || '');
  const [documents, setDocuments] = useState(initial?.documents || []);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [selectedTags, setSelectedTags] = useState(initial?.tags || []);
  const [availableTags, setAvailableTags] = useState(() => getTags());
  const [showTagManager, setShowTagManager] = useState(false);
  const [showPersonnelManager, setShowPersonnelManager] = useState(false);
  const [priority, setPriority] = useState(initial?.priority || 'medium');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [estimateMinutes, setEstimateMinutes] = useState(initial?.estimateMinutes ?? '');
  const [assigneeType, setAssigneeType] = useState(initial?.assignee?.type || 'human');
  const [assigneeName, setAssigneeName] = useState(initial?.assignee?.name || '');
  const [checklist, setChecklist] = useState(initial?.checklist || []);
  const [newItemText, setNewItemText] = useState('');
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [isBlocked, setIsBlocked] = useState(initial?.blocked?.isBlocked || false);
  const [blockedReason, setBlockedReason] = useState(initial?.blocked?.reason || '');
  const [dependsOn, setDependsOn] = useState(initial?.dependsOn || '');
  const [showPdca, setShowPdca] = useState(
    Boolean(initial?.pdca?.plan || initial?.pdca?.do || initial?.pdca?.check || initial?.pdca?.act)
  );
  const [pdcaPlan, setPdcaPlan] = useState(initial?.pdca?.plan || '');
  const [pdcaDo, setPdcaDo] = useState(initial?.pdca?.do || '');
  const [pdcaCheck, setPdcaCheck] = useState(initial?.pdca?.check || '');
  const [pdcaAct, setPdcaAct] = useState(initial?.pdca?.act || '');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [coverColor, setCoverColor] = useState(initial?.coverColor || null);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const overlayHandlers = useOverlayClose(onClose);
  const isMobile = useIsMobile();

  const newItemInputRef = useRef(null);
  const documentsSectionRef = useRef(null);
  const assigneeSectionRef = useRef(null);

  // "Thao tác nhanh" - cuộn + focus tới đúng phần đã có sẵn trong form,
  // không phải chức năng mới, chỉ là lối tắt điều hướng (tham khảo Trello).
  const scrollToField = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ref.current?.focus?.();
  };

  // Nhật ký AI riêng cho thẻ này - chỉ có ở chế độ sửa (thẻ đã tồn tại), chỉ
  // phản ánh hành động AI/agent thực hiện qua tool (audit_log không ghi thao
  // tác con người sửa tay qua UI - xem plan để biết đầy đủ lý do).
  useEffect(() => {
    if (mode !== 'edit' || !initial?.id) return;
    fetch(`/api/audit-log?taskId=${encodeURIComponent(initial.id)}&limit=20`)
      .then(res => (res.ok ? res.json() : []))
      .then(setAuditEntries)
      .catch(() => {});
  }, [mode, initial?.id]);

  const doneCount = checklist.filter(item => item.done).length;
  const otherTasks = allTasks.filter(t => t.id !== initial?.id);

  const toggleTag = (tagName) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  const toggleItem = (id) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, done: !item.done } : item));
  };
  const updateItemText = (id, text) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, text } : item));
  };
  const removeItem = (id) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };
  const addItem = () => {
    if (!newItemText.trim()) return;
    setChecklist(prev => [...prev, { id: `chk-${Date.now()}`, text: newItemText.trim(), done: false }]);
    setNewItemText('');
  };
  const handleAddItemKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  const handleAiAutoFill = async () => {
    if (!content.trim()) return;
    setIsAiLoading(true);
    try {
      const subtasks = await generateSmartSubtasks(content.trim());
      if (subtasks && subtasks.length > 0) {
        const bestMatch = subtasks[0];
        if (bestMatch.notes) setNotes(bestMatch.notes);
        if (bestMatch.assignee) {
          setAssigneeType(bestMatch.assignee.type || 'human');
          setAssigneeName(bestMatch.assignee.name || '');
        }
        if (bestMatch.checklist && bestMatch.checklist.length > 0) {
          const newItems = bestMatch.checklist.map((item, i) => ({
            id: `chk-ai-${Date.now()}-${i}`,
            text: typeof item === 'string' ? item : item.text,
            done: false
          }));
          setChecklist(newItems);
        }
        if (bestMatch.pdca) {
          if (bestMatch.pdca.plan) setPdcaPlan(bestMatch.pdca.plan);
          if (bestMatch.pdca.do) setPdcaDo(bestMatch.pdca.do);
          if (bestMatch.pdca.check) setPdcaCheck(bestMatch.pdca.check);
          if (bestMatch.pdca.act) setPdcaAct(bestMatch.pdca.act);
          setShowPdca(true);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    if (isBlocked && !blockedReason.trim()) return;
    const assignee = assigneeName.trim() ? { type: assigneeType, name: assigneeName.trim() } : null;
    onSave({
      content: content.trim(),
      notes: notes.trim(),
      tags: selectedTags,
      priority,
      startDate: startDate || null,
      dueDate: dueDate || null,
      assignee,
      checklist,
      progress: Number(progress),
      blocked: {
        isBlocked,
        reason: isBlocked ? blockedReason.trim() : '',
        blockedAt: isBlocked ? (initial?.blocked?.blockedAt || Date.now()) : null
      },
      dependsOn: dependsOn || null,
      pdca: { plan: pdcaPlan, do: pdcaDo, check: pdcaCheck, act: pdcaAct },
      documents,
      coverColor,
      estimateMinutes: estimateMinutes === '' ? null : Number(estimateMinutes)
    });
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {mode === 'edit' && (
          <div className={`task-cover-band ${coverColor ? '' : 'empty'}`} style={coverColor ? { background: coverColor } : undefined}>
            <button type="button" className="task-cover-btn" onClick={() => setShowCoverPicker(s => !s)}>
              <Palette size={13} /> {coverColor ? 'Đổi ảnh bìa' : 'Thêm ảnh bìa'}
            </button>
            {showCoverPicker && (
              <div className="task-cover-picker">
                {TAG_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`task-cover-swatch ${coverColor === c.hex ? 'active' : ''}`}
                    style={{ background: c.hex }}
                    title={c.label}
                    onClick={() => { setCoverColor(c.hex); setShowCoverPicker(false); }}
                  />
                ))}
                <button
                  type="button"
                  className="task-cover-swatch none"
                  title="Không có ảnh bìa"
                  onClick={() => { setCoverColor(null); setShowCoverPicker(false); }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2>{mode === 'create' ? 'Thêm công việc' : 'Chi tiết công việc'}</h2>
            <div className="modal-header-actions">
              {mode === 'edit' && isMobile && (
                <button type="button" className="modal-more-btn" onClick={() => setShowMobileMenu(true)}>
                  <MoreVertical size={18} />
                </button>
              )}
              <button type="button" className="close-btn" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="modal-body">
            {mode === 'edit' && (
              <div className="task-quick-action-tiles">
                <button type="button" className="quick-action-tile-btn" onClick={() => scrollToField(newItemInputRef)}>
                  <div className="tile-icon-box accent-teal"><CheckSquare size={14} /></div>
                  <span className="tile-label">Việc nhỏ (Checklist)</span>
                </button>
                <button type="button" className="quick-action-tile-btn" onClick={() => scrollToField(documentsSectionRef)}>
                  <div className="tile-icon-box accent-indigo"><Paperclip size={14} /></div>
                  <span className="tile-label">Đính kèm tệp</span>
                </button>
                <button type="button" className="quick-action-tile-btn" onClick={() => scrollToField(assigneeSectionRef)}>
                  <div className="tile-icon-box accent-amber"><User size={14} /></div>
                  <span className="tile-label">Gán nhân sự / Agent</span>
                </button>
              </div>
            )}

            <div className="modal-section-label">Thông tin chung</div>
            <div className="form-field">
              <div className="label-with-ai-btn">
                <label>Nội dung công việc</label>
                <button
                  type="button"
                  className="ai-autofill-btn"
                  disabled={isAiLoading || !content.trim()}
                  onClick={handleAiAutoFill}
                  title="Tự động sinh Ghi chú, Checklist & PDCA từ tên công việc"
                >
                  {isAiLoading ? <Loader2 className="spin" size={12} /> : <Sparkles size={12} />}
                  {isAiLoading ? 'Đang tạo...' : '✨ AI Gợi ý Chi tiết & Checklist'}
                </button>
              </div>
              <textarea
                autoFocus
                rows={2}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Nhập nội dung công việc (Vd: Đào tạo 2 ngày ở Ninh Bình)..."
              />
            </div>

            <div className="modal-section-label">Phân loại &amp; ghi chú</div>
            <div className="form-field">
              <div className="label-with-action">
                <label><Tag size={13} /> Tag phân hoạch nghiệp vụ</label>
                <button
                  type="button"
                  className="text-action-btn"
                  onClick={() => setShowTagManager(true)}
                >
                  <Settings size={12} /> Quản lý tag
                </button>
              </div>
              <div className="tag-picker-chips">
                {availableTags.map(tag => {
                  const isSelected = selectedTags.includes(tag.name) || selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-picker-chip accent-${tag.color || 'indigo'} ${isSelected ? 'active' : ''}`}
                      onClick={() => toggleTag(tag.name)}
                    >
                      {isSelected && <Check size={11} />}
                      <span>{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-field">
              <label>Ghi chú / Hướng dẫn thực hiện</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Mô tả cách làm, tiêu chuẩn đạt, lưu ý khi thực hiện..."
              />
            </div>

            <div className="modal-section-label">Lịch trình &amp; ưu tiên</div>
            <div className="form-row">
              <div className="form-field">
                <label>Độ ưu tiên</label>
                <select value={priority} onChange={e => setPriority(e.target.value)}>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Tiến độ ({progress}%)</label>
                <input type="range" min="0" max="100" step="5" value={progress} onChange={e => setProgress(e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Ngày bắt đầu</label>
                <input type="date" value={startDate || ''} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Hạn chót</label>
                <input type="date" value={dueDate || ''} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>

            <div className="form-field">
              <label>Thời gian dự kiến (phút)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={estimateMinutes}
                onChange={e => setEstimateMinutes(e.target.value)}
                placeholder="Chưa đặt"
              />
            </div>

            {mode === 'edit' && initial && (
              <TimeTrackingSection task={initial} actualMinutes={initial.actualMinutes || 0} />
            )}

            <div className="modal-section-label">Phân công</div>
            <div className="form-field" ref={assigneeSectionRef}>
              <label>Người phụ trách</label>
              <div className="assignee-type-toggle">
                <button
                  type="button"
                  className={`assignee-type-btn ${assigneeType === 'human' ? 'active' : ''}`}
                  onClick={() => setAssigneeType('human')}
                >
                  <User size={13} /> Con người
                </button>
                <button
                  type="button"
                  className={`assignee-type-btn ${assigneeType === 'agent' ? 'active' : ''}`}
                  onClick={() => setAssigneeType('agent')}
                >
                  <Bot size={13} /> AI Agent
                </button>
              </div>

              <div className="assignee-select-wrap">
                <select
                  className="assignee-select-dropdown"
                  value={assigneeName}
                  onChange={e => {
                    if (e.target.value === '__ADD_NEW__') {
                      setShowPersonnelManager(true);
                    } else {
                      setAssigneeName(e.target.value);
                    }
                  }}
                >
                  <option value="">Chưa gán (Để trống)</option>
                  {getPersonnelForProject(module?.groupId || null, assigneeType).map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name} {p.role ? `(${p.role})` : ''}
                    </option>
                  ))}
                  {/* Keep current assigneeName if it's custom and not in the list */}
                  {assigneeName && !getPersonnelForProject(module?.groupId || null, assigneeType).some(p => p.name === assigneeName) && (
                    <option value={assigneeName}>{assigneeName} (Tuỳ chỉnh)</option>
                  )}
                  <option value="__ADD_NEW__">+ Quản lý & Thêm nhân sự mới...</option>
                </select>
              </div>
            </div>

            {otherTasks.length > 0 && (
              <div className="form-field">
                <label>Phụ thuộc vào công việc khác</label>
                <select value={dependsOn} onChange={e => setDependsOn(e.target.value)}>
                  <option value="">Không phụ thuộc</option>
                  {otherTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.code} — {t.content.slice(0, 50)}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="modal-section-label">Thực thi</div>
            <div className="form-field">
              <label className="blocked-toggle-label">
                <input type="checkbox" checked={isBlocked} onChange={e => setIsBlocked(e.target.checked)} />
                <Ban size={13} /> Công việc đang bị chặn (blocker)
              </label>
              {isBlocked && (
                <textarea
                  rows={2}
                  className="blocked-reason-input"
                  value={blockedReason}
                  onChange={e => setBlockedReason(e.target.value)}
                  placeholder="Bắt buộc: lý do bị chặn, ai/việc gì đang chặn, cần xử lý khi nào..."
                />
              )}
            </div>

            <div className="form-field">
              <label>Việc nhỏ cần làm (Checklist){checklist.length > 0 ? ` — ${doneCount}/${checklist.length}` : ''}</label>
              <div className="checklist-editor">
                {checklist.map(item => (
                  <div key={item.id} className="checklist-row">
                    <button
                      type="button"
                      className={`checklist-toggle ${item.done ? 'done' : ''}`}
                      onClick={() => toggleItem(item.id)}
                    >
                      {item.done && <Check size={13} />}
                    </button>
                    <input
                      type="text"
                      className={item.done ? 'done' : ''}
                      value={item.text}
                      onChange={e => updateItemText(item.id, e.target.value)}
                    />
                    <button type="button" className="checklist-remove-btn" onClick={() => removeItem(item.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="checklist-add-row">
                <input
                  ref={newItemInputRef}
                  type="text"
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={handleAddItemKeyDown}
                  placeholder="Thêm việc nhỏ rồi nhấn Enter..."
                />
                <button type="button" className="checklist-add-btn" onClick={addItem}>
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <div className="modal-section-label">Tài liệu &amp; Nhật ký AI</div>
            <div className="form-field" ref={documentsSectionRef}>
              <label>Tài liệu liên kết (Google Drive)</label>
              <DocumentLinker documents={documents} onChange={setDocuments} />
            </div>

            {mode === 'edit' && initial && <AgentRunPanel task={initial} />}

            {mode === 'edit' && initial && (
              <div className="form-field">
                <label>Ghi chú công việc</label>
                <NotesPanel scopeType="task" scopeId={initial.id} emptyHint="Chưa có ghi chú nào cho công việc này." />
              </div>
            )}

            {mode === 'edit' && (
              <div className="form-field task-activity-section">
                <label><History size={13} /> Nhật ký AI</label>
                {auditEntries.length === 0 ? (
                  <p className="task-activity-empty">Chưa có hành động nào của AI trên thẻ này.</p>
                ) : (
                  <div className="task-activity-list">
                    {auditEntries.map(entry => (
                      <div key={entry.id} className="task-activity-item">
                        <span className="task-activity-dot" />
                        <div className="task-activity-content">
                          <span className="task-activity-label">
                            {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                          </span>
                          {entry.summary && <span className="task-activity-summary">{entry.summary}</span>}
                          <span className="task-activity-when">{formatAuditWhen(entry.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button type="button" className="pdca-toggle-btn" onClick={() => setShowPdca(s => !s)}>
              {showPdca ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Chi tiết PDCA (Plan – Do – Check – Act)
            </button>
            {showPdca && (
              <div className="pdca-section">
                <div className="form-field">
                  <label>Plan — mục tiêu, tiêu chí, kế hoạch</label>
                  <textarea rows={2} value={pdcaPlan} onChange={e => setPdcaPlan(e.target.value)} placeholder="Vấn đề, mục tiêu, owner, deadline, acceptance criteria..." />
                </div>
                <div className="form-field">
                  <label>Do — đã triển khai gì, bằng chứng</label>
                  <textarea rows={2} value={pdcaDo} onChange={e => setPdcaDo(e.target.value)} placeholder="Kết quả, log, link/tệp bằng chứng..." />
                </div>
                <div className="form-field">
                  <label>Check — so sánh kết quả với kế hoạch</label>
                  <textarea rows={2} value={pdcaCheck} onChange={e => setPdcaCheck(e.target.value)} placeholder="Đạt/chưa đạt, số liệu, nguyên nhân..." />
                </div>
                <div className="form-field">
                  <label>Act — chuẩn hoá hoặc điều chỉnh</label>
                  <textarea rows={2} value={pdcaAct} onChange={e => setPdcaAct(e.target.value)} placeholder="Quyết định: chuẩn hoá / sửa lỗi / cải tiến / dừng..." />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {mode === 'edit' && (
              <div className="modal-footer-secondary-actions">
                {onArchive && (
                  <button type="button" className="secondary-btn archive-btn" onClick={onArchive}>
                    <Archive size={15} /> Lưu trữ
                  </button>
                )}
                <button type="button" className="danger-btn" onClick={onDelete}>
                  <Trash2 size={15} /> Xoá
                </button>
              </div>
            )}
            <div className="modal-footer-spacer" />
            <button type="submit" className="primary-btn">
              {mode === 'create' ? <><Plus size={15} /> Thêm</> : <><Save size={15} /> Lưu thay đổi</>}
            </button>
          </div>
        </form>
      </div>

      {mode === 'edit' && (
        <ActionSheet isOpen={showMobileMenu} onClose={() => setShowMobileMenu(false)} title="Tuỳ chọn thẻ">
          {onArchive && (
            <button
              type="button"
              className="action-sheet-item"
              onClick={() => { setShowMobileMenu(false); onArchive(); }}
            >
              <Archive size={16} /> Lưu trữ
            </button>
          )}
          <button
            type="button"
            className="action-sheet-item danger"
            onClick={() => { setShowMobileMenu(false); onDelete(); }}
          >
            <Trash2 size={16} /> Xoá
          </button>
        </ActionSheet>
      )}

      {showTagManager && (
        <TagManagerModal
          onClose={() => setShowTagManager(false)}
          onTagsUpdated={(updated) => setAvailableTags(updated)}
        />
      )}

      {showPersonnelManager && (
        <PersonnelModal
          isOpen={true}
          groups={groups}
          initialProjectId={module?.groupId || ''}
          initialType={assigneeType}
          onClose={() => setShowPersonnelManager(false)}
          onCreated={(person) => {
            setAssigneeType(person.type);
            setAssigneeName(person.name);
            setShowPersonnelManager(false);
          }}
        />
      )}
    </div>
  );
}
