import React from 'react';
import { BookOpen } from 'lucide-react';
import HeaderActions from './HeaderActions';
import NotesPanel from './NotesPanel';

// Trang "Kho tri thức" (Phase 13) - ghi chú scope='knowledge', độc lập
// không gắn task/module/dự án nào (khác Task Note/Group Note đã gắn ở
// TaskModal/ProjectOverviewPage). Cùng khung layout .board-container/
// .board-header như AuditLogPage.jsx để nhất quán với các trang khác.
export default function KnowledgeBasePage({ theme, onToggleTheme, flatModules, onJumpToModule }) {
  return (
    <div className="board-container">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Kho tri thức</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
        <div className="board-title-section">
          <div className="board-title-row">
            <span className="page-icon-badge accent-sky"><BookOpen size={18} /></span>
            <h1>Kho tri thức</h1>
          </div>
          <p className="board-subtitle">
            Ghi chú/tri thức dùng lại được, không gắn riêng dự án hay công việc nào - quy trình, nghiên cứu, bài học, hướng dẫn.
          </p>
        </div>
      </div>
      <div className="board-content board-content-scroll">
        <div className="knowledge-base-content">
          {/* Bọc trong .project-description-card (thẻ trắng nổi trên nền
              trang) - đúng khung đã dùng cho "Ghi chú dự án" ở
              ProjectOverviewPage.jsx, tránh NotesPanel "trôi" trực tiếp
              trên nền trang không có khung như trước. */}
          <div className="project-description-card">
            <NotesPanel scopeType="knowledge" scopeId={null} emptyHint="Chưa có tri thức nào được lưu. Bấm 'Thêm ghi chú' để bắt đầu." />
          </div>
        </div>
      </div>
    </div>
  );
}
