// Cùng kỹ thuật custom-event bus như dataBus.js - dùng để mở drawer điều
// hướng mobile từ nút hamburger trong HeaderActions.jsx (render ở MỌI
// trang) mà không phải xuyên prop `onOpenMobileMenu` qua 8 trang + App.jsx.
const EVENT = 'opc-open-mobile-menu';

export const emitOpenMobileMenu = () => {
  window.dispatchEvent(new CustomEvent(EVENT));
};

export const onOpenMobileMenu = (handler) => {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};
