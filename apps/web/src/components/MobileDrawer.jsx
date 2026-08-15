import React from 'react';

// Bọc NGUYÊN Sidebar.jsx (không sửa file đó) thành 1 overlay trượt từ trái
// cho mobile - tái dùng kỹ thuật position:fixed backdrop giống modal, NHƯNG
// đóng ngay ở 1 lần bấm ra ngoài (không phải double-click như
// useOverlayClose, vì đây là điều hướng nhanh chứ không phải form đang gõ
// dở có nguy cơ mất dữ liệu).
export default function MobileDrawer({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="mobile-drawer-overlay" onClick={onClose}>
      <div className="mobile-drawer-panel" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
