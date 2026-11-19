// Phase 13: client cho ghi chú/kho tri thức - CRUD đơn giản, không cần
// pattern "optimistic cache" của taskOperations.js (notes không nằm trong
// board JSON, không có worker nền nào tranh ghi cùng lúc).
export class NoteOpError extends Error {}

const jsonFetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new NoteOpError(body.error || `Yêu cầu thất bại (mã ${res.status}).`);
    }
    return res.json();
  });

export const listNotes = (scopeType, scopeId) => {
  const params = new URLSearchParams({ scopeType, ...(scopeId ? { scopeId } : {}) });
  return jsonFetch(`/api/notes?${params.toString()}`, { method: 'GET' });
};

export const createNote = (scopeType, scopeId, { title, content, authorPersonnelId }) =>
  jsonFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ scopeType, scopeId, title, content, authorPersonnelId })
  });

export const updateNote = (noteId, { title, content }) =>
  jsonFetch(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title, content })
  });

// Gửi kèm body rỗng '{}' - jsonFetch luôn khai Content-Type: application/json,
// nếu để body trống hẳn thì Fastify cố parse JSON rỗng và trả 400 (phát hiện
// qua kiểm thử Playwright thật: request DELETE không có body thật sự lỗi).
export const deleteNote = (noteId) =>
  jsonFetch(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE', body: '{}' });
