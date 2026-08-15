import React from 'react';
import { createPortal } from 'react-dom';

// Bảng hành động trượt lên từ đáy màn hình - thay cho dropdown nhỏ trên
// mobile (theo tham khảo Trello: menu cột/thẻ đều dùng bottom-sheet, không
// phải dropdown kiểu desktop). Chỉ render khi isOpen=true - nơi gọi tự
// quyết định lúc nào dùng ActionSheet (mobile) hay dropdown cũ (desktop).
// `children` là danh sách <button> hành động do nơi gọi tự truyền vào -
// đóng sheet lại sau khi nơi gọi tự lo xong hành động của nó.
//
// Render qua portal thẳng vào document.body - BẮT BUỘC vì component này
// thường bị lồng bên trong 1 .task-card (@hello-pangea/dnd's Draggable).
// Draggable luôn set `transform` (kể cả lúc đứng yên, không chỉ lúc kéo)
// lên phần tử gốc của nó để phối hợp animate vị trí - 1 ancestor có
// transform sẽ tự tạo "containing block" mới cho mọi hậu duệ
// position:fixed, khiến overlay bị nhốt trong khung nhỏ của .task-card
// thay vì phủ toàn viewport (đã xác nhận bằng test thật, không phải suy
// đoán suông).
export default function ActionSheet({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  // ActionSheet có thể được lồng bên trong 1 phần tử cha có onClick riêng
  // (vd .task-card mở TaskModal khi bấm) - luôn chặn nổi bọt sự kiện ở đây,
  // không chỉ đóng sheet, để bấm ra ngoài sheet không vô tình kích hoạt
  // luôn hành động của phần tử cha bên dưới.
  const handleOverlayClick = (e) => {
    e.stopPropagation();
    onClose();
  };
  return createPortal(
    <div className="action-sheet-overlay" onClick={handleOverlayClick}>
      <div className="action-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="action-sheet-handle" />
        {title && <div className="action-sheet-title">{title}</div>}
        <div className="action-sheet-items">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
