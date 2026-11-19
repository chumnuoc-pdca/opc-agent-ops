import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Plus, GripVertical, Info, X, Edit2, Save,
  MoreHorizontal, Trash2, Calendar, Flag, User, Bot, CheckSquare, Ban, Link2, Sparkles,
  Check, ChevronDown, ChevronUp, ChevronRight, Pin, Target, Paperclip, Tag, Archive, ArrowRightLeft,
  Circle, CheckCircle2, Clock, Columns3, Lock, Filter, Settings, Bell, Minimize2, Maximize2, AtSign, Hash, SlidersHorizontal
} from 'lucide-react';
import { useIsMobile } from '../utils/useIsMobile';
import { PRIORITY_LABELS, flattenGroups } from '../data/initialData';
import {
  isOverdue, formatShortDate, computeTimelineProgress, getDeadlineUrgency,
  parseDetailSections, serializeDetailSections, parseHeaderInfo, applyHeaderInfo,
  loadModuleBoard, updateModuleDetails, refreshModuleBoard, loadAllBoards
} from '../utils/boardStorage';
import { getTags, getTagByNameOrId } from '../utils/tagStorage';
import { onDataChanged } from '../utils/dataBus';
import { formatMinutes } from '../utils/timeTrackingOperations';
import { fetchTimeStats } from '../utils/timeStatsOperations';
import {
  createTask, updateTask, deleteTask, moveTask, clearColumn as clearColumnTasks, toggleChecklistItem,
  archiveTask, unarchiveTask
} from '../utils/taskOperations';
import HeaderActions from './HeaderActions';
import ActionSheet from './ActionSheet';
import TaskModal from './TaskModal';
import ColumnModal from './ColumnModal';
import AiTaskBreakdownModal from './AiTaskBreakdownModal';
import ArchivedTasksModal from './ArchivedTasksModal';
import TimelineView from './TimelineView';
import CalendarPage from './CalendarPage';
import RightSidebarPanel from './RightSidebarPanel';
import AgentRunBadge from './AgentRunBadge';
import { ModuleTypeBadge } from './ModuleTypeBadge';
import { useOverlayClose } from '../utils/useOverlayClose';
import { MODULE_VIEW_TABS, GENERIC_VIEW_COMPONENTS } from '../config/moduleViewTabs';

export default function Board({ module, groups, theme, onToggleTheme, onJumpToModule }) {
  if (!module) {
    return (
      <div className="board-container">
        <p className="empty-text" style={{ padding: 40, textAlign: 'center' }}>Đang tải thông tin mô hình...</p>
      </div>
    );
  }

  const flatModules = useMemo(() => flattenGroups(groups || []), [groups]);
  const isMobile = useIsMobile();

  // The active tab lives in the URL (?tab=...) instead of local state, so a
  // specific module view (Timeline, KPIs & OKRs, ...) is itself a shareable/
  // bookmarkable/back-forward-able location, not just the module page.
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabIds = useMemo(() => MODULE_VIEW_TABS.map(t => t.id), []);
  const requestedTab = searchParams.get('tab');
  const viewMode = validTabIds.includes(requestedTab) ? requestedTab : 'board';
  const setViewMode = (tab) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'board') next.delete('tab'); else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const infoModalOverlayHandlers = useOverlayClose(() => setIsModalOpen(false));
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editSections, setEditSections] = useState([]);
  const [taskModal, setTaskModal] = useState(null); // { mode: 'create', columnId } | { mode: 'edit', task }
  const [columnModal, setColumnModal] = useState(null); // { mode: 'create' } | { mode: 'edit', column }
  const [showAiBreakdownModal, setShowAiBreakdownModal] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [openColumnMenu, setOpenColumnMenu] = useState(null);
  const [openMoveMenuTaskId, setOpenMoveMenuTaskId] = useState(null);
  const [activeMobileColumn, setActiveMobileColumn] = useState(null);
  const [isMobileViewMenuOpen, setIsMobileViewMenuOpen] = useState(false);
  const [isMobileZoomedOut, setIsMobileZoomedOut] = useState(false);
  const [showMobileFilterSheet, setShowMobileFilterSheet] = useState(false);
  const [showMobileOverduePopover, setShowMobileOverduePopover] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [mobileFilterAssignee, setMobileFilterAssignee] = useState('');
  const [mobileFilterPriority, setMobileFilterPriority] = useState('');
  const [mobileFilterDue, setMobileFilterDue] = useState('');

  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  const [allTags, setAllTags] = useState(() => getTags());

  const [boardData, setBoardData] = useState(() => loadModuleBoard(module));

  const [moduleTimeStats, setModuleTimeStats] = useState(null);
  // Kết nối Time tracking (Phase 12) vào trang Board module đã có sẵn từ
  // trước - tổng thời gian thật đã theo dõi 30 ngày gần nhất, lọc đúng
  // module đang xem (API lọc theo group, tự lọc tiếp về đúng module ở client).
  useEffect(() => {
    const localDateISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const to = new Date();
    const from = new Date(Date.now() - 29 * 86400000);
    fetchTimeStats({ from: localDateISO(from), to: localDateISO(to) })
      .then((s) => setModuleTimeStats(s.byModule.find((m) => m.moduleId === module.id) || null))
      .catch(() => setModuleTimeStats(null));
  }, [module.id]);

  const archivedTasks = useMemo(() => {
    return Object.values(boardData.tasks || {}).filter(t => t.archived);
  }, [boardData.tasks]);

  // Bộ lọc "@" trên mobile (tham khảo Trello) - danh sách người/agent thật sự
  // đang được gán trong board này, không phải toàn bộ nhân sự hệ thống.
  const mobileAssigneeOptions = useMemo(() => {
    const seen = new Map();
    Object.values(boardData.tasks || {}).forEach(t => {
      if (t.assignee?.name) seen.set(t.assignee.name, t.assignee.type || 'human');
    });
    return Array.from(seen.entries()).map(([name, type]) => ({ name, type }));
  }, [boardData.tasks]);

  const mobileActiveFilterCount = [
    selectedTagFilter, mobileSearchQuery, mobileFilterAssignee, mobileFilterPriority, mobileFilterDue
  ].filter(Boolean).length;

  const clearMobileFilters = () => {
    setSelectedTagFilter('');
    setMobileSearchQuery('');
    setMobileFilterAssignee('');
    setMobileFilterPriority('');
    setMobileFilterDue('');
  };

  // Chuông thông báo trên mobile (tham khảo Trello) - tái dùng đúng logic
  // "quá hạn xuyên suốt mọi module" đã có ở HeaderActions.jsx, chỉ khác nơi
  // kích hoạt (toolbar đáy thay vì header trên) nên không tách thành
  // component dùng chung (HeaderActions gộp chung cả 3 nút, không tách lẻ
  // được nút chuông).
  const mobileOverdueItems = useMemo(() => loadAllBoards(flatModules).flatMap(({ module: m, board }) =>
    Object.values(board.tasks || {})
      .filter(task => isOverdue(task.dueDate))
      .map(task => ({ module: m, task }))
  ), [flatModules]);
  // Task cards default to the collapsed form on load/reload - expand is a
  // per-card, in-session choice made via the chevron toggle.
  const [collapsedTaskIds, setCollapsedTaskIds] = useState(() => new Set(Object.keys(boardData.tasks || {})));

  useEffect(() => {
    const nextBoard = loadModuleBoard(module);
    setBoardData(nextBoard);
    setCollapsedTaskIds(new Set(Object.keys(nextBoard.tasks || {})));
    setIsEditingHeaderCard(false);
    setIsEditingDesc(false);
    setIsModalOpen(false);
  }, [module]);

  // Live-refresh whenever this module's data changes from anywhere else in
  // the app (the AI assistant, another mounted view) - not just from this
  // component's own edits.
  useEffect(() => onDataChanged((changedModuleId) => {
    if (changedModuleId === module.id) setBoardData(loadModuleBoard(module));
  }), [module]);

  // Phase 2: agent runs happen server-side in the background worker, so an
  // open Board tab needs to poll to see queued → running → done/awaiting_approval
  // transitions (no SSE/WebSocket channel yet - planned Phase 3, see plan §5).
  useEffect(() => {
    const interval = setInterval(() => {
      refreshModuleBoard(module).then(setBoardData).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [module]);

  // Close the column "..." dropdown when clicking anywhere outside of it
  useEffect(() => {
    if (!openColumnMenu) return;
    const handler = (e) => {
      if (!e.target.closest('.column-menu-wrap')) setOpenColumnMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openColumnMenu]);

  // Cùng cơ chế đóng-khi-bấm-ra-ngoài như menu cột ở trên, áp dụng cho menu
  // "Chuyển đến cột..." trên thẻ.
  useEffect(() => {
    if (!openMoveMenuTaskId) return undefined;
    const handler = (e) => {
      if (!e.target.closest('.task-card-move-wrap')) setOpenMoveMenuTaskId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMoveMenuTaskId]);

  // Ticks once a minute purely to force a re-render, so timeline bars/overdue
  // styling stay accurate against the real clock even with no user action.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const onDragEnd = (result) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'column') {
      const newColumnOrder = Array.from(boardData.columnOrder);
      const [movedColId] = newColumnOrder.splice(source.index, 1);
      newColumnOrder.splice(destination.index, 0, movedColId);

      // Enforce that 'done' column (or column with title containing "Hoàn thành") stays pinned at the end
      const doneColIndex = newColumnOrder.findIndex(cId => {
        if (cId === 'done') return true;
        const colTitle = (boardData.columns[cId]?.title || '').toLowerCase();
        return colTitle.includes('hoàn thành') || colTitle.includes('đã xong');
      });

      if (doneColIndex !== -1 && doneColIndex !== newColumnOrder.length - 1) {
        const [doneCol] = newColumnOrder.splice(doneColIndex, 1);
        newColumnOrder.push(doneCol);
      }

      setBoardData(prev => ({ ...prev, columnOrder: newColumnOrder }));
      return;
    }

    const { board } = moveTask(module.id, draggableId, destination.droppableId, destination.index);
    setBoardData(board);
  };

  // "Chuyển đến cột..." - dùng đúng hàm moveTask kéo-thả đang gọi, chỉ khác
  // cách kích hoạt (bấm chọn thay vì kéo-thả) - đáng tin cậy hơn trên cảm
  // ứng, không xung đột với việc chạm-để-mở chi tiết thẻ.
  const handleMoveTaskToColumn = (taskId, targetColumnId) => {
    const { board } = moveTask(module.id, taskId, targetColumnId);
    setBoardData(board);
    setOpenMoveMenuTaskId(null);
  };

  // Check nhanh hoàn thành ngay trên mặt thẻ (tham khảo Trello) - "đã xong"
  // = task đang ở CỘT CUỐI, không thêm field completed riêng để tránh 2
  // nguồn sự thật lệch nhau với vị trí cột thật. Bấm lại khi đã xong = mở
  // lại việc (chuyển về cột đầu). `currentColumnId` do nơi gọi truyền vào
  // (đã có sẵn trong closure lúc render từng cột) thay vì tự tra lại.
  const handleQuickComplete = (taskId, currentColumnId, e) => {
    e.stopPropagation();
    const columns = boardData.columnOrder;
    const lastColumnId = columns[columns.length - 1];
    const firstColumnId = columns[0];
    const target = currentColumnId === lastColumnId ? firstColumnId : lastColumnId;
    const { board } = moveTask(module.id, taskId, target);
    setBoardData(board);
  };

  // ---- Kanban mobile: tab chuyển cột (vuốt từng cột 1) ----
  const columnRefs = useRef({});
  const scrollToColumn = (id) => {
    columnRefs.current[id]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActiveMobileColumn(id);
  };
  useEffect(() => {
    if (isMobile && !activeMobileColumn && boardData.columnOrder.length > 0) {
      setActiveMobileColumn(boardData.columnOrder[0]);
    }
  }, [isMobile, boardData.columnOrder, activeMobileColumn]);
  useEffect(() => {
    if (!isMobile || viewMode !== 'board') return undefined;
    // root PHẢI là phần tử có overflow-x:auto thật sự (.board-content) -
    // .columns-container chỉ là flex child bên trong, không tự scroll nên
    // không có "viewport" riêng để IntersectionObserver tính giao nhau,
    // khiến activeMobileColumn không cập nhật đúng lúc vuốt.
    const container = document.querySelector('.board-content');
    if (!container) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible) setActiveMobileColumn(mostVisible.target.dataset.columnId);
      },
      { root: container, threshold: [0.5] }
    );
    Object.values(columnRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile, viewMode, boardData.columnOrder]);

  // Lưới an toàn cho luật "1 lần vuốt = tối đa 1 bảng, bất kể vuốt dài/
  // ngắn/mạnh/nhẹ": CSS scroll-snap-stop:always đã khai trên .board-column
  // lo phần chính, nhưng hỗ trợ của nó trên Safari di động (nơi PWA này
  // thực chạy) từng có lúc không chặn được cú vuốt/vẩy quá mạnh làm trôi
  // qua 2-3 bảng cùng lúc. Không can thiệp touchstart/touchmove (tránh đụng
  // độ với cảm biến kéo-thả thẻ của @hello-pangea/dnd - chỉ lắng nghe thụ
  // động) - lúc cuộn dừng hẳn (debounce theo sự kiện `scroll`), nếu vị trí
  // cuối lệch quá 1 bảng so với bảng lúc BẮT ĐẦU cử chỉ chạm, kéo lại đúng
  // 1 bảng theo đúng hướng đã vuốt.
  useEffect(() => {
    if (!isMobile || viewMode !== 'board' || isMobileZoomedOut) return undefined;
    const el = document.querySelector('.board-content');
    if (!el) return undefined;

    let gestureStartLeft = null;
    let settleTimer = null;

    const getColumnPitch = () => {
      const col = el.querySelector('.board-column');
      const wrap = el.querySelector('.columns-container');
      if (!col || !wrap) return 0;
      const gap = parseFloat(getComputedStyle(wrap).columnGap || getComputedStyle(wrap).gap || '16') || 16;
      return col.getBoundingClientRect().width + gap;
    };

    const settle = () => {
      const pitch = getColumnPitch();
      if (!pitch || gestureStartLeft === null) return;
      const startIndex = Math.round(gestureStartLeft / pitch);
      const currentIndex = Math.round(el.scrollLeft / pitch);
      const maxIndex = el.querySelectorAll('.board-column').length - 1;
      let clampedIndex = currentIndex;
      if (currentIndex > startIndex + 1) clampedIndex = startIndex + 1;
      else if (currentIndex < startIndex - 1) clampedIndex = startIndex - 1;
      clampedIndex = Math.max(0, Math.min(clampedIndex, maxIndex));
      if (clampedIndex !== currentIndex) {
        el.scrollTo({ left: clampedIndex * pitch, behavior: 'smooth' });
      }
      gestureStartLeft = null;
    };

    const onTouchStart = () => {
      clearTimeout(settleTimer);
      gestureStartLeft = el.scrollLeft;
    };
    const onScroll = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 120);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('scroll', onScroll);
      clearTimeout(settleTimer);
    };
  }, [isMobile, viewMode, isMobileZoomedOut]);

  // ---- Task modal ----
  const openCreateModal = (columnId) => setTaskModal({ mode: 'create', columnId });
  const openEditModal = (task) => setTaskModal({ mode: 'edit', task });
  const closeTaskModal = () => {
    setTaskModal(null);
    setAllTags(getTags());
  };

  const handleSaveTask = (data) => {
    if (!taskModal) return;
    if (taskModal.mode === 'create') {
      const { board } = createTask(module.id, taskModal.columnId, data);
      setBoardData(board);
    } else {
      const { board } = updateTask(module.id, taskModal.task.id, data);
      setBoardData(board);
    }
    closeTaskModal();
  };

  const handleDeleteTask = () => {
    if (!taskModal || taskModal.mode !== 'edit') return;
    if (!window.confirm('Xoá công việc này?')) return;
    const { board } = deleteTask(module.id, taskModal.task.id);
    setBoardData(board);
    closeTaskModal();
  };

  const handleArchiveTask = (taskId, e) => {
    if (e) e.stopPropagation();
    const { board } = archiveTask(module.id, taskId);
    setBoardData(board);
    if (taskModal && taskModal.task?.id === taskId) {
      closeTaskModal();
    }
  };

  const handleRestoreTask = (taskId) => {
    const { board } = unarchiveTask(module.id, taskId);
    setBoardData(board);
  };

  const handleDeleteArchivedTask = (taskId) => {
    const { board } = deleteTask(module.id, taskId);
    setBoardData(board);
  };

  const handleBatchAddTasks = (tasksToAdd) => {
    let currentBoard = boardData;
    const targetCol = boardData.columnOrder[0] || 'todo';
    tasksToAdd.forEach(taskData => {
      const { board } = createTask(module.id, targetCol, taskData);
      currentBoard = board;
    });
    setBoardData(currentBoard);
  };

  // ---- Column modal ----
  const openCreateColumn = () => setColumnModal({ mode: 'create' });
  const openEditColumn = (column) => {
    setColumnModal({ mode: 'edit', column });
    setOpenColumnMenu(null);
  };
  const closeColumnModal = () => setColumnModal(null);

  const handleSaveColumn = (data) => {
    if (columnModal.mode === 'create') {
      const newId = `col-${Date.now()}`;
      setBoardData(prev => ({
        ...prev,
        columns: {
          ...prev.columns,
          [newId]: { id: newId, title: data.title, description: data.description, taskIds: [] }
        },
        columnOrder: [...prev.columnOrder, newId]
      }));
    } else {
      const colId = columnModal.column.id;
      setBoardData(prev => ({
        ...prev,
        columns: { ...prev.columns, [colId]: { ...prev.columns[colId], title: data.title, description: data.description } }
      }));
    }
    closeColumnModal();
  };

  const handleDeleteColumn = () => {
    if (!columnModal || columnModal.mode !== 'edit') return;
    const colId = columnModal.column.id;
    if (boardData.columnOrder.length <= 1) return;
    if (!window.confirm(`Xoá bảng "${columnModal.column.title}" và toàn bộ thẻ trong đó?`)) return;
    setBoardData(prev => {
      const taskIds = prev.columns[colId].taskIds;
      const nextTasks = { ...prev.tasks };
      taskIds.forEach(id => delete nextTasks[id]);
      const nextColumns = { ...prev.columns };
      delete nextColumns[colId];
      return {
        ...prev,
        tasks: nextTasks,
        columns: nextColumns,
        columnOrder: prev.columnOrder.filter(id => id !== colId)
      };
    });
    closeColumnModal();
  };

  const handleToggleChecklistItem = (taskId, itemId) => {
    const { board } = toggleChecklistItem(module.id, taskId, itemId);
    setBoardData(board);
  };

  const handleClearColumn = (columnId) => {
    const column = boardData.columns[columnId];
    if (!column.taskIds.length) {
      setOpenColumnMenu(null);
      return;
    }
    if (!window.confirm(`Xoá toàn bộ ${column.taskIds.length} thẻ trong bảng "${column.title}"?`)) return;
    const { board } = clearColumnTasks(module.id, columnId);
    setBoardData(board);
    setOpenColumnMenu(null);
  };

  // ---- Module info modal ("Thông tin mô hình") ----
  const currentDesc = boardData.description || module.description;
  const currentDetails = boardData.details || module.details || currentDesc;

  const parsedHeaderInfo = useMemo(() => {
    const { nature, targetAudience } = parseHeaderInfo(currentDetails);
    return { nature: nature || currentDesc || module.description || '', targetAudience };
  }, [currentDetails, currentDesc, module]);

  // ---- Header card ("Bản chất & Mô tả" / "Đối tượng phù hợp") inline edit ----
  // These two fields are deliberately excluded from the "Thông tin mô hình" modal
  // below (they're shown here instead, once, so the same fact isn't duplicated
  // in two places) - which means this card needs its own save path back into
  // the underlying `details` sections rather than reusing the modal's editor.
  const [isEditingHeaderCard, setIsEditingHeaderCard] = useState(false);
  const [headerDraft, setHeaderDraft] = useState({ nature: '', targetAudience: '' });

  const startEditingHeaderCard = () => {
    setHeaderDraft({ nature: parsedHeaderInfo.nature, targetAudience: parsedHeaderInfo.targetAudience });
    setIsEditingHeaderCard(true);
  };

  const saveHeaderCard = () => {
    const nextDetails = applyHeaderInfo(currentDetails, headerDraft);
    setBoardData(prev => ({ ...prev, details: nextDetails }));
    updateModuleDetails(module.id, { description: boardData.description, details: nextDetails });
    setIsEditingHeaderCard(false);
  };

  const openInfoModal = () => {
    setIsModalOpen(true);
    setEditSections(parseDetailSections(currentDetails));
    setIsEditingDesc(false);
  };

  const startEditingDesc = () => {
    setEditSections(parseDetailSections(currentDetails));
    setIsEditingDesc(true);
  };

  const updateSectionText = (index, text) => {
    setEditSections(prev => prev.map((s, i) => i === index ? { ...s, text } : s));
  };

  const handleSaveDesc = () => {
    const nextDetails = serializeDetailSections(editSections);
    setBoardData(prev => ({ ...prev, details: nextDetails }));
    updateModuleDetails(module.id, { description: boardData.description, details: nextDetails });
    setIsEditingDesc(false);
  };

  const renderAssigneeChip = (assignee) => {
    if (!assignee) {
      return (
        <span className="assignee-chip unassigned">
          <span className="assignee-icon"><User size={10} /></span>
          <span>Chưa gán</span>
        </span>
      );
    }
    const initial = assignee.name?.trim()?.charAt(0)?.toUpperCase() || '?';
    return (
      <span className={`assignee-chip type-${assignee.type}`}>
        <span className="assignee-icon">
          {assignee.type === 'agent' ? <Bot size={10} /> : initial}
        </span>
        <span>{assignee.name}</span>
      </span>
    );
  };

  const toggleCardCollapse = (taskId, e) => {
    e.stopPropagation();
    setCollapsedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const findTaskCode = (taskId) => {
    for (const t of Object.values(boardData.tasks)) {
      if (t.id === taskId) return t.code || taskId;
    }
    // Cross-module dependency (e.g. handoff_to_agent) - the source task
    // lives in another module's board, not this one's boardData.tasks.
    for (const otherModule of flatModules) {
      if (otherModule.id === module.id) continue;
      const otherBoard = loadModuleBoard(otherModule);
      const t = otherBoard.tasks?.[taskId];
      if (t) return `${t.code || taskId} (${otherModule.code || otherModule.title})`;
    }
    return taskId;
  };

  return (
    <div className={`board-container module-board-page type-${module.type || 'product'}`}>
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span
              className={`breadcrumb-project-avatar ${module.groupCustomAccentColor ? '' : `accent-${module.accent || 'indigo'}`}`}
              style={module.groupCustomAccentColor ? { background: module.groupCustomAccentColor } : undefined}
            >
              {module.groupLogoUrl ? <img src={module.groupLogoUrl} alt="" /> : (module.groupCode || module.groupTitle?.charAt(0) || '?')}
            </span>
            <span>{module.groupTitle || 'Dashboard'}</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{module.code || module.id}</span>
          </div>

          <div className="header-actions-row">
            <div className="group-switch">
              {groups.filter(g => g.modules.length > 0).map(group => (
                <button
                  key={group.id}
                  className={`group-chip ${group.customAccentColor ? '' : `accent-${group.accent}`} ${group.id === module.groupId ? 'active' : ''}`}
                  style={group.customAccentColor ? { background: group.customAccentColor } : undefined}
                  title={group.title}
                  onClick={() => onJumpToModule(group.modules[0])}
                >
                  {group.logoUrl ? <img src={group.logoUrl} alt="" /> : (group.code || group.title.charAt(0))}
                </button>
              ))}
            </div>

            <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />

            <button
              className="ai-breakdown-trigger-btn"
              onClick={() => setShowAiBreakdownModal(true)}
              title="Nhập mục tiêu lớn để AI tự động gợi ý và phân chẻ thành các thẻ công việc To-Do"
            >
              <Sparkles size={16} /> <span className="btn-label">AI Phân hoạch</span>
            </button>

            <button
              className="create-task-btn"
              onClick={() => openCreateModal(boardData.columnOrder[0])}
            >
              <Plus size={16} /> <span className="btn-label">Thêm công việc</span>
            </button>
          </div>
        </div>

        <div className="header-bottom-row">
          <div className="board-title-section">
            <div className="board-title-row">
              <h1>{module.title}</h1>
              <ModuleTypeBadge type={module.type} />
              {moduleTimeStats && moduleTimeStats.totalMinutes > 0 && (
                <span className="board-title-time-chip" title="Tổng thời gian đã theo dõi (Start/Stop) 30 ngày gần nhất">
                  <Clock size={12} /> {formatMinutes(moduleTimeStats.totalMinutes)} (30 ngày)
                </span>
              )}
              <button className="info-btn" onClick={openInfoModal}>
                <Info size={18} />
              </button>
            </div>
            {isMobile && (
              <p className="board-title-mobile-subtitle">{module.groupTitle || 'Dashboard'}</p>
            )}
            <div className="board-subtitle-card">
              <div className="board-subtitle-card-header">
                {!isEditingHeaderCard ? (
                  <button className="board-subtitle-edit-btn" onClick={startEditingHeaderCard}>
                    <Edit2 size={12} /> Chỉnh sửa
                  </button>
                ) : (
                  <div className="board-subtitle-edit-actions">
                    <button className="board-subtitle-cancel-btn" onClick={() => setIsEditingHeaderCard(false)}>Huỷ</button>
                    <button className="board-subtitle-save-btn" onClick={saveHeaderCard}>
                      <Save size={12} /> Lưu
                    </button>
                  </div>
                )}
              </div>

              {isEditingHeaderCard ? (
                <>
                  <label className="board-subtitle-field-label"><Pin size={13} /> Bản chất & Mô tả</label>
                  <textarea
                    className="board-subtitle-textarea"
                    rows={2}
                    value={headerDraft.nature}
                    onChange={e => setHeaderDraft(d => ({ ...d, nature: e.target.value }))}
                  />
                  <label className="board-subtitle-field-label"><Target size={13} /> Đối tượng phù hợp</label>
                  <textarea
                    className="board-subtitle-textarea"
                    rows={2}
                    value={headerDraft.targetAudience}
                    onChange={e => setHeaderDraft(d => ({ ...d, targetAudience: e.target.value }))}
                  />
                </>
              ) : (
                <>
                  <p className="board-subtitle-nature">
                    <strong><Pin size={14} /> Bản chất & Mô tả: </strong> {parsedHeaderInfo.nature}
                  </p>
                  {parsedHeaderInfo.targetAudience && (
                    <p className="board-subtitle-audience">
                      <strong><Target size={14} /> Đối tượng phù hợp: </strong> {parsedHeaderInfo.targetAudience}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="view-toggles-row">
            <div className="view-toggles">
              {MODULE_VIEW_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`view-btn ${viewMode === tab.id ? 'active' : ''}`}
                  onClick={() => setViewMode(tab.id)}
                >
                  <tab.icon size={16} /> {tab.label}
                </button>
              ))}
            </div>

            <div className="tag-filter-wrap">
              <Tag size={13} className="tag-filter-icon" />
              <select
                className="tag-filter-select"
                value={selectedTagFilter}
                onChange={e => setSelectedTagFilter(e.target.value)}
              >
                <option value="">Tất cả tag ({allTags.length})</option>
                {allTags.map(tag => (
                  <option key={tag.id} value={tag.name}>{tag.name}</option>
                ))}
              </select>
              {selectedTagFilter && (
                <button
                  className="tag-filter-clear-btn"
                  onClick={() => setSelectedTagFilter('')}
                  title="Xoá lọc tag"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              className={`archived-tasks-toggle-btn ${archivedTasks.length > 0 ? 'has-items' : ''}`}
              onClick={() => setShowArchivedModal(true)}
              title="Xem danh sách các thẻ đầu việc đã lưu trữ"
            >
              <Archive size={14} />
              <span>Lưu trữ ({archivedTasks.length})</span>
            </button>

            <button
              type="button"
              className={`sidebar-toggle-btn ${isRightSidebarOpen ? 'active' : ''}`}
              onClick={() => setIsRightSidebarOpen(prev => !prev)}
              title={isRightSidebarOpen ? 'Thu gọn bảng tiến độ' : 'Mở bảng tiến độ'}
            >
              <SlidersHorizontal size={14} />
              <span>Bảng tiến độ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chấm trang (tham khảo Trello) - đơn giản hơn dải tab tên cột trước
          đây: tên cột đã tự hiện trong tiêu đề của chính cột đang xem, không
          cần lặp lại ở đây. Ẩn hẳn khi đang ở chế độ zoom xem nhiều bảng
          cùng lúc (không còn khái niệm "1 bảng/1 trang" để đánh dấu). */}
      {isMobile && viewMode === 'board' && !isMobileZoomedOut && (
        <div className="kanban-mobile-nav-wrap">
          <div className="mobile-page-dots">
            {boardData.columnOrder.map(id => (
              <span
                key={id}
                className={`mobile-dot ${activeMobileColumn === id ? 'active' : ''}`}
                onClick={() => scrollToColumn(id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="board-main-layout">
        <div className={`board-content ${viewMode !== 'board' ? 'board-content-scroll' : ''}`}>
          {GENERIC_VIEW_COMPONENTS[viewMode] ? (
            React.createElement(GENERIC_VIEW_COMPONENTS[viewMode], { module })
          ) : viewMode === 'timeline' ? (
            <TimelineView tasks={boardData.tasks} module={module} onSelectTask={(task) => openEditModal(task)} />
          ) : viewMode === 'calendar' ? (
            <CalendarPage theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
          ) : viewMode === 'list' ? (
          <div className="list-view project-plan-view">
            {(() => {
              const allTasks = Object.values(boardData.tasks);
              if (allTasks.length === 0) return <p className="empty-text">Chưa có công việc nào.</p>;

              // Khung "đầu việc của agent/nhân sự" (theo yêu cầu Project Plan): nhóm
              // theo từng người/agent phụ trách thay vì 1 danh sách phẳng, để thấy
              // rõ ai đang cầm bao nhiêu việc.
              const groupsMap = new Map();
              allTasks.forEach(task => {
                const key = task.assignee ? `${task.assignee.type}:${task.assignee.name}` : 'unassigned';
                if (!groupsMap.has(key)) {
                  groupsMap.set(key, {
                    type: task.assignee?.type || 'unassigned',
                    name: task.assignee?.name || 'Chưa gán',
                    tasks: []
                  });
                }
                groupsMap.get(key).tasks.push(task);
              });
              const orderedGroups = Array.from(groupsMap.values()).sort((a, b) => {
                const rank = (t) => (t === 'agent' ? 0 : t === 'human' ? 1 : 2);
                if (rank(a.type) !== rank(b.type)) return rank(a.type) - rank(b.type);
                return b.tasks.length - a.tasks.length;
              });

              return orderedGroups.map(group => (
                <div key={`${group.type}:${group.name}`} className="project-plan-group">
                  <div className="project-plan-group-header">
                    {group.type === 'agent' ? <Bot size={14} /> : group.type === 'human' ? <User size={14} /> : <User size={14} />}
                    <span className="project-plan-group-name">{group.name}</span>
                    <span className="project-plan-group-count">{group.tasks.length} việc</span>
                  </div>
                  {group.tasks.map(task => {
                    const lastColId = boardData.columnOrder[boardData.columnOrder.length - 1];
                    const isTaskDone = boardData.columns[lastColId]?.taskIds?.includes(task.id);
                    const taskColId = Object.keys(boardData.columns).find(cid => boardData.columns[cid]?.taskIds?.includes(task.id)) || boardData.columnOrder[0];
                    return (
                      <div key={task.id} className="list-item" onClick={() => openEditModal(task)}>
                        <button
                          type="button"
                          className={`task-quick-complete-btn ${isTaskDone ? 'done' : ''}`}
                          onClick={(e) => handleQuickComplete(task.id, taskColId, e)}
                          title={isTaskDone ? 'Mở lại việc này' : 'Đánh dấu hoàn thành'}
                        >
                          {isTaskDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </button>
                        <span className={`list-item-content ${isTaskDone ? 'done' : ''}`}>{task.content}</span>
                        <div className="list-item-meta">
                          {task.blocked?.isBlocked && (
                            <span className="blocked-badge" title={task.blocked.reason}><Ban size={11} /> Đang chặn</span>
                          )}
                          <span className={`priority-tag priority-${task.priority || 'medium'}`}>
                            {PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium}
                          </span>
                          {task.dueDate && (
                            <span className={`task-card-due ${isOverdue(task.dueDate) ? 'overdue' : ''}`}>
                              <Calendar size={12} /> {formatShortDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="all-columns" direction="horizontal" type="column">
              {(containerProvided) => {
                const normalColIds = boardData.columnOrder.filter(cId => {
                  const col = boardData.columns[cId];
                  if (!col) return false;
                  return cId !== 'done' && !(col.title || '').toLowerCase().includes('hoàn thành') && !(col.title || '').toLowerCase().includes('đã xong');
                });

                const doneColId = boardData.columnOrder.find(cId => {
                  const col = boardData.columns[cId];
                  if (!col) return false;
                  return cId === 'done' || (col.title || '').toLowerCase().includes('hoàn thành') || (col.title || '').toLowerCase().includes('đã xong');
                }) || boardData.columnOrder[boardData.columnOrder.length - 1];

                const orderedColIds = [...normalColIds, doneColId].filter(Boolean);

                return (
                  <div
                    className={`columns-container ${isMobile && isMobileZoomedOut ? 'mobile-zoomed-out' : ''}`}
                    ref={containerProvided.innerRef}
                    {...containerProvided.droppableProps}
                  >
                    {orderedColIds.map((columnId, colIndex) => {
                      const column = boardData.columns[columnId];
                      if (!column) return null;

                      const isDoneColumn = columnId === doneColId;

                      const tasks = column.taskIds
                        .map(taskId => boardData.tasks[taskId])
                        .filter(Boolean)
                        .filter(task => !task.archived)
                        .filter(task => {
                          if (!selectedTagFilter) return true;
                          return (task.tags || []).some(
                            t => t.toLowerCase() === selectedTagFilter.toLowerCase()
                          );
                        })
                        .filter(task => !mobileSearchQuery || task.content.toLowerCase().includes(mobileSearchQuery.toLowerCase()))
                        .filter(task => !mobileFilterAssignee || task.assignee?.name === mobileFilterAssignee)
                        .filter(task => !mobileFilterPriority || (task.priority || 'medium') === mobileFilterPriority)
                        .filter(task => !mobileFilterDue || getDeadlineUrgency(task.dueDate) === mobileFilterDue);

                      const columnEl = (
                        <Draggable
                          key={column.id}
                          draggableId={column.id}
                          index={colIndex}
                          isDragDisabled={isDoneColumn}
                        >
                          {(columnProvided, columnSnapshot) => (
                            <div
                              className={`board-column ${isDoneColumn ? 'column-done-fixed' : ''} ${columnSnapshot.isDragging ? 'dragging-column' : ''}`}
                              ref={(el) => {
                                columnProvided.innerRef(el);
                                columnRefs.current[column.id] = el;
                              }}
                              data-column-id={column.id}
                              {...columnProvided.draggableProps}
                            >
                              <div className="column-header" {...columnProvided.dragHandleProps}>
                                <div className="column-header-left">
                                  <span className={`column-dot ${isDoneColumn ? 'dot-done' : `dot-c${colIndex % 8}`}`} />
                                  <h3>{column.title}</h3>
                                  {isDoneColumn && (
                                    <span
                                      className="done-fixed-icon-badge"
                                      title="Các đầu việc đã hoàn thành luôn nằm ở bảng cuối"
                                    >
                                      <Lock size={12} />
                                    </span>
                                  )}
                                </div>
                                <div className="column-header-right">
                                  <span className="task-count">{tasks.length}</span>
                                  {!isDoneColumn && (
                                    <>
                                      <div className="column-menu-wrap">
                                        <button
                                          className="column-menu-btn"
                                          onClick={() => setOpenColumnMenu(prev => prev === column.id ? null : column.id)}
                                        >
                                          <MoreHorizontal size={15} />
                                        </button>
                                        {!isMobile && openColumnMenu === column.id && (
                                          <div className="column-menu">
                                            <button className="column-menu-item" onClick={() => openEditColumn(column)}>
                                              <Edit2 size={14} /> Sửa tên & mô tả
                                            </button>
                                            <button className="column-menu-item danger" onClick={() => handleClearColumn(column.id)}>
                                              <Trash2 size={14} /> Xoá tất cả thẻ
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      {isMobile && (
                                        <ActionSheet
                                          isOpen={openColumnMenu === column.id}
                                          onClose={() => setOpenColumnMenu(null)}
                                          title={column.title}
                                        >
                                          <button
                                            className="action-sheet-item"
                                            onClick={() => { openEditColumn(column); setOpenColumnMenu(null); }}
                                          >
                                            <Edit2 size={16} /> Sửa tên & mô tả
                                          </button>
                                          <button
                                            className="action-sheet-item danger"
                                            onClick={() => { handleClearColumn(column.id); setOpenColumnMenu(null); }}
                                          >
                                            <Trash2 size={16} /> Xoá tất cả thẻ
                                          </button>
                                        </ActionSheet>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>

                              <Droppable droppableId={column.id} type="task">
                                {(provided, snapshot) => (
                                  <div
                                    className={`task-list ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                  >
                                    {tasks.map((task, index) => (
                                      <Draggable key={task.id} draggableId={task.id} index={index}>
                                        {(provided, snapshot) => {
                                          const progress = computeTimelineProgress(task.startDate, task.dueDate);
                                          const checklistTotal = task.checklist?.length || 0;
                                          const checklistDone = task.checklist?.filter(c => c.done).length || 0;
                                          const isCollapsed = collapsedTaskIds.has(task.id);
                                          const dueUrgency = getDeadlineUrgency(task.dueDate);

                                          return (
                                            <div
                                              className={`task-card ${snapshot.isDragging ? 'dragging' : ''} ${task.blocked?.isBlocked ? 'is-blocked' : ''} ${isCollapsed ? 'collapsed' : ''}`}
                                              ref={provided.innerRef}
                                              {...provided.draggableProps}
                                              {...provided.dragHandleProps}
                                              onClick={() => openEditModal(task)}
                                            >
                                              <div className="task-card-drag-handle" onClick={e => e.stopPropagation()}>
                                                <GripVertical size={14} />
                                              </div>
                                              <div className="task-card-body">
                                                <div className="task-card-top">
                                                  <div className="task-card-top-left">
                                                    <span className={`task-code-chip type-${module.type || 'product'}`}>
                                                      {task.code || module.code || module.id}
                                                    </span>
                                                    <span className={`priority-tag priority-${task.priority || 'medium'}`}>
                                                      <Flag size={10} /> {PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium}
                                                    </span>
                                                  </div>
                                                  <div className="task-card-top-right" onClick={e => e.stopPropagation()}>
                                                    <button
                                                      type="button"
                                                      className="task-collapse-toggle-btn"
                                                      onClick={(e) => toggleCardCollapse(task.id, e)}
                                                      title={isCollapsed ? 'Mở rộng thẻ' : 'Thu gọn thẻ'}
                                                    >
                                                      {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                                    </button>
                                                  </div>
                                                </div>

                                                <div className="task-card-title-row">
                                                  <button
                                                    type="button"
                                                    className={`task-quick-complete-btn ${isDoneColumn ? 'done' : ''}`}
                                                    onClick={e => handleQuickComplete(task.id, column.id, e)}
                                                    title={isDoneColumn ? 'Mở lại việc này' : 'Đánh dấu hoàn thành'}
                                                  >
                                                    {isDoneColumn ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                                                  </button>
                                                  <div className={`task-card-title ${isDoneColumn ? 'done' : ''}`}>{task.content}</div>
                                                </div>

                                                {!isCollapsed && task.blocked?.isBlocked && (
                                                  <div className="blocked-banner" title={task.blocked.reason}>
                                                    <Ban size={12} /> {task.blocked.reason}
                                                  </div>
                                                )}

                                                {!isCollapsed && task.dependsOn && (
                                                  <div className="depends-on-chip">
                                                    <Link2 size={11} /> Phụ thuộc: {findTaskCode(task.dependsOn)}
                                                  </div>
                                                )}

                                                {!isCollapsed && (task.startDate && task.dueDate ? (
                                                  <div className="timeline-wrap">
                                                    <div className="timeline-track">
                                                      <div
                                                        className={`timeline-fill ${isOverdue(task.dueDate) ? 'overdue' : ''}`}
                                                        style={{ width: `${progress ?? 0}%` }}
                                                      />
                                                    </div>
                                                    <div className="timeline-label">
                                                      <span>{formatShortDate(task.startDate)}</span>
                                                      <span>{formatShortDate(task.dueDate)}</span>
                                                    </div>
                                                  </div>
                                                ) : task.dueDate ? (
                                                  <div className={`task-card-due ${isOverdue(task.dueDate) ? 'overdue' : ''}`}>
                                                    <Calendar size={12} /> Hạn: {formatShortDate(task.dueDate)}
                                                  </div>
                                                ) : null)}

                                                {!isCollapsed && checklistTotal > 0 && checklistTotal <= 4 && (
                                                  <div className="task-card-checklist-inline">
                                                    {task.checklist.map(item => (
                                                      <div
                                                        key={item.id}
                                                        className={`inline-checklist-row ${item.done ? 'done' : ''}`}
                                                        onClick={e => { e.stopPropagation(); handleToggleChecklistItem(task.id, item.id); }}
                                                      >
                                                        <span className="inline-checklist-check">{item.done && <Check size={10} />}</span>
                                                        <span className="inline-checklist-text">{item.text}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}

                                                <div className="task-card-footer">
                                                  {renderAssigneeChip(task.assignee)}
                                                  <div className="task-card-footer-right">
                                                    {task.tags && task.tags.length > 0 && (
                                                      <div className="task-card-tags-inline">
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
                                                    {isCollapsed ? (
                                                      task.dueDate && (
                                                        <span className={`task-card-due urgency-${dueUrgency}`}>
                                                          <Calendar size={12} /> {formatShortDate(task.dueDate)}
                                                        </span>
                                                      )
                                                    ) : (
                                                      <>
                                                        {task.progress > 0 && (
                                                          <span className="progress-chip">{task.progress}%</span>
                                                        )}
                                                        {checklistTotal > 4 && (
                                                          <span className={`checklist-chip ${checklistDone === checklistTotal ? 'all-done' : ''}`}>
                                                            <CheckSquare size={12} /> {checklistDone}/{checklistTotal}
                                                          </span>
                                                        )}
                                                        {task.documents?.length > 0 && (
                                                          <span className="doc-count-chip" title="Tài liệu liên kết">
                                                            <Paperclip size={12} /> {task.documents.length}
                                                          </span>
                                                        )}
                                                        {task.actualMinutes > 0 && (
                                                          <span className="time-tracked-chip" title="Thời gian đã theo dõi thật">
                                                            <Clock size={12} /> {formatMinutes(task.actualMinutes)}
                                                          </span>
                                                        )}
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        }}
                                      </Draggable>
                                    ))}
                                    {provided.placeholder}
                                  </div>
                                )}
                              </Droppable>
                              {!isDoneColumn && (
                                <button className="add-task-btn" onClick={() => openCreateModal(column.id)}>
                                  <Plus size={16} /> Thêm thẻ
                                </button>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );

                      if (isDoneColumn) {
                        return (
                          <React.Fragment key="done-with-add-btn">
                            {columnEl}
                            <div className="add-column">
                              <button className="add-column-btn" onClick={openCreateColumn}>
                                <Plus size={16} /> Thêm bảng
                              </button>
                            </div>
                          </React.Fragment>
                        );
                      }

                      return columnEl;
                    })}
                    {containerProvided.placeholder}
                  </div>
                );
              }}
            </Droppable>
          </DragDropContext>
        )}
        </div>

        <RightSidebarPanel
          boardData={boardData}
          groups={groups}
          isOpen={isRightSidebarOpen}
          onToggle={() => setIsRightSidebarOpen(prev => !prev)}
        />
      </div>

      {/* Thanh công cụ đáy trang module (tham khảo Trello: 1 icon đổi chế độ
          xem + cụm 3 icon lọc/chuông/cấu hình + 1 icon zoom) - thay cho pill
          "chế độ xem" đơn lẻ trước đây, gộp luôn các hành động vốn nằm rải
          rác trên header desktop (lọc tag, thông báo quá hạn, thông tin
          module) để header mobile có thể rút gọn xuống chỉ còn tên + dự án. */}
      {isMobile && (
        <div className="mobile-board-toolbar">
          <button
            type="button"
            className="toolbar-circle-btn"
            onClick={() => setIsMobileViewMenuOpen(true)}
            title="Đổi chế độ xem"
          >
            {viewMode === 'timeline' ? <Clock size={18} /> : viewMode === 'calendar' ? <Calendar size={18} /> : <Columns3 size={18} />}
          </button>

          <div className="toolbar-pill">
            <button
              type="button"
              className="toolbar-pill-btn"
              onClick={() => setShowMobileFilterSheet(true)}
              title="Lọc thẻ"
            >
              <Filter size={18} />
              {mobileActiveFilterCount > 0 && <span className="toolbar-btn-badge">{mobileActiveFilterCount}</span>}
            </button>
            <button
              type="button"
              className="toolbar-pill-btn"
              onClick={() => setShowMobileOverduePopover(true)}
              title="Công việc quá hạn"
            >
              <Bell size={18} />
              {mobileOverdueItems.length > 0 && <span className="toolbar-btn-badge">{mobileOverdueItems.length}</span>}
            </button>
            <button
              type="button"
              className="toolbar-pill-btn"
              onClick={openInfoModal}
              title="Cấu hình & chi tiết module"
            >
              <Settings size={18} />
            </button>
          </div>

          {viewMode === 'board' ? (
            <button
              type="button"
              className="toolbar-circle-btn"
              onClick={() => setIsMobileZoomedOut(z => !z)}
              title={isMobileZoomedOut ? 'Phóng to xem từng bảng' : 'Thu nhỏ xem nhiều bảng'}
            >
              {isMobileZoomedOut ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          ) : <span className="toolbar-circle-btn-spacer" />}
        </div>
      )}

      <ActionSheet
        isOpen={isMobileViewMenuOpen}
        onClose={() => setIsMobileViewMenuOpen(false)}
        title="Chế độ xem dự án (Menu chung)"
      >
        <button
          type="button"
          className="action-sheet-item"
          onClick={() => { setViewMode('board'); setIsMobileViewMenuOpen(false); }}
        >
          📋 Bảng (Kanban Board)
        </button>
        <button
          type="button"
          className="action-sheet-item"
          onClick={() => { setViewMode('calendar'); setIsMobileViewMenuOpen(false); }}
        >
          📅 Lịch (Calendar View)
        </button>
        <button
          type="button"
          className="action-sheet-item"
          onClick={() => { setViewMode('timeline'); setIsMobileViewMenuOpen(false); }}
        >
          📊 Tiến độ (Timeline / Progress)
        </button>
        <button
          type="button"
          className="action-sheet-item"
          onClick={() => { setViewMode('list'); setIsMobileViewMenuOpen(false); }}
        >
          📝 Project Plan (Danh sách)
        </button>
        <button
          type="button"
          className="action-sheet-item"
          onClick={() => { setViewMode('kpi'); setIsMobileViewMenuOpen(false); }}
        >
          🎯 KPIs & OKRs
        </button>
        <button
          type="button"
          className="action-sheet-item"
          onClick={() => { setShowAiBreakdownModal(true); setIsMobileViewMenuOpen(false); }}
        >
          ✨ AI Phân hoạch mục tiêu lớn
        </button>
      </ActionSheet>

      <ActionSheet
        isOpen={showMobileFilterSheet}
        onClose={() => setShowMobileFilterSheet(false)}
        title="Lọc thẻ"
      >
        <div className="mobile-filter-sheet-body">
          <input
            type="text"
            className="mobile-filter-search-input"
            placeholder="Tìm theo nội dung công việc..."
            value={mobileSearchQuery}
            onChange={e => setMobileSearchQuery(e.target.value)}
          />

          <div className="mobile-filter-group">
            <div className="mobile-filter-group-label"><AtSign size={12} /> Người / AI phụ trách</div>
            <div className="mobile-filter-chip-row">
              {mobileAssigneeOptions.length === 0 && (
                <span className="mobile-filter-empty-hint">Chưa có ai được gán trong bảng này</span>
              )}
              {mobileAssigneeOptions.map(a => (
                <button
                  key={a.name}
                  type="button"
                  className={`mobile-filter-chip ${mobileFilterAssignee === a.name ? 'active' : ''}`}
                  onClick={() => setMobileFilterAssignee(f => f === a.name ? '' : a.name)}
                >
                  {a.type === 'agent' ? <Bot size={12} /> : <User size={12} />} {a.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-filter-group">
            <div className="mobile-filter-group-label"><Hash size={12} /> Tag</div>
            <div className="mobile-filter-chip-row">
              {allTags.length === 0 && <span className="mobile-filter-empty-hint">Chưa có tag nào</span>}
              {allTags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  className={`mobile-filter-chip ${selectedTagFilter === tag.name ? 'active' : ''}`}
                  onClick={() => setSelectedTagFilter(f => f === tag.name ? '' : tag.name)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-filter-group">
            <div className="mobile-filter-group-label"><Flag size={12} /> Độ ưu tiên</div>
            <div className="mobile-filter-chip-row">
              {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`mobile-filter-chip ${mobileFilterPriority === key ? 'active' : ''}`}
                  onClick={() => setMobileFilterPriority(f => f === key ? '' : key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mobile-filter-group">
            <div className="mobile-filter-group-label"><Clock size={12} /> Hạn chót</div>
            <div className="mobile-filter-chip-row">
              <button
                type="button"
                className={`mobile-filter-chip ${mobileFilterDue === 'overdue' ? 'active' : ''}`}
                onClick={() => setMobileFilterDue(f => f === 'overdue' ? '' : 'overdue')}
              >
                Quá hạn
              </button>
              <button
                type="button"
                className={`mobile-filter-chip ${mobileFilterDue === 'urgent' ? 'active' : ''}`}
                onClick={() => setMobileFilterDue(f => f === 'urgent' ? '' : 'urgent')}
              >
                Sắp đến hạn
              </button>
              <button
                type="button"
                className={`mobile-filter-chip ${mobileFilterDue === 'soon' ? 'active' : ''}`}
                onClick={() => setMobileFilterDue(f => f === 'soon' ? '' : 'soon')}
              >
                Trong tuần
              </button>
            </div>
          </div>

          <div className="mobile-filter-sheet-footer">
            <button type="button" className="secondary-btn" onClick={clearMobileFilters}>
              Xoá tất cả bộ lọc
            </button>
            <button type="button" className="primary-btn" onClick={() => setShowMobileFilterSheet(false)}>
              Xem kết quả
            </button>
          </div>
        </div>
      </ActionSheet>

      <ActionSheet
        isOpen={showMobileOverduePopover}
        onClose={() => setShowMobileOverduePopover(false)}
        title={`Công việc quá hạn (${mobileOverdueItems.length})`}
      >
        {mobileOverdueItems.length === 0 ? (
          <p className="overdue-popover-empty">Không có công việc nào quá hạn 🎉</p>
        ) : (
          mobileOverdueItems.slice(0, 15).map(({ module: m, task }) => (
            <button
              key={task.id}
              type="button"
              className="overdue-popover-item"
              onClick={() => { setShowMobileOverduePopover(false); onJumpToModule(m); }}
            >
              <span className="overdue-popover-task">{task.content}</span>
              <span className="overdue-popover-module">{m.code || m.id} · hạn {formatShortDate(task.dueDate)}</span>
            </button>
          ))
        )}
      </ActionSheet>

      {isModalOpen && (
        <div className="modal-overlay" {...infoModalOverlayHandlers}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Thông tin mô hình</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {(isEditingDesc ? editSections : parseDetailSections(currentDetails))
                // Keep each section's real index (used by updateSectionText below)
                // attached before filtering, so editing a section after the
                // filter removes earlier ones doesn't silently save over the
                // wrong section (e.g. "Rủi ro lớn nhất" overwriting "Bản chất").
                .map((section, i) => ({ section, i }))
                .filter(({ section }) => {
                  const label = (section.label || '').toLowerCase();
                  return !label.includes('tài sản')
                      && !label.includes('kpi')
                      && !label.includes('nguồn tiền')
                      && !label.includes('nguồn thu')
                      && !label.includes('bản chất')
                      && !label.includes('phù hợp')
                      && !label.includes('khách hàng')
                      && !label.includes('case study')
                      && !label.includes('case tiêu biểu');
                })
                .map(({ section, i }) => (
                <div className="info-section" key={i}>
                  {section.label && <span className="info-section-label">{section.label}</span>}
                  {isEditingDesc ? (
                    <textarea
                      className="info-section-textarea"
                      rows={3}
                      value={section.text}
                      onChange={e => updateSectionText(i, e.target.value)}
                    />
                  ) : (
                    <p className="info-section-text">{section.text}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-footer">
              {isEditingDesc ? (
                <button className="primary-btn" onClick={handleSaveDesc}>
                  <Save size={16} /> Lưu thay đổi
                </button>
              ) : (
                <button className="primary-btn" onClick={startEditingDesc}>
                  <Edit2 size={16} /> Chỉnh sửa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {taskModal && (
        <TaskModal
          mode={taskModal.mode}
          initial={taskModal.mode === 'edit' ? taskModal.task : null}
          allTasks={Object.values(boardData.tasks)}
          module={module}
          groups={groups}
          onClose={closeTaskModal}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          onArchive={taskModal.mode === 'edit' ? (() => handleArchiveTask(taskModal.task.id)) : null}
        />
      )}

      {columnModal && (
        <ColumnModal
          mode={columnModal.mode}
          initial={columnModal.mode === 'edit' ? columnModal.column : null}
          canDelete={boardData.columnOrder.length > 1}
          onClose={closeColumnModal}
          onSave={handleSaveColumn}
          onDelete={handleDeleteColumn}
        />
      )}

      {showAiBreakdownModal && (
        <AiTaskBreakdownModal
          module={module}
          columnId={boardData.columnOrder[0]}
          onClose={() => setShowAiBreakdownModal(false)}
          onAddTasks={handleBatchAddTasks}
        />
      )}

      {showArchivedModal && (
        <ArchivedTasksModal
          module={module}
          archivedTasks={archivedTasks}
          allTags={allTags}
          onClose={() => setShowArchivedModal(false)}
          onRestoreTask={handleRestoreTask}
          onDeleteTask={handleDeleteArchivedTask}
        />
      )}
    </div>
  );
}
