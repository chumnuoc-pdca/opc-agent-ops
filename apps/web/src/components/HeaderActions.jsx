import React, { useState, useRef, useEffect } from 'react';
import { Bell, Sun, Moon, Menu } from 'lucide-react';
import { loadAllBoards, isOverdue, formatShortDate } from '../utils/boardStorage';
import { emitOpenMobileMenu } from '../utils/mobileMenuBus';

// Shared header controls used by both the Overview dashboard and per-module boards:
// a real light/dark theme toggle, and a bell that lists every overdue task across
// all modules (not just the one currently open) so it's actually useful.
export default function HeaderActions({ theme, onToggleTheme, onJumpToModule, flatModules }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const overdueItems = loadAllBoards(flatModules).flatMap(({ module, board }) =>
    Object.values(board.tasks || {})
      .filter(task => isOverdue(task.dueDate))
      .map(task => ({ module, task }))
  );

  return (
    <div className="header-actions">
      <button
        className="icon-btn mobile-menu-trigger"
        onClick={emitOpenMobileMenu}
        title="Mở menu điều hướng"
      >
        <Menu size={17} />
      </button>

      <button
        className="icon-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      <div className="overdue-popover-wrap" ref={wrapRef}>
        <button className="icon-btn" onClick={() => setOpen(o => !o)} title="Công việc quá hạn">
          <Bell size={17} />
          {overdueItems.length > 0 && <span className="icon-btn-badge">{overdueItems.length}</span>}
        </button>

        {open && (
          <div className="overdue-popover">
            <div className="overdue-popover-title">Công việc quá hạn ({overdueItems.length})</div>
            {overdueItems.length === 0 ? (
              <div className="overdue-popover-empty">Không có công việc nào quá hạn 🎉</div>
            ) : (
              overdueItems.slice(0, 10).map(({ module, task }) => (
                <button
                  key={task.id}
                  className="overdue-popover-item"
                  onClick={() => { onJumpToModule(module); setOpen(false); }}
                >
                  <span className="overdue-popover-task">{task.content}</span>
                  <span className="overdue-popover-module">{module.code || module.id} · hạn {formatShortDate(task.dueDate)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
