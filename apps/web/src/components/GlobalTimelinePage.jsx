import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Clock, User, Bot, Filter, Flag } from 'lucide-react';
import { loadAllBoards, formatShortDate } from '../utils/boardStorage';
import { updateTask, deleteTask } from '../utils/taskOperations';
import { PRIORITY_LABELS } from '../data/initialData';
import HeaderActions from './HeaderActions';
import TaskModal from './TaskModal';
import AgentRunBadge from './AgentRunBadge';
import { useIsMobile } from '../utils/useIsMobile';

const BAR_COLORS = [
  { bg: 'linear-gradient(90deg, #3452c4 0%, #5a5fae 100%)', text: '#fff' },
  { bg: 'linear-gradient(90deg, #10bfe9 0%, #1f8fcf 100%)', text: '#fff' },
  { bg: 'linear-gradient(90deg, #7b83c9 0%, #5a5fae 100%)', text: '#fff' },
  { bg: 'linear-gradient(90deg, #0e7d95 0%, #10bfe9 100%)', text: '#fff' }
];

const oneDay = 86400000;

// Nền riêng cho header từng module theo đúng accent đã gán ở INITIAL_MODULES
// (cùng bộ token với task-code-chip accent-*) - để phân biệt ranh giới giữa
// các khối module khi cuộn, thay vì tất cả cùng 1 tông --bg-surface-alt.
const MODULE_HEADER_BG = {
  amber: 'var(--amber-soft)', indigo: 'var(--indigo-soft)', rose: 'var(--rose-soft)',
  teal: 'var(--teal-soft)', violet: 'var(--violet-soft)', sky: 'var(--sky-soft)',
  emerald: 'var(--emerald-soft)', pink: 'var(--pink-soft)'
};

// Trang Timeline TOÀN CÔNG TY (khác với tab "Timeline" trong 1 module): xem
// tiến độ mọi module cùng lúc, và là nơi thêm/sửa/bỏ các đầu việc mà agent đã
// tự lên kế hoạch (assignee.type === 'agent') trước khi con người duyệt qua
// Kanban - xem yêu cầu gốc trong plan.
export default function GlobalTimelinePage({ theme, onToggleTheme, onJumpToModule, flatModules }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [agentOnly, setAgentOnly] = useState(false);
  const [taskModal, setTaskModal] = useState(null); // { module, task }

  // Danh sách dự án rút gọn (chỉ id/title) cho ô "Người phụ trách" của
  // TaskModal - trang này chỉ có flatModules (từng module đã kèm groupId/
  // groupTitle), không có mảng "dự án" gốc như Board.jsx nên tự dựng lại từ
  // flatModules, khử trùng theo groupId.
  const allProjects = useMemo(() => {
    const map = new Map();
    flatModules.forEach((m) => {
      if (!map.has(m.groupId)) map.set(m.groupId, { id: m.groupId, title: m.groupTitle });
    });
    return Array.from(map.values());
  }, [flatModules]);

  const groups = useMemo(() => {
    const boards = loadAllBoards(flatModules);
    return boards
      .map(({ module, board }) => {
        const allTasks = Object.values(board.tasks || {});
        const tasks = agentOnly ? allTasks.filter((t) => t.assignee?.type === 'agent') : allTasks;
        const doneCount = board.columns?.[board.columnOrder?.[board.columnOrder.length - 1]]?.taskIds?.length || 0;
        return { module, board, tasks, totalCount: allTasks.length, doneCount };
      })
      .filter((g) => g.tasks.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatModules, agentOnly, refreshTick]);

  const allVisibleTasks = useMemo(() => groups.flatMap((g) => g.tasks), [groups]);
  const totalTasks = allVisibleTasks.length;
  const humanTasks = allVisibleTasks.filter((t) => !t.assignee || t.assignee.type === 'human');
  const agentTasks = allVisibleTasks.filter((t) => t.assignee?.type === 'agent');
  const avgProgress = (list) => (list.length ? Math.round(list.reduce((s, t) => s + (t.progress || 0), 0) / list.length) : 0);
  const overallDone = groups.reduce((s, g) => s + g.doneCount, 0);
  const overallTotal = groups.reduce((s, g) => s + g.totalCount, 0);

  const baseStartMs = useMemo(() => {
    const dates = groups.flatMap((g) => g.tasks.map((t) => t.startDate).filter(Boolean));
    if (dates.length === 0) return Date.now();
    return Math.min(...dates.map((d) => new Date(d).getTime()));
  }, [groups]);

  const baseEndMs = useMemo(() => {
    const dates = groups.flatMap((g) => g.tasks.map((t) => t.dueDate).filter(Boolean));
    if (dates.length === 0) return baseStartMs + 8 * oneDay;
    return Math.max(...dates.map((d) => new Date(d).getTime()), baseStartMs + oneDay);
  }, [groups, baseStartMs]);

  // Trục ngày thật (không hardcode) - chia khoảng thời gian thật của toàn bộ
  // dữ liệu thành ~8 mốc để người xem biết bar đang nằm ở ngày nào.
  const dateRange = useMemo(() => {
    const dates = groups.flatMap((g) => g.tasks.flatMap((t) => [t.startDate, t.dueDate])).filter(Boolean);
    let minMs = Date.now();
    let maxMs = Date.now() + 8 * oneDay;
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

    if (end.getTime() - start.getTime() < 9 * oneDay) {
      end.setTime(start.getTime() + 10 * oneDay - 1);
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
      totalSpanMs: Math.max(oneDay, end.getTime() - start.getTime())
    };
  }, [groups]);

  const calculateBarStyle = (task, colorIndex) => {
    const color = BAR_COLORS[colorIndex % BAR_COLORS.length];
    const { rangeStartMs, rangeEndMs, totalSpanMs } = dateRange;

    let startMs = task.startDate ? new Date(task.startDate).getTime() : rangeStartMs;
    let dueMs = task.dueDate ? new Date(task.dueDate).getTime() : startMs + 2 * oneDay;
    if (isNaN(startMs)) startMs = rangeStartMs;
    if (isNaN(dueMs) || dueMs <= startMs) dueMs = startMs + 2 * oneDay;

    const offsetMs = Math.max(0, startMs - rangeStartMs);
    const durationMs = Math.max(oneDay, dueMs - startMs);

    const leftPercent = Math.max(0, Math.min(98, (offsetMs / totalSpanMs) * 100));
    const widthPercent = Math.max(3, Math.min(100 - leftPercent, (durationMs / totalSpanMs) * 100));

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
      background: color.bg,
      color: color.text
    };
  };

  const openEditModal = (module, task) => setTaskModal({ module, task });
  const closeTaskModal = () => setTaskModal(null);

  const handleSaveTask = (data) => {
    if (!taskModal) return;
    updateTask(taskModal.module.id, taskModal.task.id, data);
    setRefreshTick((t) => t + 1);
    closeTaskModal();
  };

  const handleDeleteTask = () => {
    if (!taskModal) return;
    if (!window.confirm('Xoá công việc này?')) return;
    deleteTask(taskModal.module.id, taskModal.task.id);
    setRefreshTick((t) => t + 1);
    closeTaskModal();
  };

  const isMobile = useIsMobile();
  const dayColWidth = isMobile ? 56 : 110;
  const trackWidthPx = dateRange.days.length * dayColWidth;

  return (
    <div className="board-container">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Timeline</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
        <div className="board-title-section">
          <div className="board-title-row">
            <h1>Timeline Toàn Công Ty</h1>
          </div>
          <p className="board-subtitle">
            Tiến độ tất cả module cùng lúc - nơi xem, thêm, sửa hoặc bỏ các đầu việc agent đã tự lên kế hoạch trước khi duyệt qua Kanban.
          </p>
        </div>
      </div>

      <div className="global-timeline-scroll">
        <div className="timeline-bottom-summary global-timeline-summary-cards">
          <div className="summary-project-card card-purple">
            <div className="summary-card-header">
              <div className="summary-card-icon"><User size={18} /></div>
              <div className="summary-card-info">
                <div className="summary-card-title">Đội Nguồn Nhân Sự (Human)</div>
                <div className="summary-card-sub">{humanTasks.length} thẻ được phân công</div>
              </div>
            </div>
            <div className="summary-progress-bar"><div className="summary-fill" style={{ width: `${avgProgress(humanTasks)}%` }} /></div>
            <div className="summary-card-footer">
              <span>Tiến độ: {avgProgress(humanTasks)}%</span>
              <span>{humanTasks.length} thẻ</span>
            </div>
          </div>

          <div className="summary-project-card card-cyan">
            <div className="summary-card-header">
              <div className="summary-card-icon"><Bot size={18} /></div>
              <div className="summary-card-info">
                <div className="summary-card-title">Hệ Thống AI Agents</div>
                <div className="summary-card-sub">{agentTasks.length} thẻ phân công AI</div>
              </div>
            </div>
            <div className="summary-progress-bar"><div className="summary-fill" style={{ width: `${avgProgress(agentTasks)}%` }} /></div>
            <div className="summary-card-footer">
              <span>Tiến độ AI: {avgProgress(agentTasks)}%</span>
              <span>{agentTasks.length} thẻ</span>
            </div>
          </div>

          <div className="summary-project-card card-amber">
            <div className="summary-card-header">
              <div className="summary-card-icon"><CalendarIcon size={18} /></div>
              <div className="summary-card-info">
                <div className="summary-card-title">Tiến Độ Toàn Công Ty</div>
                <div className="summary-card-sub">{groups.length} module đang có việc</div>
              </div>
            </div>
            <div className="summary-progress-bar">
              <div className="summary-fill" style={{ width: `${overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0}%` }} />
            </div>
            <div className="summary-card-footer">
              <span>Đã hoàn thành: {overallDone}/{overallTotal}</span>
              <span>TB: {overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        <div className="global-timeline-toolbar">
          <div className="global-timeline-summary">
            <CalendarIcon size={15} /> {totalTasks} công việc trong {groups.length} module · {agentTasks.length} do agent phụ trách
          </div>
          <button
            type="button"
            className={`global-timeline-filter-btn ${agentOnly ? 'active' : ''}`}
            onClick={() => setAgentOnly((v) => !v)}
          >
            <Filter size={13} /> {agentOnly ? 'Đang lọc: Agent lên kế hoạch' : 'Tất cả đầu việc'}
          </button>
        </div>

        {/* Scrollable Timeline Grid Container with Sticky Columns */}
        <div className="scrollable-timeline-container">
          <div className="global-timeline-axis-header">
            <div className="gantt-sticky-col-1">STT</div>
            <div className="gantt-sticky-col-2">Tên Công Việc ({totalTasks})</div>
            <div className="gantt-sticky-col-3">Phụ Trách</div>
            <div className="gantt-timeline-slots-track" style={{ width: `${trackWidthPx}px` }}>
              {dateRange.days.map((day, idx) => (
                <div key={idx} className="gantt-slot-header" style={{ width: `${dayColWidth}px` }}>
                  {day.dateStr}
                </div>
              ))}
            </div>
          </div>

          {groups.map((group, gi) => {
            const pct = group.totalCount ? Math.round((group.doneCount / group.totalCount) * 100) : 0;
            return (
              <div key={group.module.id} className="global-timeline-module-block">
                <div
                  className="global-timeline-module-header"
                  style={{ background: MODULE_HEADER_BG[group.module.accent] || MODULE_HEADER_BG.indigo }}
                >
                  <div className="global-timeline-module-header-left">
                    <span className={`task-code-chip accent-${group.module.accent || 'indigo'}`}>{group.module.code}</span>
                    <span className="global-timeline-module-title">{group.module.title}</span>
                  </div>
                  <div className="global-timeline-module-header-right">
                    <span className="global-timeline-module-progress">{group.doneCount}/{group.totalCount} · {pct}%</span>
                    <span className="global-timeline-module-count">{group.tasks.length} hiển thị</span>
                  </div>
                </div>
                <div className="gantt-rows-body">
                  {group.tasks.map((task, ti) => {
                    const barStyle = calculateBarStyle(task, gi + ti);
                    const progress = task.progress || 0;
                    return (
                      <div
                        key={task.id}
                        className="gantt-row clickable-gantt-row"
                        onClick={() => openEditModal(group.module, task)}
                        title="Bấm để xem và chỉnh sửa"
                      >
                        <div className="gantt-sticky-col-1">
                          <span className="gantt-task-code">{task.code}</span>
                        </div>
                        <div className="gantt-task-info gantt-sticky-col-2">
                          <div className="gantt-task-meta-row">
                            <span className={`priority-tag priority-${task.priority || 'medium'}`}>
                              <Flag size={9} /> {PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium}
                            </span>
                            <AgentRunBadge agentRun={task.agentRun} size={10} />
                          </div>
                          <span className="gantt-task-title" data-tooltip={`${task.code}: ${task.content}`}>{task.content}</span>
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
                              style={barStyle}
                              data-tooltip={`${task.code}: ${task.content} | Bắt đầu: ${formatShortDate(task.startDate)} ➔ Hạn: ${formatShortDate(task.dueDate)} | Tiến độ: ${progress}%`}
                            >
                              <div className="pill-bar-content">
                                <span className="pill-duration">
                                  <Clock size={11} /> {progress}%
                                </span>
                              </div>
                              <div className="pill-progress-overlay" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {groups.length === 0 && (
          <div className="gantt-empty-state">
            {agentOnly ? 'Chưa có đầu việc nào do agent lên kế hoạch.' : 'Chưa có công việc nào.'}
          </div>
        )}
      </div>

      {taskModal && (
        <TaskModal
          mode="edit"
          initial={taskModal.task}
          allTasks={Object.values(groups.find((g) => g.module.id === taskModal.module.id)?.board.tasks || {})}
          module={taskModal.module}
          groups={allProjects}
          onClose={closeTaskModal}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
