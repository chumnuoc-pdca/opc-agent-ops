import { useState, useEffect } from 'react';

// Ngưỡng dùng chung cho MỌI @media(max-width: ...) mới thêm cho bản mobile
// - giữ đúng 1 con số ở cả JS lẫn CSS để tránh lệch lúc JS đổi cấu trúc DOM
// (drawer/bottom-nav/Kanban 1-cột) so với lúc CSS đổi style.
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
