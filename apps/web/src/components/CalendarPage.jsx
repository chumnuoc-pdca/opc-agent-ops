import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Plus, Clock,
  Filter, Check, User, Bot, Layers, ArrowUpRight, MoreHorizontal, Flag,
  Circle, CheckCircle2
} from 'lucide-react';
import { loadAllBoards, loadModuleBoard, formatShortDate } from '../utils/boardStorage';
import { updateTask, moveTask, createTask } from '../utils/taskOperations';
import { onDataChanged } from '../utils/dataBus';
import { PRIORITY_LABELS } from '../data/initialData';
import HeaderActions from './HeaderActions';
import TimeBlockGrid from './TimeBlockGrid';
import { useOverlayClose } from '../utils/useOverlayClose';
import { useIsMobile } from '../utils/useIsMobile';

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
// Compact tabs/grid headers read "Chủ Nhật" as an outlier next to "Thứ 2"..."Thứ 7" -
// abbreviate just that one, per the requested "CN" shorthand.
const shortDayName = (name) => (name === 'Chủ Nhật' ? 'CN' : name);
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

const toISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const buildMonthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push(date);
  }
  return days;
};

export default function CalendarPage({ theme, onToggleTheme, onJumpToModule, flatModules }) {
  const isMobile = useIsMobile();
  const today = useMemo(() => new Date(), []);
  const [activeDate, setActiveDate] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState('weekly'); // 'daily' | 'weekly' | 'monthly'
  const [selectedTaskDetail, setSelectedTaskDetail] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const dayTasksOverlayHandlers = useOverlayClose(() => setSelectedDate(null));
  const taskDetailOverlayHandlers = useOverlayClose(() => setSelectedTaskDetail(null));
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreateTaskForDate = (dateISO) => {
    const targetModule = flatModules && flatModules.length > 0 ? flatModules[0] : null;
    if (!targetModule) {
      alert('Chưa có mô hình nào trong hệ thống để gán đầu việc.');
      return;
    }
    const title = window.prompt(`Tạo đầu việc mới cho ngày ${formatShortDate(dateISO)}:`);
    if (!title || !title.trim()) return;
    try {
      createTask(targetModule.id, 'todo', {
        content: title.trim(),
        startDate: dateISO,
        dueDate: dateISO
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message || 'Không thể tạo đầu việc.');
    }
  };

  const daysInMonthList = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const todayISOStr = toISO(today);
    const list = [];
    for (let d = 1; d <= lastDayNum; d++) {
      const dateObj = new Date(year, month, d);
      const iso = toISO(dateObj);
      const dayIndex = (dateObj.getDay() + 6) % 7;
      const dayName = shortDayName(WEEKDAYS[dayIndex]);
      list.push({
        dayName,
        dayNum: d,
        iso,
        isToday: iso === todayISOStr
      });
    }
    return list;
  }, [cursor, today]);

  // Active filters state
  const [activeFilters, setActiveFilters] = useState({
    meetings: true,
    taskDueDates: true,
    milestones: true,
    deadlines: true
  });

  // Listen to data bus changes so calendar updates live whenever tasks change anywhere
  useEffect(() => onDataChanged(() => setRefreshKey(k => k + 1)), []);

  // Real-time clock state for schedule timeline line indicator
  const [nowTime, setNowTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedRealtime = useMemo(() => {
    const h = nowTime.getHours();
    const m = String(nowTime.getMinutes()).padStart(2, '0');
    const s = String(nowTime.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = String(h % 12 || 12).padStart(2, '0');
    return `${displayH}:${m}:${s} ${ampm}`;
  }, [nowTime]);

  const currentLineTop = useMemo(() => {
    const h = nowTime.getHours();
    const m = nowTime.getMinutes();
    const s = nowTime.getSeconds();
    const startHour = 9;
    const rowHeight = 60;
    const elapsedHours = (h - startHour) + (m / 60) + (s / 3600);
    const calculatedTop = elapsedHours * rowHeight;
    return Math.max(0, Math.min(538, Math.round(calculatedTop)));
  }, [nowTime]);

  const allTasksList = useMemo(() => {
    const list = [];
    loadAllBoards(flatModules).forEach(({ module, board }) => {
      Object.values(board.tasks || {}).forEach(task => {
        list.push({ module, task });
      });
    });
    return list;
  }, [flatModules, refreshKey]);

  // Compute category counts for filter badges
  const filterCounts = useMemo(() => {
    let meetings = 0;
    let taskDueDates = 0;
    let milestones = 0;
    let deadlines = 0;

    allTasksList.forEach(({ task }) => {
      const content = (task.content || '').toLowerCase();
      if (/meeting|huddle|sync|họp|call|đào tạo|review|báo cáo|thảo luận|trao đổi/i.test(content)) meetings++;
      if (task.dueDate || task.startDate) taskDueDates++;
      if (/mốc|gate|milestone|bootcamp|incubation|giai đoạn|launch|tốt nghiệp|vibe/i.test(content)) milestones++;
      if (task.priority === 'urgent' || /gate|0-14 ngày|15-30 ngày|31-60 ngày|61-90 ngày|91-180 ngày/i.test(content)) deadlines++;
    });

    return { meetings, taskDueDates, milestones, deadlines };
  }, [allTasksList]);

  // Featured upcoming meeting or event card
  const upcomingMeeting = useMemo(() => {
    const meetingTask = allTasksList.find(({ task }) => {
      const content = (task.content || '').toLowerCase();
      const isMeeting = /meeting|huddle|sync|họp|call|đào tạo|review|báo cáo/i.test(content);
      return isMeeting && task.progress < 100 && !task.blocked?.isBlocked;
    });
    if (meetingTask) return meetingTask;
    const firstPending = allTasksList.find(({ task }) => task.progress < 100 && !task.blocked?.isBlocked);
    return firstPending || null;
  }, [allTasksList]);

  // Real-time filtering logic across dates
  const filteredTasksByDate = useMemo(() => {
    const filteredMap = new Map();
    const todayISOStr = toISO(today);

    allTasksList.forEach(item => {
      const { task } = item;
      const contentLower = (task.content || '').toLowerCase();
      const isMeeting = /meeting|huddle|sync|họp|call|đào tạo|review|báo cáo|thảo luận|trao đổi/i.test(contentLower);
      const isMilestone = /mốc|gate|milestone|bootcamp|incubation|giai đoạn|launch|tốt nghiệp|vibe/i.test(contentLower);
      const isDeadline = task.priority === 'urgent' || /gate|0-14 ngày|15-30 ngày|31-60 ngày|61-90 ngày|91-180 ngày/i.test(contentLower);
      const isDueDate = Boolean(task.dueDate || task.startDate);

      if (isMeeting && !activeFilters.meetings) return;
      if (isMilestone && !activeFilters.milestones) return;
      if (isDeadline && !activeFilters.deadlines) return;
      if (!activeFilters.taskDueDates && isDueDate && !isMeeting && !isMilestone && !isDeadline) return;

      const sIso = task.startDate || task.dueDate || todayISOStr;
      const dIso = task.dueDate || task.startDate || todayISOStr;

      let cur = new Date(sIso);
      let end = new Date(dIso);
      if (isNaN(cur.getTime())) cur = new Date(todayISOStr);
      if (isNaN(end.getTime())) end = new Date(todayISOStr);
      if (end < cur) end = cur;

      let count = 0;
      while (cur <= end && count < 14) {
        const k = toISO(cur);
        if (!filteredMap.has(k)) filteredMap.set(k, []);
        if (!filteredMap.get(k).some(t => t.task.id === task.id)) {
          filteredMap.get(k).push(item);
        }
        cur.setDate(cur.getDate() + 1);
        count++;
      }
    });

    return filteredMap;
  }, [allTasksList, activeFilters, today]);

  const tasksByDate = filteredTasksByDate;

  const days = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const todayISO = toISO(today);

  const goPrevMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNextMonth = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));

  const goPrevDate = () => {
    if (viewMode === 'daily') {
      setActiveDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    } else if (viewMode === 'weekly') {
      setActiveDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
    } else {
      goPrevMonth();
    }
  };

  const goNextDate = () => {
    if (viewMode === 'daily') {
      setActiveDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    } else if (viewMode === 'weekly') {
      setActiveDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
    } else {
      goNextMonth();
    }
  };

  const goTodayDate = () => {
    setActiveDate(new Date(today));
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const handleQuickCompleteCalendarTask = (moduleId, taskId, isCompleted, e) => {
    e.stopPropagation();
    try {
      const boardData = loadModuleBoard(moduleId);
      if (!boardData || !boardData.columnOrder?.length) return;
      const lastCol = boardData.columnOrder[boardData.columnOrder.length - 1];
      const firstCol = boardData.columnOrder[0];
      const targetCol = isCompleted ? firstCol : lastCol;
      moveTask(moduleId, taskId, targetCol);
    } catch (err) {
      console.error('Lỗi tích nhanh hoàn thành:', err);
    }
  };

  // Days list for Weekly view dynamically matching activeDate
  const weekDaysList = useMemo(() => {
    const currDayIndex = (activeDate.getDay() + 6) % 7;
    const monday = new Date(activeDate);
    monday.setDate(activeDate.getDate() - currDayIndex);

    return ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'].map((dayName, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      return {
        dayName,
        dateNum: d.getDate(),
        active: toISO(d) === toISO(activeDate),
        isToday: toISO(d) === todayISO,
        iso: toISO(d),
        rawDate: d
      };
    });
  }, [activeDate, todayISO]);

  // 14-day horizontal scrollable quick day bar for Daily View (-3 days to +10 days)
  const quickDaysList = useMemo(() => {
    const list = [];
    const start = new Date(activeDate);
    start.setDate(activeDate.getDate() - 3);

    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toISO(d);
      list.push({
        dayName: ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()],
        dateNum: d.getDate(),
        active: iso === toISO(activeDate),
        isToday: iso === todayISO,
        iso,
        rawDate: d
      });
    }
    return list;
  }, [activeDate, todayISO]);

  // All tasks running during the active week (Monday to Sunday)
  const tasksRunningInWeek = useMemo(() => {
    if (!weekDaysList || weekDaysList.length < 7) return [];
    const weekStartIso = weekDaysList[0].iso;
    const weekEndIso = weekDaysList[6].iso;

    return allTasksList.filter(({ task }) => {
      const sIso = task.startDate || task.dueDate || todayISO;
      const dIso = task.dueDate || task.startDate || todayISO;
      return !(dIso < weekStartIso || sIso > weekEndIso);
    });
  }, [allTasksList, weekDaysList, todayISO]);

  const toggleFilter = (key) => {
    setActiveFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Actions for upcoming meeting card
  const handleConfirmMeeting = (e) => {
    e.stopPropagation();
    if (upcomingMeeting) {
      updateTask(upcomingMeeting.module.id, upcomingMeeting.task.id, { progress: 100 });
      setRefreshKey(k => k + 1);
    }
  };

  const handleCancelMeeting = (e) => {
    e.stopPropagation();
    if (upcomingMeeting) {
      updateTask(upcomingMeeting.module.id, upcomingMeeting.task.id, {
        blocked: { isBlocked: true, reason: 'Đã huỷ/từ chối cuộc họp' }
      });
      setRefreshKey(k => k + 1);
    }
  };

  return (
    <div className="board-container calendar-page-overhaul">
      {/* Top Header */}
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Lịch & Lịch Biểu</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
      </div>

      {/* Main Calendar App Layout (Left Sidebar + Right Schedule Grid) */}
      <div className="calendar-app-layout">
        <button
          type="button"
          className="calendar-mobile-filter-trigger"
          onClick={() => setIsMobileFilterOpen(true)}
        >
          <Filter size={14} /> Bộ lọc & Lịch mini
        </button>

        {/* Left Control & Filter Sidebar */}
        <div className={`calendar-left-sidebar ${isMobileFilterOpen ? 'mobile-filter-open' : ''}`}>
          <button
            type="button"
            className="calendar-mobile-filter-close"
            onClick={() => setIsMobileFilterOpen(false)}
          >
            <X size={16} /> Đóng
          </button>
          {/* Mini Month Calendar Widget */}
          <div className="mini-calendar-widget">
            <div className="mini-cal-header">
              <span>{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</span>
              <div className="mini-cal-nav">
                <button className="icon-subtle-btn" onClick={goPrevMonth} title="Tháng trước"><ChevronLeft size={13} /></button>
                <button className="icon-subtle-btn" onClick={goNextMonth} title="Tháng sau"><ChevronRight size={13} /></button>
              </div>
            </div>

            <div className="mini-cal-grid">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="mini-day-name">{d}</div>
              ))}
              {days.slice(0, 35).map((date, idx) => {
                const iso = toISO(date);
                const isToday = iso === todayISO;
                const isSelected = iso === toISO(activeDate);
                const inMonth = date.getMonth() === cursor.getMonth();
                const hasTasks = (tasksByDate.get(iso) || []).length > 0;

                return (
                  <div
                    key={idx}
                    className={`mini-day-cell ${inMonth ? '' : 'outside'} ${isToday ? 'active-today' : ''} ${isSelected ? 'selected-active' : ''} ${hasTasks ? 'has-events' : ''}`}
                    onClick={() => {
                      setActiveDate(date);
                      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
                      setSelectedDate(iso);
                    }}
                    title={`Ngày ${formatShortDate(iso)} (${(tasksByDate.get(iso) || []).length} công việc)`}
                  >
                    <span>{date.getDate()}</span>
                    {hasTasks && <span className="mini-event-dot" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meeting Reminder Featured Card (Real Data Integrated) */}
          <div
            className="featured-reminder-card"
            onClick={() => upcomingMeeting && setSelectedTaskDetail(upcomingMeeting)}
            style={{ cursor: upcomingMeeting ? 'pointer' : 'default' }}
          >
            <div className="reminder-tag"><Clock size={12} /> Sắp diễn ra</div>
            <div className="reminder-title">
              {upcomingMeeting ? upcomingMeeting.task.content : 'UX Huddle & AI Sync Call'}
            </div>
            <div className="reminder-time">
              {upcomingMeeting ? (
                `Hạn: ${formatShortDate(upcomingMeeting.task.dueDate || upcomingMeeting.task.startDate)} • ${upcomingMeeting.module.code}`
              ) : (
                '09:00 AM - 10:30 AM'
              )}
            </div>
            <div className="reminder-footer">
              <div className="avatar-stack">
                <span className="mini-avatar av-1"><User size={10} /></span>
                <span className="mini-avatar av-2"><Bot size={10} /></span>
                <span className="avatar-more">+2</span>
              </div>
              <div className="reminder-actions">
                <button
                  className="btn-circle btn-cancel"
                  onClick={handleCancelMeeting}
                  title="Huỷ/Từ chối cuộc họp"
                >
                  <X size={12} />
                </button>
                <button
                  className="btn-circle btn-confirm"
                  onClick={handleConfirmMeeting}
                  title="Xác nhận hoàn thành cuộc họp"
                >
                  <Check size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Filters Accordion (Real-time Filter Badges) */}
          <div className="calendar-filters-card">
            <div className="filter-card-header">
              <span><Filter size={14} /> Bộ Lọc Hiển Thị</span>
            </div>
            <div className="filter-checkbox-list">
              <label className="filter-check-item">
                <input
                  type="checkbox"
                  checked={activeFilters.meetings}
                  onChange={() => toggleFilter('meetings')}
                />
                <span>Cuộc họp & Huddle ({filterCounts.meetings})</span>
              </label>
              <label className="filter-check-item">
                <input
                  type="checkbox"
                  checked={activeFilters.taskDueDates}
                  onChange={() => toggleFilter('taskDueDates')}
                />
                <span>Hạn chót công việc ({filterCounts.taskDueDates})</span>
              </label>
              <label className="filter-check-item">
                <input
                  type="checkbox"
                  checked={activeFilters.milestones}
                  onChange={() => toggleFilter('milestones')}
                />
                <span>Cột mốc dự án ({filterCounts.milestones})</span>
              </label>
              <label className="filter-check-item">
                <input
                  type="checkbox"
                  checked={activeFilters.deadlines}
                  onChange={() => toggleFilter('deadlines')}
                />
                <span>Hạn Gate 14–30–60 Ngày ({filterCounts.deadlines})</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Schedule Grid Area */}
        <div className="calendar-main-area">
          {isMobile ? (
            /* Vertical Day Agenda View matching IMG_4674.PNG */
            <div className="mobile-agenda-container">
              <div className="mobile-agenda-header">
                <div className="mobile-agenda-title">
                  <h2>tháng {cursor.getMonth() + 1}</h2>
                </div>
                <div className="mobile-agenda-actions">
                  <button className="mobile-agenda-action-btn" onClick={goPrevMonth} title="Tháng trước">
                    <ChevronLeft size={18} />
                  </button>
                  <button className="mobile-agenda-action-btn" onClick={goNextMonth} title="Tháng sau">
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="mobile-agenda-action-btn primary"
                    onClick={() => handleCreateTaskForDate(toISO(today))}
                    title="Tạo đầu việc"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="mobile-agenda-list">
                {daysInMonthList.map(({ dayName, dayNum, iso, isToday }) => {
                  const items = tasksByDate.get(iso) || [];
                  return (
                    <div key={iso} className={`agenda-day-row ${isToday ? 'is-today' : ''}`}>
                      <div className="agenda-day-left">
                        <span className="agenda-day-name">{dayName}</span>
                        <span className="agenda-day-num">{dayNum}</span>
                      </div>
                      <div className="agenda-day-right">
                        {items.length > 0 ? (
                          <div className="agenda-task-pills">
                            {items.map(({ module, task }) => {
                              const isDone = task.progress >= 100;
                              return (
                                <div key={task.id} className={`agenda-task-pill ${isDone ? 'done' : ''}`}>
                                  <button
                                    type="button"
                                    className="agenda-task-check-btn"
                                    onClick={(e) => handleQuickCompleteCalendarTask(module.id, task.id, isDone, e)}
                                    title={isDone ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}
                                  >
                                    {isDone ? <CheckCircle2 size={16} className="check-icon-done" /> : <Circle size={16} className="check-icon-todo" />}
                                  </button>
                                  <span
                                    className="agenda-task-title"
                                    onClick={() => setSelectedTaskDetail({ module, task })}
                                  >
                                    {task.content}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="agenda-empty-slot-btn"
                            onClick={() => handleCreateTaskForDate(iso)}
                          >
                            <div className="empty-slot-title">Chưa lên kế hoạch nào</div>
                            <div className="empty-slot-subtitle">Nhấn để tạo</div>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Header Controls Bar (Desktop) */}
              <div className="calendar-main-header">
                <div className="header-date-title">
                  <button className="icon-btn" onClick={goPrevDate} title="Trước"><ChevronLeft size={16} /></button>
                  <h2>
                    {viewMode === 'daily' ? (
                      `Lịch Ngày: ${WEEKDAYS[(activeDate.getDay() + 6) % 7]}, ${formatShortDate(toISO(activeDate))}`
                    ) : viewMode === 'weekly' ? (
                      `Lịch Tuần: ${formatShortDate(weekDaysList[0].iso)} ➔ ${formatShortDate(weekDaysList[6].iso)}`
                    ) : (
                      `${MONTH_NAMES[cursor.getMonth()]}, ${cursor.getFullYear()}`
                    )}
                  </h2>
                  <button className="icon-btn" onClick={goNextDate} title="Sau"><ChevronRight size={16} /></button>
                </div>

                <div className="header-right-controls">
                  <div className="view-mode-toggles">
                    <button className={`view-btn ${viewMode === 'daily' ? 'active' : ''}`} onClick={() => setViewMode('daily')}>Hàng Ngày</button>
                    <button className={`view-btn ${viewMode === 'weekly' ? 'active' : ''}`} onClick={() => setViewMode('weekly')}>Hàng Tuần</button>
                    <button className={`view-btn ${viewMode === 'monthly' ? 'active' : ''}`} onClick={() => setViewMode('monthly')}>Hàng Tháng</button>
                  </div>

                  <button className="create-event-btn" onClick={goTodayDate}>
                    <Plus size={16} /> Hôm Nay
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Conditional View Rendering */}
          {viewMode === 'monthly' ? (
            /* Month Calendar Grid */
            <div className="calendar-scroll">
              <div className="calendar-weekdays">
                {WEEKDAYS.map(d => <div key={d} className="calendar-weekday">{shortDayName(d)}</div>)}
              </div>
              <div className="calendar-grid">
                {days.map(date => {
                  const iso = toISO(date);
                  const items = tasksByDate.get(iso) || [];
                  const inMonth = date.getMonth() === cursor.getMonth();
                  const isToday = iso === todayISO;
                  const visible = items.slice(0, 3);
                  const overflow = items.length - visible.length;

                  return (
                    <div
                      key={iso}
                      className={`calendar-cell ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`}
                      onClick={() => setSelectedDate(iso)}
                    >
                      <span className="calendar-cell-date">{date.getDate()}</span>
                      {items.length > 0 && (
                        <span className="calendar-cell-count-badge">{items.length}</span>
                      )}
                      <div className="calendar-cell-tasks">
                        {visible.map(({ module, task }) => (
                          <button
                            key={task.id}
                            className={`calendar-task-chip accent-${module.accent || 'indigo'}`}
                            data-tooltip={`${task.code || module.code}: ${task.content} (${module.title})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskDetail({ module, task });
                            }}
                          >
                            <span className="chip-code-badge">{task.code || module.code}</span>
                            <span className="chip-text-content">{task.content}</span>
                          </button>
                        ))}
                        {overflow > 0 && (
                          <span
                            className="calendar-task-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(iso);
                            }}
                          >
                            +{overflow} khác
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : viewMode === 'daily' ? (
            /* Dedicated Daily View (Single-Day Focus Layout) */
            <div className="daily-view-focused-layout">
              {/* Horizontal Scrollable Quick Day Selector Bar */}
              <div className="daily-quick-days-wrapper">
                <button
                  className="quick-nav-btn"
                  onClick={() => setActiveDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))}
                  title="Ngày trước"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="daily-quick-days-bar scrollable-horizontal-bar">
                  {quickDaysList.map(w => (
                    <button
                      key={w.iso}
                      className={`quick-day-tab ${w.active ? 'active' : ''} ${w.isToday ? 'is-today' : ''}`}
                      onClick={() => setActiveDate(w.rawDate)}
                    >
                      <span className="tab-day-name">{shortDayName(w.dayName)}</span>
                      <span className="tab-day-num">{w.dateNum}</span>
                      {(tasksByDate.get(w.iso) || []).length > 0 && (
                        <span className="tab-task-count">{(tasksByDate.get(w.iso) || []).length}</span>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  className="quick-nav-btn"
                  onClick={() => setActiveDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))}
                  title="Ngày sau"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Daily Schedule Header Card */}
              <div className="daily-schedule-hero">
                <div className="hero-date-info">
                  <h3>
                    <CalendarIcon size={18} /> {WEEKDAYS[(activeDate.getDay() + 6) % 7]}, {formatShortDate(toISO(activeDate))}
                    {toISO(activeDate) === todayISO && <span className="today-live-tag"><span className="status-dot" /> HÔM NAY</span>}
                  </h3>
                  <span className="hero-task-badge">
                    {(tasksByDate.get(toISO(activeDate)) || []).length} Công việc lên lịch cho ngày này
                  </span>
                </div>

                <div className="hero-group-badges">
                  {['Biztro', 'GenAI Edu', 'AIVA', 'Eitri'].map(grp => (
                    <span key={grp} className="hero-group-chip">{grp}</span>
                  ))}
                </div>
              </div>

              {/* Phase 15: lưới giờ kéo-thả thật - tách biệt hoàn toàn due_date
                  (xem TimeBlockGrid.jsx). Khay "Chưa xếp lịch" lọc lại từ
                  tasksByDate, CHỈ giữ task có due_date/start_date THẬT khớp
                  đúng ngày này - tasksByDate còn dồn cả task hoàn toàn không
                  có ngày nào vào "hôm nay" theo fallback riêng của nó (dùng
                  cho các view khác), không phù hợp cho khay này. */}
              <TimeBlockGrid
                dateISO={toISO(activeDate)}
                unscheduledItems={(tasksByDate.get(toISO(activeDate)) || []).filter(
                  ({ task }) => task.dueDate === toISO(activeDate) || task.startDate === toISO(activeDate)
                )}
                onOpenTask={(compactTask) => {
                  const found = allTasksList.find(({ task }) => task.id === compactTask.id);
                  if (found) setSelectedTaskDetail(found);
                }}
                refreshSignal={refreshKey}
              />
            </div>
          ) : (
            /* Weekly View: Master Task Feed Board (Cards View Layout) */
            <div className="weekly-master-feed-layout">
              {/* Weekly Header Banner & Quick Navigation */}
              <div className="weekly-schedule-hero">
                <div className="hero-date-info">
                  <h3>
                    <CalendarIcon size={18} /> Lịch Tuần Master ({formatShortDate(weekDaysList[0].iso)} ➔ {formatShortDate(weekDaysList[6].iso)})
                  </h3>
                  <span className="hero-task-badge">
                    {tasksRunningInWeek.length} Thẻ công việc đang chạy trong tuần này
                  </span>
                </div>

                <div className="weekly-quick-nav-tabs">
                  {weekDaysList.map(w => (
                    <button
                      key={w.iso}
                      className={`weekly-day-tab ${w.active ? 'active' : ''}`}
                      onClick={() => setActiveDate(w.rawDate)}
                    >
                      <span>{w.dayName === 'Chủ Nhật' ? 'CN' : w.dayName.replace('Thứ ', 'T')}</span>
                      <strong>{w.dateNum}</strong>
                    </button>
                  ))}
                </div>
              </div>

              {/* Weekly Cards Feed Container */}
              <div className="weekly-cards-feed-container scrollable-vertical-hours">
                {tasksRunningInWeek.length > 0 ? (
                  <div className="weekly-cards-grid">
                    {tasksRunningInWeek.map(({ module: slotModule, task: slotTask }) => {
                      const isCompleted = slotTask.progress >= 100;
                      const isInProgress = slotTask.progress > 0 && slotTask.progress < 100;
                      const statusKey = isCompleted ? 'completed' : isInProgress ? 'progress' : 'todo';
                      const statusLabel = isCompleted ? 'Hoàn thành' : isInProgress ? `Đang làm (${slotTask.progress}%)` : 'Cần làm';

                      return (
                        <div
                          key={slotTask.id}
                          className={`weekly-full-task-card accent-${slotModule.accent || 'indigo'}`}
                          onClick={() => setSelectedTaskDetail({ module: slotModule, task: slotTask })}
                        >
                          <div className="card-top-row">
                            <span className={`module-code-chip accent-${slotModule.accent || 'indigo'}`}>
                              {slotTask.code || slotModule.code}
                            </span>
                            <span className="card-module-meta">
                              {slotModule.groupTitle || 'NHÓM OPC'} · {slotModule.title}
                            </span>
                          </div>

                          <div className="card-task-title-row">
                            <button
                              type="button"
                              className={`task-quick-complete-btn ${isCompleted ? 'done' : ''}`}
                              onClick={(e) => handleQuickCompleteCalendarTask(slotModule.id, slotTask.id, isCompleted, e)}
                              title={isCompleted ? 'Đánh dấu chưa xong' : 'Tích xanh hoàn thành nhanh'}
                            >
                              {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                            </button>
                            <h4 className={`card-task-title ${isCompleted ? 'done' : ''}`}>{slotTask.content}</h4>
                          </div>
                          {slotTask.notes && <p className="card-task-notes-preview">{slotTask.notes}</p>}

                          <div className="weekly-card-progress-bar">
                            <div className="progress-fill" style={{ width: `${slotTask.progress || 0}%` }} />
                          </div>

                          <div className="card-bottom-row">
                            <div className="card-time-info">
                              <Clock size={12} />
                              <span>{formatShortDate(slotTask.startDate)} ➔ {formatShortDate(slotTask.dueDate)}</span>
                            </div>

                            <span className={`status-dot-label status-${statusKey}`}>
                              <span className="status-dot" /> {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-day-tasks-box">
                    <p>Không có công việc nào đang chạy trong tuần này.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Day Tasks Modal (When clicking any day cell in Month View) */}
      {selectedDate && (
        <div className="modal-overlay" {...dayTasksOverlayHandlers}>
          <div className="day-tasks-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="day-modal-title-wrap">
                <h2>
                  <CalendarIcon size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--accent-color)' }} />
                  Đầu Việc Ngày {selectedDate.split('-').reverse().join('/')}
                </h2>
                <span className="day-modal-count-chip">
                  {(tasksByDate.get(selectedDate) || []).length} Đầu việc
                </span>
              </div>
              <button className="close-btn" onClick={() => setSelectedDate(null)}><X size={20} /></button>
            </div>

            <div className="day-modal-body">
              {(tasksByDate.get(selectedDate) || []).map(({ module, task }) => {
                const isBlocked = task.blocked?.isBlocked;
                const isCompleted = task.progress >= 100;
                const isInProgress = task.progress > 0 && task.progress < 100;
                const isDeadline = task.dueDate === selectedDate;

                return (
                  <div key={task.id} className="day-task-row-card">
                    <div className="day-task-row-top">
                      <div className="day-task-badges">
                        <span className={`group-badge accent-${module.accent || 'indigo'}`}>
                          <Layers size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                          {module.groupTitle || 'NHÓM OPC'}
                        </span>
                        <span className={`module-code-chip accent-${module.accent || 'indigo'}`}>
                          <strong>{task.code || module.code}</strong> • {module.title}
                        </span>

                        {task.priority && (
                          <span className={`priority-tag priority-${task.priority}`}>
                            <Flag size={10} /> {PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium}
                          </span>
                        )}

                        {isBlocked ? (
                          <span className="status-chip chip-blocked">⛔ Đang chặn</span>
                        ) : isCompleted ? (
                          <span className="status-chip chip-completed">🟢 Đã hoàn thành (100%)</span>
                        ) : isInProgress ? (
                          <span className="status-chip chip-progress">🟡 Đang thực hiện ({task.progress}%)</span>
                        ) : isDeadline ? (
                          <span className="status-chip chip-deadline">🔴 Deadline Hạn Chót</span>
                        ) : (
                          <span className="status-chip chip-todo">🔵 Cần làm</span>
                        )}
                      </div>
                    </div>

                    <div className="day-task-row-main">
                      <h4 className="day-task-title">
                        {task.content}
                      </h4>
                      {task.notes && (
                        <p className="day-task-notes-preview">{task.notes}</p>
                      )}
                    </div>

                    <div className="day-task-timeline-row">
                      <div className="time-info-chip">
                        <Clock size={13} />
                        <span>Thời gian: </span>
                        <strong>{formatShortDate(task.startDate)} ➔ {formatShortDate(task.dueDate)}</strong>
                      </div>

                      <div className="mini-task-progress-wrap">
                        <div className="mini-progress-bar">
                          <div className={`mini-progress-fill ${isCompleted ? 'completed' : ''}`} style={{ width: `${task.progress || 0}%` }} />
                        </div>
                        <span className="mini-progress-text">{task.progress || 0}%</span>
                      </div>
                    </div>

                    <div className="day-task-row-footer">
                      <div className="task-footer-left">
                        <span className="info-label-sm">Người phụ trách: </span>
                        {task.assignee ? (
                          <span className={`assignee-chip type-${task.assignee.type || 'human'}`}>
                            {task.assignee.type === 'agent' ? <Bot size={12} /> : <User size={12} />}
                            <strong>{task.assignee.name}</strong>
                          </span>
                        ) : (
                          <span className="unassigned-text">Chưa phân công</span>
                        )}
                      </div>

                      <button
                        className="jump-module-action-btn"
                        onClick={() => {
                          onJumpToModule(module);
                          setSelectedDate(null);
                        }}
                      >
                        Chuyển tới Module <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {(tasksByDate.get(selectedDate) || []).length === 0 && (
                <div className="day-modal-empty">
                  Không có đầu việc nào được lên lịch cho ngày này.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Task Detail Overlay */}
      {selectedTaskDetail && (
        <div className="modal-overlay" {...taskDetailOverlayHandlers}>
          <div className="task-overlay-card" onClick={e => e.stopPropagation()}>
            <div className="overlay-header">
              <span className={`task-code-chip accent-${selectedTaskDetail.module?.accent || 'indigo'}`}>
                {selectedTaskDetail.task?.code || selectedTaskDetail.module?.code}
              </span>
              <div className="overlay-actions">
                <button className="icon-subtle-btn" onClick={() => setSelectedTaskDetail(null)}><X size={16} /></button>
              </div>
            </div>

            <div className="overlay-body">
              <h3 className="overlay-task-title">{selectedTaskDetail.task?.content}</h3>
              <span className="overlay-badge">MÔ HÌNH: {selectedTaskDetail.module?.title}</span>

              <div className="overlay-info-row">
                <div className="info-label">Người phụ trách</div>
                <div className="info-val">
                  {selectedTaskDetail.task?.assignee ? (
                    <span className="assignee-chip">
                      {selectedTaskDetail.task.assignee.type === 'agent' ? <Bot size={12} /> : <User size={12} />}
                      {selectedTaskDetail.task.assignee.name}
                    </span>
                  ) : 'Chưa phân công'}
                </div>
              </div>

              <div className="overlay-info-row">
                <div className="info-label">Thời gian & Hạn chót</div>
                <div className="info-val">
                  <Clock size={14} /> {formatShortDate(selectedTaskDetail.task?.dueDate)}
                </div>
              </div>

              {selectedTaskDetail.task?.notes && (
                <div className="overlay-notes">
                  <strong>Ghi chú:</strong>
                  <p>{selectedTaskDetail.task.notes}</p>
                </div>
              )}
            </div>

            <div className="overlay-footer">
              <button
                className="primary-btn"
                onClick={() => {
                  onJumpToModule(selectedTaskDetail.module);
                  setSelectedTaskDetail(null);
                }}
              >
                <ArrowUpRight size={15} /> Đi tới Module này
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
