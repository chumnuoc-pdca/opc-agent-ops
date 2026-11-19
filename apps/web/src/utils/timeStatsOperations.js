// Phase 16: client cho thống kê thời gian (đọc-only).
export const fetchTimeStats = ({ from, to, groupId }) => {
  const params = new URLSearchParams({ from, to, ...(groupId ? { groupId } : {}) });
  return fetch(`/api/time-stats?${params.toString()}`).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Yêu cầu thất bại (mã ${res.status}).`);
    }
    return res.json();
  });
};
