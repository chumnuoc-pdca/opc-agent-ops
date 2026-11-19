import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Clock, FolderKanban, Target } from 'lucide-react';
import HeaderActions from './HeaderActions';
import { fetchTimeStats } from '../utils/timeStatsOperations';
import { formatMinutes } from '../utils/timeTrackingOperations';

const toISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDayLabel = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

// Phase 16: Dashboard thời gian - đọc thẳng time_entries thật (Phase 12) qua
// GET /api/time-stats, KHÔNG có số liệu giả lập. Theo đúng pattern trực
// quan stat-card của Overview.jsx.
export default function TimeDashboardPage({ theme, onToggleTheme, flatModules = [], groups = [], onJumpToModule, onJumpToGroup }) {
  const [from, setFrom] = useState(() => toISO(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(() => toISO(new Date()));
  const [groupId, setGroupId] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchTimeStats({ from, to, groupId: groupId || undefined })
      .then(setStats)
      .catch((err) => setError(err.message || 'Không tải được thống kê.'))
      .finally(() => setLoading(false));
  }, [from, to, groupId]);

  const maxDayMinutes = useMemo(() => Math.max(1, ...(stats?.byDay || []).map((d) => d.totalMinutes)), [stats]);
  const maxGroupMinutes = useMemo(() => Math.max(1, ...(stats?.byGroup || []).map((g) => g.totalMinutes)), [stats]);
  const maxModuleMinutes = useMemo(() => Math.max(1, ...(stats?.byModule || []).map((m) => m.totalMinutes)), [stats]);

  // Kết nối Dashboard với các trang cũ - bấm 1 dòng thống kê nhảy thẳng tới
  // đúng module/dự án tương ứng, thay vì chỉ là text tĩnh không thao tác
  // được (byTask chỉ có moduleCode từ backend, tra ngược qua flatModules
  // đã có sẵn ở props thay vì đổi shape API).
  const handleTaskRowClick = (moduleCode) => {
    const found = flatModules.find((m) => m.code === moduleCode);
    if (found) onJumpToModule?.({ id: found.id });
  };

  const ev = stats?.estimateVsActual;
  const deltaMinutes = ev ? ev.actualMinutes - ev.estimateMinutes : 0;
  const deltaPct = ev && ev.estimateMinutes > 0 ? Math.round((deltaMinutes / ev.estimateMinutes) * 100) : null;

  return (
    <div className="board-container">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Thống kê thời gian</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
        <div className="board-title-section">
          <div className="board-title-row">
            <span className="page-icon-badge accent-teal"><BarChart3 size={18} /></span>
            <h1>Thống kê thời gian</h1>
          </div>
          <p className="board-subtitle">Số liệu thời gian thật đã theo dõi (Start/Stop) theo nhóm/module/công việc - không phải ước tính.</p>
        </div>
      </div>

      <div className="board-content board-content-scroll">
        <div className="time-dashboard-content">
          <div className="time-dashboard-filters">
            <label>
              Từ ngày
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} />
            </label>
            <label>
              Dự án
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Tất cả dự án</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </label>
          </div>

          {error && <div className="chat-error-banner">{error}</div>}

          {!loading && stats && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-card-top"><span className="stat-card-icon accent-indigo"><Clock size={17} /></span></div>
                  <div className="stat-card-value">{formatMinutes(stats.totalMinutes)}</div>
                  <div className="stat-card-label">Tổng thời gian đã theo dõi</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-top"><span className="stat-card-icon accent-sky"><FolderKanban size={17} /></span></div>
                  <div className="stat-card-value">{stats.byGroup.length}</div>
                  <div className="stat-card-label">Dự án có hoạt động</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-top"><span className="stat-card-icon accent-amber"><Target size={17} /></span></div>
                  <div className="stat-card-value">{ev?.taskCount || 0}</div>
                  <div className="stat-card-label">Việc đã đặt thời gian dự kiến</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-top"><span className="stat-card-icon accent-rose"><BarChart3 size={17} /></span></div>
                  <div className="stat-card-value">
                    {deltaPct == null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`}
                  </div>
                  <div className="stat-card-label">Lệch thực tế so với dự kiến</div>
                </div>
              </div>

              <div className="time-dashboard-section">
                <h3>Theo ngày</h3>
                {stats.byDay.length === 0 ? (
                  <p className="notes-panel-empty">Chưa có phiên theo dõi thời gian nào trong khoảng ngày này.</p>
                ) : (
                  <div className="time-bar-chart">
                    {stats.byDay.map((d) => (
                      <div key={d.date} className="time-bar-col" title={`${formatDayLabel(d.date)}: ${formatMinutes(d.totalMinutes)}`}>
                        <div className="time-bar-fill" style={{ height: `${(d.totalMinutes / maxDayMinutes) * 100}%` }} />
                        <span className="time-bar-label">{formatDayLabel(d.date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="time-dashboard-grid-2">
                <div className="time-dashboard-section">
                  <h3>Theo dự án</h3>
                  {stats.byGroup.length === 0 ? <p className="notes-panel-empty">Chưa có dữ liệu.</p> : (
                    <div className="time-hbar-list">
                      {stats.byGroup.map((g) => (
                        <button
                          type="button"
                          key={g.groupId}
                          className="time-hbar-row time-hbar-row-clickable"
                          onClick={() => onJumpToGroup?.(g.groupId)}
                          title="Xem trang dự án"
                        >
                          <span className="time-hbar-label">{g.groupTitle}</span>
                          <div className="time-hbar-track"><div className="time-hbar-fill" style={{ width: `${(g.totalMinutes / maxGroupMinutes) * 100}%` }} /></div>
                          <span className="time-hbar-value">{formatMinutes(g.totalMinutes)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="time-dashboard-section">
                  <h3>Theo module</h3>
                  {stats.byModule.length === 0 ? <p className="notes-panel-empty">Chưa có dữ liệu.</p> : (
                    <div className="time-hbar-list">
                      {stats.byModule.map((m) => (
                        <button
                          type="button"
                          key={m.moduleId}
                          className="time-hbar-row time-hbar-row-clickable"
                          onClick={() => onJumpToModule?.({ id: m.moduleId })}
                          title="Xem bảng công việc module này"
                        >
                          <span className="time-hbar-label">{m.moduleCode} · {m.moduleTitle}</span>
                          <div className="time-hbar-track"><div className="time-hbar-fill" style={{ width: `${(m.totalMinutes / maxModuleMinutes) * 100}%` }} /></div>
                          <span className="time-hbar-value">{formatMinutes(m.totalMinutes)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="time-dashboard-section">
                <h3>Theo công việc (top 15)</h3>
                {stats.byTask.length === 0 ? <p className="notes-panel-empty">Chưa có dữ liệu.</p> : (
                  <table className="time-task-table">
                    <thead>
                      <tr><th>Mã</th><th>Công việc</th><th>Dự kiến</th><th>Thực tế</th></tr>
                    </thead>
                    <tbody>
                      {stats.byTask.map((t) => (
                        <tr key={t.taskId} className="time-task-row-clickable" onClick={() => handleTaskRowClick(t.moduleCode)} title="Xem module chứa công việc này">
                          <td>{t.code}</td>
                          <td>{t.content}</td>
                          <td>{t.estimateMinutes != null ? formatMinutes(t.estimateMinutes) : '—'}</td>
                          <td>{formatMinutes(t.totalMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
