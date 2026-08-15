import React, { useState } from 'react';
import { Sparkles, X, Check, Loader2, Plus, Calendar, Flag, User, Bot, Layers } from 'lucide-react';
import { generateSmartSubtasks } from '../utils/aiTaskGenerator';
import { useOverlayClose } from '../utils/useOverlayClose';

export default function AiTaskBreakdownModal({ module, columnId, onClose, onAddTasks }) {
  const [goalTitle, setGoalTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const overlayHandlers = useOverlayClose(onClose);

  const handleGenerate = async () => {
    if (!goalTitle.trim()) return;
    setIsLoading(true);
    try {
      const tasks = await generateSmartSubtasks(goalTitle.trim(), module.title);
      setSuggestedTasks(tasks);
      setSelectedIndices(tasks.map((_, i) => i)); // select all by default
    } catch {
      // fallback handled inside generateSmartSubtasks
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (index) => {
    setSelectedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleConfirmAdd = () => {
    const tasksToAdd = selectedIndices.map(i => suggestedTasks[i]);
    if (tasksToAdd.length === 0) return;
    onAddTasks(tasksToAdd);
    onClose();
  };

  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content ai-breakdown-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Sparkles className="icon-glow" size={20} />
            <h2>Trợ Lý AI Phân Chẻ & Gợi Ý Đầu Việc</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="ai-breakdown-desc">
            Nhập mục tiêu, khóa học hoặc dự án lớn (Ví dụ: <i>"Đào tạo 2 ngày thứ 7, CN tuần sau ở Ninh Bình cho Cán bộ viên chức tỉnh Ninh Bình"</i>), AI sẽ tự động phân tích và tạo danh sách các thẻ công việc To-Do chi tiết với đầy đủ Hạn chót, Checklist & PDCA.
          </p>

          <div className="ai-input-row">
            <input
              type="text"
              autoFocus
              className="ai-goal-input"
              value={goalTitle}
              onChange={e => setGoalTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="Nhập mục tiêu / dự án cần phân chẻ..."
            />
            <button
              className="primary-btn ai-generate-btn"
              disabled={isLoading || !goalTitle.trim()}
              onClick={handleGenerate}
            >
              {isLoading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              {isLoading ? 'Đang phân tích...' : 'Gợi ý bằng AI'}
            </button>
          </div>

          {suggestedTasks.length > 0 && (
            <div className="ai-suggestions-preview">
              <div className="suggestions-header">
                <h3><Layers size={16} /> Danh sách thẻ công việc được gợi ý ({selectedIndices.length}/{suggestedTasks.length})</h3>
              </div>

              <div className="suggestions-list">
                {suggestedTasks.map((task, idx) => (
                  <div
                    key={idx}
                    className={`suggestion-card ${selectedIndices.includes(idx) ? 'selected' : ''}`}
                    onClick={() => toggleSelect(idx)}
                  >
                    <div className="suggestion-checkbox">
                      <div className={`checkbox-square ${selectedIndices.includes(idx) ? 'checked' : ''}`}>
                        {selectedIndices.includes(idx) && <Check size={12} />}
                      </div>
                    </div>

                    <div className="suggestion-body">
                      <div className="suggestion-title">{task.content}</div>
                      
                      <div className="suggestion-meta">
                        <span className={`priority-tag priority-${task.priority || 'medium'}`}>
                          <Flag size={10} /> {task.priority?.toUpperCase() || 'MEDIUM'}
                        </span>
                        
                        {task.dueDate && (
                          <span className="task-card-due">
                            <Calendar size={11} /> {task.dueDate}
                          </span>
                        )}

                        {task.assignee && (
                          <span className="assignee-chip">
                            {task.assignee.type === 'agent' ? <Bot size={10} /> : <User size={10} />}
                            {task.assignee.name}
                          </span>
                        )}
                      </div>

                      {task.notes && <p className="suggestion-notes">{task.notes}</p>}

                      {task.checklist && task.checklist.length > 0 && (
                        <div className="suggestion-checklist">
                          <strong>Checklist ({task.checklist.length} việc nhỏ):</strong>
                          <ul>
                            {task.checklist.map((item, i) => (
                              <li key={i}>{typeof item === 'string' ? item : item.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary-btn" onClick={onClose}>
            Hủy
          </button>
          {suggestedTasks.length > 0 && (
            <button
              className="primary-btn"
              disabled={selectedIndices.length === 0}
              onClick={handleConfirmAdd}
            >
              <Plus size={16} /> Thêm {selectedIndices.length} thẻ gợi ý vào bảng To-Do
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
