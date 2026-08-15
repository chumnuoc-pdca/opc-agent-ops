import React from 'react';
import { LayoutDashboard, CalendarDays, Sparkles, Menu } from 'lucide-react';
import { emitOpenMobileMenu } from '../utils/mobileMenuBus';

// Thanh tab cố định dưới cùng cho mobile - 3 điểm đến hay dùng nhất + 1 nút
// Menu mở MobileDrawer (chứa nguyên Sidebar.jsx) cho phần còn lại (cây dự
// án/module, Timeline, Nhân sự, Nhật ký, Cài đặt).
const TABS = [
  { type: 'overview', label: 'Tổng quan', Icon: LayoutDashboard, action: 'onSelectOverview' },
  { type: 'calendar', label: 'Lịch', Icon: CalendarDays, action: 'onSelectCalendar' },
  { type: 'chat', label: 'Trợ lý AI', Icon: Sparkles, action: 'onSelectChat' }
];

export default function MobileBottomNav({ view, onSelectOverview, onSelectCalendar, onSelectChat }) {
  const actions = { onSelectOverview, onSelectCalendar, onSelectChat };

  return (
    <nav className="mobile-bottom-nav">
      {TABS.map(({ type, label, Icon, action }) => (
        <button
          key={type}
          type="button"
          className={`mobile-bottom-nav-item ${view.type === type ? 'active' : ''}`}
          onClick={actions[action]}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
      <button type="button" className="mobile-bottom-nav-item" onClick={emitOpenMobileMenu}>
        <Menu size={20} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
