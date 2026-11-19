import React, { useMemo, useState } from 'react';
import { User, Bot, Activity, PanelRightClose, PanelRightOpen, SlidersHorizontal } from 'lucide-react';
import { getBoardTaskCounts, loadAllBoards } from '../utils/boardStorage';
import { loadAuditLog } from '../utils/auditLog';

const relativeTime = (ts) => {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  return `${day} ngày trước`;
};

// Short label for a group's gauge, e.g. "Biztro - AI-powered MMO & Affiliate" -> "Biztro".
const groupShortLabel = (group) => group.title?.split(' - ')[0]?.trim() || group.code || group.title;

export default function RightSidebarPanel({ boardData, groups, isOpen = true, onToggle }) {
  const [showCardCounts, setShowCardCounts] = useState(true);
  const [showFrontDoneBadges, setShowFrontDoneBadges] = useState(true);
  const { total: totalTasks, todo: todoTasks, inProgress: inProgressTasks, done: completedTasks } = getBoardTaskCounts(boardData);
  const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Real per-group completion, computed from every module's actual board
  // data (not a hardcoded demo number) - only recomputed when the group
  // structure changes, since it re-reads every module's board from storage.
  const groupStats = useMemo(() => {
    if (!groups) return [];
    return groups.map(group => {
      const boards = loadAllBoards(group.modules);
      let total = 0;
      let done = 0;
      boards.forEach(({ board }) => {
        const counts = getBoardTaskCounts(board);
        total += counts.total;
        done += counts.done;
      });
      return {
        id: group.id,
        label: groupShortLabel(group),
        accent: group.accent || 'indigo',
        percent: total > 0 ? Math.round((done / total) * 100) : 0
      };
    });
  }, [groups]);

  // Re-read on every render (cheap localStorage read) so a fresh AI action
  // shows up immediately without needing its own change-subscription.
  const recentActivity = loadAuditLog().slice(0, 4);

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="right-sidebar-panel drawer-open">
      {/* Header bar of Right Drawer */}
      <div className="sidebar-drawer-top">
        <span className="drawer-title-tag">BẢNG QUẢN LÝ TIẾN ĐỘ</span>
        <button className="drawer-close-btn" onClick={onToggle} title="Thu gọn bảng tiến độ">
          <PanelRightClose size={17} />
        </button>
      </div>

      {/* Overall Progress Widget - real completion of this module's board */}
      <div className="panel-widget progress-donut-widget">
        <div className="widget-header">
          <h3>Tiến Độ Tổng Thể</h3>
          <span className="widget-sub">{totalTasks > 0 ? `${completedTasks}/${totalTasks} công việc hoàn thành` : 'Chưa có công việc nào'}</span>
        </div>

        <div className="donut-chart-container">
          <svg className="donut-svg" viewBox="0 0 100 100">
            {/* Background track */}
            <circle cx="50" cy="50" r="40" className="donut-track" />
            {/* Progress stroke */}
            <circle
              cx="50"
              cy="50"
              r="40"
              className="donut-fill"
              style={{
                strokeDasharray: 251.2,
                strokeDashoffset: 251.2 - (251.2 * overallPercent) / 100
              }}
            />
          </svg>
          <div className="donut-center-text">
            <span className="percent-num">{overallPercent}%</span>
            <span className="percent-label">Hoàn Thành</span>
          </div>
        </div>
      </div>

      {/* Quick Counter Grid - real counts by column (first = todo, last = done) */}
      <div className="panel-widget stats-counter-grid">
        <div className="stat-card stat-total">
          <span className="stat-value">{totalTasks}</span>
          <span className="stat-title">Tổng Công Việc</span>
        </div>
        <div className="stat-card stat-upcoming highlighted">
          <span className="stat-value">{todoTasks}</span>
          <span className="stat-title">Cần Làm (To-Do)</span>
        </div>
        <div className="stat-card stat-in-progress">
          <span className="stat-value">{inProgressTasks}</span>
          <span className="stat-title">Đang Thực Hiện</span>
        </div>
        <div className="stat-card stat-completed">
          <span className="stat-value">{completedTasks}</span>
          <span className="stat-title">Đã Hoàn Thành</span>
        </div>
      </div>

      {/* Efficiency Gauges - real completion % per group, across all its modules */}
      {groupStats.length > 0 && (
        <div className="panel-widget efficiency-gauges-widget">
          <div className="widget-header">
            <h3>Hiệu Suất Theo Dự Án</h3>
          </div>
          <div className="gauges-row">
            {groupStats.map(g => (
              <div className="gauge-item" key={g.id}>
                <div className="mini-ring" style={{ borderColor: `var(--${g.accent})`, color: `var(--${g.accent})` }}>
                  <span>{g.percent}%</span>
                </div>
                <span className="gauge-label">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Board Display Toggles Widget */}
      <div className="panel-widget display-toggles-widget">
        <div className="widget-header">
          <h3><SlidersHorizontal size={15} /> Cài Đặt Hiển Thị Bảng</h3>
        </div>
        <div className="display-toggles-list">
          <label className="display-toggle-row">
            <span className="toggle-label-text">Số lượng thẻ ở tiêu đề cột</span>
            <input
              type="checkbox"
              className="toggle-checkbox"
              checked={showCardCounts}
              onChange={e => setShowCardCounts(e.target.checked)}
            />
          </label>
          <label className="display-toggle-row">
            <span className="toggle-label-text">Badge hoàn tất mặt trước thẻ</span>
            <input
              type="checkbox"
              className="toggle-checkbox"
              checked={showFrontDoneBadges}
              onChange={e => setShowFrontDoneBadges(e.target.checked)}
            />
          </label>
        </div>
      </div>

      {/* Recent Activity Timeline - real AI assistant action log, not demo data */}
      <div className="panel-widget activity-feed-widget">
        <div className="widget-header">
          <h3><Activity size={16} /> Hoạt Động Gần Đây</h3>
        </div>

        {recentActivity.length === 0 ? (
          <p className="empty-text">Chưa có hoạt động nào từ trợ lý AI.</p>
        ) : (
          <div className="activity-list">
            {recentActivity.map(act => (
              <div key={act.id} className="activity-item">
                <div className={`activity-avatar ${act.status === 'error' ? 'agent' : 'human'}`}>
                  {act.actorType === 'ai_on_behalf_of_user' ? <Bot size={13} /> : <User size={13} />}
                </div>
                <div className="activity-content">
                  <div className="activity-user-row">
                    <span className="act-user-name">{act.status === 'error' ? 'Lỗi thao tác AI' : 'Trợ lý AI'}</span>
                    <span className="act-time">{relativeTime(act.createdAt)}</span>
                  </div>
                  <div className="act-action-text">{act.summary || act.action}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
