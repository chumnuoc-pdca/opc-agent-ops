// Phase 12: client cho time tracking. Không đi qua pattern "optimistic cache
// rồi sync nền" của taskOperations.js vì time_entries không nằm trong board
// JSON - gọi thẳng server rồi merge phần task trả về (actualMinutes) vào
// boardCache qua applyServerBoard, đúng cách taskOperations.js vẫn dùng để
// ghi cache mà không cần thêm 1 lần fetch board riêng.
import { loadModuleBoard, applyServerBoard } from './boardStorage';
import { emitDataChanged } from './dataBus';
import { getPersonnel } from './personnelStorage';

const ACTIVE_PERSONNEL_KEY = 'opc-active-personnel-id';

export const getActivePersonnelId = () => localStorage.getItem(ACTIVE_PERSONNEL_KEY) || '';

export const setActivePersonnelId = (id) => {
  if (id) localStorage.setItem(ACTIVE_PERSONNEL_KEY, id);
  else localStorage.removeItem(ACTIVE_PERSONNEL_KEY);
};

// Nếu personnel đã chọn trước đó không còn tồn tại (bị xoá) thì coi như
// chưa chọn - tránh gửi personnelId "ma" lên server.
export const resolveActivePersonnel = () => {
  const id = getActivePersonnelId();
  if (!id) return null;
  const humans = getPersonnel().filter(p => p.type === 'human');
  return humans.find(p => p.id === id) || null;
};

export class TimeTrackingError extends Error {}

const jsonFetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TimeTrackingError(body.error || `Yêu cầu thất bại (mã ${res.status}).`);
    }
    return res.json();
  });

// Ghi phần task trả về từ server (actualMinutes vừa đổi) vào board cache
// đúng module của nó, rồi phát sự kiện để Board.jsx/TaskModal cập nhật ngay
// - không cần đợi vòng poll/SSE tiếp theo.
const patchTaskInCache = (task) => {
  if (!task) return;
  const board = loadModuleBoard({ id: task.moduleId });
  if (!board || !board.tasks[task.id]) return;
  const nextBoard = { ...board, tasks: { ...board.tasks, [task.id]: { ...board.tasks[task.id], ...task } } };
  applyServerBoard(task.moduleId, nextBoard);
  emitDataChanged(task.moduleId);
};

export const startTimer = async (taskId, personnelId) => {
  const result = await jsonFetch(`/api/tasks/${encodeURIComponent(taskId)}/timer/start`, {
    method: 'POST',
    body: JSON.stringify({ personnelId })
  });
  patchTaskInCache(result.task);
  patchTaskInCache(result.previousTask);
  return result;
};

export const stopTimer = async (personnelId) => {
  const result = await jsonFetch('/api/timer/stop', {
    method: 'POST',
    body: JSON.stringify({ personnelId })
  });
  patchTaskInCache(result.task);
  return result;
};

export const fetchActiveEntry = (personnelId) =>
  jsonFetch(`/api/personnel/${encodeURIComponent(personnelId)}/active-entry`, { method: 'GET' });

export const fetchTaskTimeEntries = (taskId) =>
  jsonFetch(`/api/tasks/${encodeURIComponent(taskId)}/time-entries`, { method: 'GET' });

// Hiện "1h 05p" / "12p" - dùng cho badge trên thẻ và section trong TaskModal.
export const formatMinutes = (totalMinutes) => {
  const mins = Math.max(0, Math.round(totalMinutes || 0));
  if (mins === 0) return '0p';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}p`;
};

// Hiện đồng hồ đếm giờ:phút:giây cho thanh timer đang chạy.
export const formatElapsed = (startedAt) => {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
