import React, { useState } from 'react';
import { Archive, X, RotateCcw, Trash2, Search, Tag, Calendar, Flag } from 'lucide-react';
import { PRIORITY_LABELS } from '../data/initialData';
import { formatShortDate } from '../utils/boardStorage';
import { getTagByNameOrId } from '../utils/tagStorage';
import { useOverlayClose } from '../utils/useOverlayClose';

export default function ArchivedTasksModal({
  module,
  archivedTasks = [],
  allTags = [],
  onClose,
  onRestoreTask,
  onDeleteTask
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const overlayHandlers = useOverlayClose(onClose);

  const filteredTasks = archivedTasks.filter(task => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = (task.code || '').toLowerCase().includes(q);
      const matchContent = (task.content || '').toLowerCase().includes(q);
      const matchNotes = (task.notes || '').toLowerCase().includes(q);
      if (!matchCode && !matchContent && !matchNotes) return false;
    }
    if (selectedTag) {
      if (!task.tags || !task.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content archived-tasks-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Archive size={20} />
            <div>
              <h2>Hòm lưu trữ thẻ đầu việc</h2>
              <span className="modal-subtitle">Module: {module?.title || module?.code} ({archivedTasks.length} thẻ)</span>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Controls bar: Search + Tag filter */}
          <div className="archived-controls-bar">
            <div className="archived-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Tìm kiếm thẻ lưu trữ (nội dung, mã thẻ...)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="archived-tag-filter">
              <Tag size={13} />
              <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)}>
                <option value="">Tất cả tag ({allTags.length})</option>
                {allTags.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* List of Archived Tasks */}
          {filteredTasks.length === 0 ? (
            <div className="archived-empty-state">
              <Archive size={40} className="empty-icon" />
              <p>
                {archivedTasks.length === 0
                  ? 'Chưa có thẻ công việc nào bị lưu trữ trong module này.'
                  : 'Không tìm thấy thẻ lưu trữ phù hợp với bộ lọc.'}
              </p>
            </div>
          ) : (
            <div className="archived-tasks-list">
              {filteredTasks.map(task => (
                <div key={task.id} className="archived-task-card">
                  <div className="archived-task-header">
                    <div className="archived-task-meta">
                      <span className="task-code-chip">{task.code || module.code}</span>
                      <span className={`priority-tag priority-${task.priority || 'medium'}`}>
                        <Flag size={10} /> {PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium}
                      </span>
                      {task.archivedAt && (
                        <span className="archived-date">
                          <Calendar size={11} /> Lưu trữ: {formatShortDate(new Date(task.archivedAt).toISOString().slice(0, 10))}
                        </span>
                      )}
                    </div>

                    <div className="archived-task-actions">
                      <button
                        type="button"
                        className="restore-btn"
                        title="Khôi phục thẻ về bảng Kanban"
                        onClick={() => onRestoreTask(task.id)}
                      >
                        <RotateCcw size={13} /> Khôi phục
                      </button>
                      <button
                        type="button"
                        className="danger-btn sm"
                        title="Xoá vĩnh viễn thẻ này"
                        onClick={() => {
                          if (window.confirm(`Xoá vĩnh viễn thẻ "${task.content.slice(0, 40)}"?`)) {
                            onDeleteTask(task.id);
                          }
                        }}
                      >
                        <Trash2 size={13} /> Xoá vĩnh viễn
                      </button>
                    </div>
                  </div>

                  <div className="archived-task-content">{task.content}</div>

                  {task.tags && task.tags.length > 0 && (
                    <div className="archived-task-tags">
                      {task.tags.map(tagName => {
                        const tagObj = getTagByNameOrId(allTags, tagName);
                        const color = tagObj?.color || 'indigo';
                        const displayName = tagObj?.name || tagName;
                        return (
                          <span key={tagName} className={`task-tag-badge accent-${color}`}>
                            <Tag size={9} /> {displayName}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
