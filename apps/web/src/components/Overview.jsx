import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ListChecks, CheckCircle2, TrendingUp, Sparkles, X, FolderKanban, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { loadAllBoards } from '../utils/boardStorage';
import { hexToRgba } from '../utils/colorFromImage';
import HeaderActions from './HeaderActions';
import GroupModal from './GroupModal';
import { ModuleTypeInlineIcon } from './ModuleTypeBadge';
import { useIsMobile } from '../utils/useIsMobile';

const TIP_DISMISSED_KEY = 'opc-tip-dismissed';
const SUMMARY_COLUMN_ID = '__summary__';

export default function Overview({ theme, onToggleTheme, onSelectModule, onSelectGroup, onUpdateGroup, groups = [], flatModules = [] }) {
  const isMobile = useIsMobile();
  const [tipDismissed, setTipDismissed] = useState(
    () => localStorage.getItem(TIP_DISMISSED_KEY) === '1'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [editingGroup, setEditingGroup] = useState(null);

  // ---- Mobile: chấm phân trang cho các cột (Tổng quan + từng dự án) ----
  const [activeOverviewColumn, setActiveOverviewColumn] = useState(SUMMARY_COLUMN_ID);
  const overviewColumnRefs = useRef({});

  const toggleGroupExpand = (groupId, e) => {
    e.stopPropagation();
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Reads every module's persisted board (or its seed backlog if never opened)
  // so the numbers below reflect real, current data - not placeholders.
  const boards = useMemo(() => loadAllBoards(flatModules), [flatModules]);

  const stats = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    boards.forEach(({ board }) => {
      totalTasks += Object.keys(board.tasks || {}).length;
      completedTasks += board.columns?.done?.taskIds?.length || 0;
    });
    const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 1000) / 10;
    return {
      totalGroups: groups.length,
      totalModules: flatModules.length,
      totalTasks,
      completedTasks,
      completionRate
    };
  }, [boards, groups, flatModules]);

  const groupSections = useMemo(() => {
    if (!groups || groups.length === 0) return [];

    return groups.map(group => {
      let groupTotalTasks = 0;
      let groupDoneTasks = 0;
      let productCount = 0;
      let operationCount = 0;

      const items = (group.modules || []).map(module => {
        if ((module.type || 'product') === 'operation') {
          operationCount += 1;
        } else {
          productCount += 1;
        }
        const boardEntry = boards.find(b => b.module.id === module.id);
        const board = boardEntry?.board || { tasks: {}, columns: {} };
        const taskCount = Object.keys(board.tasks || {}).length;
        const doneCount = board.columns?.done?.taskIds?.length || 0;
        groupTotalTasks += taskCount;
        groupDoneTasks += doneCount;
        return { module, taskCount, doneCount };
      });

      const groupPct = groupTotalTasks === 0 ? 0 : Math.round((groupDoneTasks / groupTotalTasks) * 100);

      // Mã hiển thị cạnh tên dự án = tiền tố chữ thật của mã module trong
      // dự án đó (vd "MFC1"/"MFC4" -> "MFC"), KHÔNG phải group.code - field
      // đó chỉ là 1 chữ cái nội bộ dùng cho màu accent, không khớp với mã
      // dự án thật mà người dùng thấy trên mọi thẻ module (đã kiểm chứng
      // qua dữ liệu thật: MFC MARKET có group.code="T" dù mọi module đều
      // "MFC*"). Rơi về group.code chỉ khi dự án chưa có module nào.
      const firstModuleCode = items[0]?.module.code;
      const displayCode = (firstModuleCode ? firstModuleCode.replace(/\d+$/, '') : '') || group.code || group.title.charAt(0).toUpperCase();

      return {
        id: group.id,
        title: group.title,
        code: group.code || group.title.charAt(0).toUpperCase(),
        displayCode,
        logoUrl: group.logoUrl || null,
        customAccentColor: group.customAccentColor || null,
        accent: group.accent || 'indigo',
        items,
        productCount,
        operationCount,
        totalTasks: groupTotalTasks,
        doneTasks: groupDoneTasks,
        completionRate: groupPct
      };
    }).filter(g => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = g.title.toLowerCase().includes(q);
      const matchCode = g.code.toLowerCase().includes(q) || g.displayCode.toLowerCase().includes(q);
      const matchModule = g.items.some(i => i.module.title.toLowerCase().includes(q) || (i.module.code || '').toLowerCase().includes(q));
      return matchTitle || matchCode || matchModule;
    });
  }, [groups, boards, searchQuery]);

  const overviewColumnIds = useMemo(
    () => [SUMMARY_COLUMN_ID, ...groupSections.map(g => g.id || g.title)],
    [groupSections]
  );

  const scrollToOverviewColumn = (id) => {
    overviewColumnRefs.current[id]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActiveOverviewColumn(id);
  };

  // root PHẢI là .overview-mobile-columns-wrap (phần tử overflow-x:auto
  // thật sự) - bài học từ Kanban module: trỏ nhầm vào flex child bên trong
  // (không tự scroll) khiến chấm không sáng đúng lúc vuốt.
  useEffect(() => {
    if (!isMobile) return undefined;
    const container = document.querySelector('.overview-mobile-columns-wrap');
    if (!container) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible) setActiveOverviewColumn(mostVisible.target.dataset.overviewColumnId);
      },
      { root: container, threshold: [0.5] }
    );
    Object.values(overviewColumnRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile, overviewColumnIds]);

  const dismissTip = () => {
    localStorage.setItem(TIP_DISMISSED_KEY, '1');
    setTipDismissed(true);
  };

  // Trích thành hàm dùng chung cho cả layout desktop (1 cột dọc như cũ) lẫn
  // layout cột-vuốt-ngang trên mobile (mỗi dự án 1 cột) - tránh lặp lại
  // nguyên khối JSX này 2 lần.
  const renderGroupCard = (group) => {
    const isExpanded = Boolean(expandedGroups[group.id]);
    // Nền pastel + màu avatar PHẢI ưu tiên customAccentColor (màu tự chọn
    // riêng cho từng dự án, ví dụ lấy từ logo) khi có - đúng logic đã dùng
    // ở ProjectOverviewPage.jsx ("trang dự án" thật). Trước đây trang Tổng
    // quan chỉ dùng group.accent (1 trong 8 màu preset cố định) nên phần
    // lớn dự án đã tự đặt màu riêng bị hiện SAI màu ở đây.
    const pastelStyle = group.customAccentColor ? { background: hexToRgba(group.customAccentColor, 0.16) } : undefined;
    const pastelClassName = group.customAccentColor ? '' : `group-accent-${group.accent}`;
    const avatarStyle = group.customAccentColor ? { background: group.customAccentColor } : undefined;
    const avatarClassName = `group-avatar-large ${group.customAccentColor ? '' : `accent-avatar-${group.accent}`}`;
    return (
      <div key={group.id || group.title} className={`group-section-card ${pastelClassName}`} style={pastelStyle}>
        <div className="group-card-header">
          <div className="group-card-header-left">
            <button
              type="button"
              className={avatarClassName}
              style={{ ...avatarStyle, cursor: 'pointer' }}
              onClick={() => setEditingGroup({ ...group, code: group.displayCode })}
              title="Đổi ảnh đại diện dự án"
            >
              {group.logoUrl ? <img src={group.logoUrl} alt="" /> : group.code}
            </button>
            <div
              className="group-card-info clickable"
              onClick={() => onSelectGroup && onSelectGroup(group.id)}
              title="Bấm để chuyển thẳng sang trang Dự án"
            >
              <div className="group-card-title-row">
                <h3 className="group-card-title">{group.title}</h3>
                <span className={`group-code-badge accent-${group.accent}`}>{group.displayCode}</span>
              </div>
              <div className="group-card-meta">
                <span className="group-meta-stat"><ModuleTypeInlineIcon type="product" size={13} /> {group.productCount}</span>
                <span className="group-meta-dot">•</span>
                <span className="group-meta-stat"><ModuleTypeInlineIcon type="operation" size={13} /> {group.operationCount}</span>
                <span className="group-meta-dot">•</span>
                <span>{group.totalTasks} việc</span>
              </div>
            </div>
          </div>

          <div className="group-card-header-right">
            <div className="group-progress-box">
              <div className="group-progress-label">
                <span>Tiến độ dự án</span>
                <strong>{group.completionRate}%</strong>
              </div>
              <div className="group-progress-track">
                <div
                  className={`group-progress-fill ${group.customAccentColor ? '' : `accent-progress-${group.accent}`}`}
                  style={{ width: `${group.completionRate}%`, background: group.customAccentColor || undefined }}
                />
              </div>
            </div>
            <button
              type="button"
              className="group-expand-toggle-btn"
              onClick={e => toggleGroupExpand(group.id, e)}
              title={isExpanded ? 'Thu gọn danh sách mô hình' : 'Mở rộng danh sách mô hình'}
            >
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
        </div>

        {(isExpanded || !searchQuery) && (
          <div className={`module-grid ${isExpanded ? 'expanded' : 'collapsible'}`}>
            {group.items.map(({ module, taskCount, doneCount }) => {
              const pct = taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100);
              return (
                <button key={module.id} className="module-card" onClick={() => onSelectModule(module)}>
                  <div className="module-card-top">
                    <span className={`task-code-chip accent-${group.accent}`}>{module.code || module.id}</span>
                    <span className="module-card-pct">{pct}%</span>
                  </div>
                  <div className="module-card-title">{module.title}</div>
                  <div className="module-card-progress">
                    <div className="module-card-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="module-card-meta">{doneCount}/{taskCount} công việc hoàn thành</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const heroStatsEl = (
    <>
      <div className="overview-hero">
        <span className="overview-hero-eyebrow">Tổng quan hệ thống</span>
        <h1>Chào mừng trở lại 👋</h1>
        <p>Theo dõi tiến độ {stats.totalGroups} dự án ({stats.totalModules} mô hình AI kiếm tiền) và toàn bộ đầu việc đang chạy trong hệ sinh thái OPC.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-icon accent-sky"><FolderKanban size={17} /></span>
          </div>
          <div className="stat-card-value">{stats.totalGroups}</div>
          <div className="stat-card-label">Dự án đang vận hành</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-icon accent-amber"><Boxes size={17} /></span>
          </div>
          <div className="stat-card-value">{stats.totalModules}</div>
          <div className="stat-card-label">Mô hình đang vận hành</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-icon accent-indigo"><ListChecks size={17} /></span>
          </div>
          <div className="stat-card-value">{stats.totalTasks}</div>
          <div className="stat-card-label">Tổng số đầu việc</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-icon accent-teal"><CheckCircle2 size={17} /></span>
          </div>
          <div className="stat-card-value">{stats.completedTasks}</div>
          <div className="stat-card-label">Đã hoàn thành (Kanban)</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-icon accent-rose"><TrendingUp size={17} /></span>
          </div>
          <div className="stat-card-value">{stats.completionRate}%</div>
          <div className="stat-card-label">Tỷ lệ hoàn thành chung</div>
        </div>
      </div>
    </>
  );

  const searchBarEl = (
    <div className="overview-search-bar">
      <Search size={16} className="overview-search-icon" />
      <input
        type="text"
        className="overview-search-input"
        placeholder="Tìm kiếm dự án hoặc mô hình..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <button className="overview-search-clear" onClick={() => setSearchQuery('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );

  const tipEl = !tipDismissed && (
    <div className="overview-tip">
      <span className="overview-tip-icon"><Sparkles size={16} /></span>
      <div className="overview-tip-text">
        <strong>Mẹo:</strong> Chạm vào tên dự án để vào trang dự án, chạm vào mũi tên để mở rộng/thu gọn các mô hình bên trong.
      </div>
      <button className="overview-tip-dismiss" onClick={dismissTip} title="Đã hiểu">
        <X size={15} />
      </button>
    </div>
  );

  return (
    <div className="board-container overview-page">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Tổng quan</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onSelectModule} flatModules={flatModules} />
        </div>
      </div>

      {isMobile ? (
        <>
          {/* Ô tìm kiếm lên trên cùng, ngay dưới headbar - tách khỏi cột 1
              (tham khảo yêu cầu: không cuộn/vuốt theo cột, luôn thấy được
              để tìm bất kỳ lúc nào đang ở cột nào). */}
          <div className="overview-mobile-search-top">
            {searchBarEl}
          </div>

          {/* Chấm phân trang (giống trang module) - 1 chấm/cột, sáng đúng
              cột đang xem, bấm để nhảy thẳng tới cột đó. */}
          <div className="mobile-page-dots">
            {overviewColumnIds.map(id => (
              <span
                key={id}
                className={`mobile-dot ${activeOverviewColumn === id ? 'active' : ''}`}
                onClick={() => scrollToOverviewColumn(id)}
              />
            ))}
          </div>

          <div className="overview-mobile-columns-wrap">
            <div className="overview-mobile-columns">
              {/* Cột 1: nguyên khối Tổng quan hệ thống -> hết dòng Tỷ lệ hoàn
                  thành chung (5 stat-card cuối). */}
              <div
                className="overview-mobile-column"
                data-overview-column-id={SUMMARY_COLUMN_ID}
                ref={el => { overviewColumnRefs.current[SUMMARY_COLUMN_ID] = el; }}
              >
                {heroStatsEl}
                {tipEl}
              </div>

              {/* Cột 2, 3, 4... : mỗi dự án 1 cột riêng. */}
              {groupSections.map(group => {
                const columnId = group.id || group.title;
                return (
                  <div
                    className="overview-mobile-column"
                    key={columnId}
                    data-overview-column-id={columnId}
                    ref={el => { overviewColumnRefs.current[columnId] = el; }}
                  >
                    {renderGroupCard(group)}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="overview-scroll">
          {heroStatsEl}
          {searchBarEl}
          {tipEl}
          {groupSections.map(group => renderGroupCard(group))}
        </div>
      )}

      {editingGroup && (
        <GroupModal
          mode="edit"
          initial={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={(data) => {
            onUpdateGroup && onUpdateGroup(editingGroup.id, data);
            setEditingGroup(null);
          }}
        />
      )}
    </div>
  );
}
