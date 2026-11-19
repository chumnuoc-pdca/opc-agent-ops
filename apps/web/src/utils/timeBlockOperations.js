// Phase 15: client cho time_blocks - "khoảng dự kiến làm việc" kéo-thả trên
// lưới giờ, hoàn toàn tách biệt task.dueDate. CRUD đơn giản qua REST, không
// cần pattern optimistic-cache của taskOperations.js (time_blocks không nằm
// trong board JSON).
export class TimeBlockOpError extends Error {}

const jsonFetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TimeBlockOpError(body.error || `Yêu cầu thất bại (mã ${res.status}).`);
    }
    return res.json();
  });

export const listTimeBlocksForDate = (dateISO) =>
  jsonFetch(`/api/time-blocks?date=${encodeURIComponent(dateISO)}`, { method: 'GET' });

export const createTimeBlock = (taskId, startsAt, endsAt) =>
  jsonFetch('/api/time-blocks', { method: 'POST', body: JSON.stringify({ taskId, startsAt, endsAt }) });

export const updateTimeBlock = (id, patch) =>
  jsonFetch(`/api/time-blocks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteTimeBlock = (id) =>
  jsonFetch(`/api/time-blocks/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' });
