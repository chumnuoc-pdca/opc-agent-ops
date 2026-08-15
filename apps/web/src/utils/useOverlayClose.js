import { useRef } from 'react';

// Đóng modal khi bấm ra ngoài overlay - nhưng CHỈ khi đã có 2 lần click
// "thật" liên tiếp ra ngoài (mousedown VÀ mouseup đều đúng trên overlay,
// không phải bị kéo lan từ thao tác bôi đen chữ bên trong content ra ngoài
// rồi thả chuột). Click ngoài lần 1 chỉ tính, chưa đóng; lần 2 mới đóng -
// tránh mất dữ liệu đang gõ dở chỉ vì bôi đen chữ quá tay.
export function useOverlayClose(onClose) {
  const mouseDownOnOverlay = useRef(false);
  const outsideClickCount = useRef(0);

  const onMouseDown = (e) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  };

  const onMouseUp = (e) => {
    const isRealOutsideClick = mouseDownOnOverlay.current && e.target === e.currentTarget;
    mouseDownOnOverlay.current = false;

    if (!isRealOutsideClick) {
      outsideClickCount.current = 0;
      return;
    }

    outsideClickCount.current += 1;
    if (outsideClickCount.current >= 2) {
      outsideClickCount.current = 0;
      onClose();
    }
  };

  return { onMouseDown, onMouseUp };
}
