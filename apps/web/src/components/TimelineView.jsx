import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, User, Bot, Flag } from 'lucide-react';
import { formatShortDate } from '../utils/boardStorage';
import { PRIORITY_LABELS } from '../data/initialData';
import AgentRunBadge from './AgentRunBadge';
import { useIsMobile } from '../utils/useIsMobile';

export default function TimelineView({ tasks = [], module, onSelectTask }) {
  const [currentMonthOffset, setCurrentMonthOffset] = useState(0);

  const taskList = useMemo(() => Object.values(tasks || {}), [tasks]);

  // Real color palette for timeline pill bars
  const barColors = [
    { bg: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)', text: '#fff' }, // Purple-Blue
    { bg: 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)', text: '#fff' }, // Cyan-Blue
    { bg: 'linear-gradient(90deg, #ec4899 0%, #f43f5e 100%)', text: '#fff' }, // Soft Pink-Rose
    { bg: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)', text: '#fff' }, // Warm Amber
    { bg: 'linear-gradient(90deg, #10b981 0%, #059669 100%)', text: '#fff' }, // Emerald Green
  ];

  const dateRange = useMemo(() => {
    const dates = taskList.flatMap((t) => [t.startDate, t.dueDate]).filter(Boolean);
    let minMs = new Date('2026-07-23').getTime();
    let maxMs = new Date('2026-07-31').getTime();
    if (dates.length > 0) {
      const validMs = dates.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
      if (validMs.length > 0) {
        minMs = Math.min(...validMs);
        maxMs = Math.max(...validMs);
      }
    }

    const start = new Date(minMs);
    start.setHours(0, 0, 0, 0);

    const end = new Date(maxMs);
    end.setHours(23, 59, 59, 999);

    if (end.getTime() - start.getTime() < 8 * 86400000) {
      end.setTime(start.getTime() + 9 * 86400000 - 1);
    }

    const days = [];
    const curr = new Date(start.getTime());
    while (curr <= end) {
      const dStr = `${String(curr.getDate()).padStart(2, '0')}/${String(curr.getMonth() + 1).padStart(2, '0')}`;
      days.push({
        dateStr: dStr,
        fullDateStr: curr.toISOString().split('T')[0]
      });
      curr.setDate(curr.getDate() + 1);
    }

    return {
      days,
      rangeStartMs: start.getTime(),
      rangeEndMs: end.getTime(),
      totalSpanMs: Math.max(86400000, end.getTime() - start.getTime())
    };
  }, [taskList]);

  // Real dynamic metrics calculated from taskList
  const metrics = useMemo(() => {
    const total = taskList.length || 1;
    const completedCount = taskList.filter(t => t.progress >= 100).length;
    const overallProgress = Math.round(taskList.reduce((acc, t) => acc + (t.progress || 0), 0) / total);

    const humanTasks = taskList.filter(t => !t.assignee || t.assignee.type === 'human');
    const humanProgress = Math.round(humanTasks.reduce((acc, t) => acc + (t.progress || 0), 0) / (humanTasks.length || 1));

    const agentTasks = taskList.filter(t => t.assignee?.type === 'agent');
    const agentProgress = Math.round(agentTasks.reduce((acc, t) => acc + (t.progress || 0), 0) / (agentTasks.length || 1));

    return {
      total,
      completedCount,
      overallProgress,
      humanTasksCount: humanTasks.length,
      humanProgress,
      agentTasksCount: agentTasks.length,
      agentProgress
    };
  }, [taskList]);

  // Calculate exact positioning of each task bar from its real startDate and dueDate
  const calculateBarStyles = (task, index) => {
    const color = barColors[index % barColors.length];
    const { rangeStartMs, rangeEndMs, totalSpanMs } = dateRange;

    let startMs = task.startDate ? new Date(task.startDate).getTime() : rangeStartMs;
    let dueMs = task.dueDate ? new Date(task.dueDate).getTime() : startMs + 2 * 86400000;
    if (isNaN(startMs)) startMs = rangeStartMs;
    if (isNaN(dueMs) || dueMs <= startMs) dueMs = startMs + 2 * 86400000;

    const offsetMs = Math.max(0, startMs - rangeStartMs);
    const durationMs = Math.max(86400000, dueMs - startMs);

    const leftPercent = Math.max(0, Math.min(98, (offsetMs / totalSpanMs) * 100));
    const widthPercent = Math.max(3, Math.min(100 - leftPercent, (durationMs / totalSpanMs) * 100));

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
      background: color.bg,
      color: color.text
    };
  };

  const isMobile = useIsMobile();
  const dayColWidth = isMobile ? 56 : 110;
  const trackWidthPx = dateRange.days.length * dayColWidth;

  return (
    <div className="timeline-view-container">
      {/* Top Controls Bar */}
      <div className="timeline-header-controls">
        <div className="timeline-date-picker">
          <CalendarIcon size={16} className="text-primary-icon" />
          <span className="current-date-text">Tháng 7, 2026 ({taskList.length} Công việc)</span>
          <div className="date-nav-btns">
            <button className="icon-subtle-btn" onClick={() => setCurrentMonthOffset(prev => prev - 1)}><ChevronLeft size={14} /></button>
            <button className="icon-subtle-btn" onClick={() => setCurrentMonthOffset(prev => prev + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* Main Gantt Grid Container with Sticky Columns */}
      <div className="gantt-grid-card">
        <div className="scrollable-timeline-container">
          <div className="gantt-table-header">
            <div className="gantt-col-stt gantt-sticky-col-1">STT</div>
            <div className="gantt-col-name gantt-sticky-col-2">Tên Công Việc ({taskList.length})</div>
            <div className="gantt-col-assignee gantt-sticky-col-3">Phụ Trách</div>
            <div className="gantt-timeline-slots-track" style={{ width: `${trackWidthPx}px` }}>
              {dateRange.days.map((day, idx) => (
                <div key={idx} className="gantt-slot-header" style={{ width: `${dayColWidth}px` }}>
                  {day.dateStr}
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable Rows Container */}
          <div className="gantt-rows-body">
            {taskList.map((task, index) => {
              const barStyle = calculateBarStyles(task, index);
              const taskProgress = task.progress || 0;
              const modulePrefix = module?.code ? `${module.code}-` : '';
              const displayCode = task.code && modulePrefix && task.code.startsWith(modulePrefix)
                ? task.code.slice(modulePrefix.length)
                : (task.code || `${index + 1}`);

              return (
                <div
                  key={task.id}
                  className="gantt-row clickable-gantt-row"
                  onClick={() => onSelectTask && onSelectTask(task)}
                  title="Bấm để xem và chỉnh sửa thông tin chi tiết công việc"
                >
                  <div className="gantt-sticky-col-1">
                    <span className={`gantt-task-code type-${module?.type || 'product'}`}>{displayCode}</span>
                  </div>

                  <div className="gantt-task-info gantt-sticky-col-2">
                    <div className="gantt-task-meta-row">
                      <span className={`priority-tag priority-${task.priority || 'medium'}`}>
                        <Flag size={9} /> {PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium}
                      </span>
                      <AgentRunBadge agentRun={task.agentRun} size={10} />
                    </div>
                    <span className="gantt-task-title" data-tooltip={`${task.code || ''}: ${task.content}`}>
                      {task.content}
                    </span>
                  </div>

                  <div className="gantt-sticky-col-3">
                    {task.assignee ? (
                      <span className="pill-assignee-inline">
                        {task.assignee.type === 'agent' ? <Bot size={11} /> : <User size={11} />}
                        <span>{task.assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </div>

                  <div className="gantt-bar-track-wrapper" style={{ width: `${trackWidthPx}px` }}>
                    <div className="gantt-grid-lines">
                      {dateRange.days.map((_, idx) => (
                        <div key={idx} className="gantt-grid-line" style={{ width: `${dayColWidth}px` }} />
                      ))}
                    </div>
                    <div className="gantt-bar-track">
                      <div
                        className="gantt-pill-bar"
                        data-tooltip={`${task.code || ''}: ${task.content} | Bắt đầu: ${formatShortDate(task.startDate)} ➔ Hạn: ${formatShortDate(task.dueDate)} | Tiến độ: ${taskProgress}%`}
                        style={barStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectTask) onSelectTask(task);
                        }}
                      >
                        <div className="pill-bar-content">
                          <span className="pill-duration">
                            <Clock size={12} /> {taskProgress}%
                          </span>
                        </div>
                        <div
                          className="pill-progress-overlay"
                          style={{ width: `${taskProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {taskList.length === 0 && (
              <div className="gantt-empty-state">
                Chưa có công việc nào trong danh sách. Hãy thêm công việc mới.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real Summary Metrics Cards Grid */}
      <div className="timeline-bottom-summary">
        <div className="summary-project-card card-purple">
          <div className="summary-card-header">
            <div className="summary-card-icon"><User size={18} /></div>
            <div className="summary-card-info">
              <div className="summary-card-title">Đội Nguồn Nhân Sự (Human)</div>
              <div className="summary-card-sub">{metrics.humanTasksCount} Thẻ được phân công</div>
            </div>
          </div>
          <div className="summary-progress-bar">
            <div className="summary-fill" style={{ width: `${metrics.humanProgress}%` }} />
          </div>
          <div className="summary-card-footer">
            <span>Tiến độ Nhân sự: {metrics.humanProgress}%</span>
            <span>{metrics.humanTasksCount} Thẻ</span>
          </div>
        </div>

        <div className="summary-project-card card-cyan">
          <div className="summary-card-header">
            <div className="summary-card-icon"><Bot size={18} /></div>
            <div className="summary-card-info">
              <div className="summary-card-title">Hệ Thống AI Agents</div>
              <div className="summary-card-sub">{metrics.agentTasksCount} Thẻ phân công AI</div>
            </div>
          </div>
          <div className="summary-progress-bar">
            <div className="summary-fill" style={{ width: `${metrics.agentProgress}%` }} />
          </div>
          <div className="summary-card-footer">
            <span>Tiến độ AI: {metrics.agentProgress}%</span>
            <span>{metrics.agentTasksCount} Thẻ</span>
          </div>
        </div>

        <div className="summary-project-card card-amber">
          <div className="summary-card-header">
            <div className="summary-card-icon"><CalendarIcon size={18} /></div>
            <div className="summary-card-info">
              <div className="summary-card-title">Tiến Độ Dự Án Tổng Thể</div>
              <div className="summary-card-sub">{module?.title || 'Dự Án Hiển Thị'}</div>
            </div>
          </div>
          <div className="summary-progress-bar">
            <div className="summary-fill" style={{ width: `${metrics.overallProgress}%` }} />
          </div>
          <div className="summary-card-footer">
            <span>Đã hoàn thành: {metrics.completedCount}/{metrics.total} thẻ</span>
            <span>TB: {metrics.overallProgress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
