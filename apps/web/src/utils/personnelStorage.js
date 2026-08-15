import { emitDataChanged } from './dataBus';

const STORAGE_KEY = 'opc_personnel_v1';

export const DEFAULT_PERSONNEL = [
  { id: 'p-h1', type: 'human', name: 'Linh - Content Lead', role: 'Content Strategy Lead', email: 'linh@company.com', avatarUrl: null, skills: 'Kịch bản TikTok, AI Short Video, Social Commerce', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-h2', type: 'human', name: 'Trang - Scriptwriter', role: 'Senior Scriptwriter', email: 'trang@company.com', avatarUrl: null, skills: 'Kịch bản Drama, Copywriting bán hàng', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-h3', type: 'human', name: 'Minh - Fullstack Developer', role: 'Lead Software Engineer', email: 'minh@company.com', avatarUrl: null, skills: 'Vibe Coding, Web App, Fastify, React', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-h4', type: 'human', name: 'Project Lead', role: 'Quản lý Dự án', email: 'lead@company.com', avatarUrl: null, skills: 'Điều phối dự án, Quản lý tiến độ KPI/OKR', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-a1', type: 'agent', name: 'Alex Research', role: 'Research & Insights Agent', email: null, avatarUrl: null, skills: 'Nghiên cứu thị trường, Phân tích đối thủ, Tổng hợp Use Case', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-a2', type: 'agent', name: 'Kai Delivery', role: 'Automation & SOP Execution Agent', email: null, avatarUrl: null, skills: 'Tự động hoá quy trình, Kiểm thử SOP, Thực thi tác vụ', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-a3', type: 'agent', name: 'Nova Copywriter', role: 'AI Content Copywriter', email: null, avatarUrl: null, skills: 'Viết bài chuẩn SEO, Prompt kịch bản video ngắn, Caption bán hàng', projectIds: [], status: 'active', createdAt: 1785000000000 },
  { id: 'p-a4', type: 'agent', name: 'Maya Design', role: 'AI Visual & Graphic Agent', email: null, avatarUrl: null, skills: 'Thiết kế banner, Gợi ý concept hình ảnh AI, Layout UI/UX', projectIds: [], status: 'active', createdAt: 1785000000000 }
];

let personnelCache = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Lỗi đọc local storage personnel:', e);
  }
  return DEFAULT_PERSONNEL;
})();

const saveCache = (list) => {
  personnelCache = list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Lỗi ghi local storage personnel:', e);
  }
  emitDataChanged('personnel');
};

export const hydratePersonnelCache = async () => {
  try {
    const res = await fetch('/api/personnel');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        saveCache(data);
        return data;
      }
    }
  } catch (e) {
    console.warn('Không tải được personnel từ server API, dùng cache:', e);
  }
  return personnelCache;
};

export const getPersonnel = () => personnelCache;

export const getPersonnelForProject = (projectId, type = null) => {
  return personnelCache.filter(p => {
    if (p.status === 'inactive') return false;
    if (type && p.type !== type) return false;
    if (!projectId) return true;
    if (!p.projectIds || p.projectIds.length === 0) return true; // Empty array means assigned to ALL projects
    return p.projectIds.includes(projectId);
  });
};

export const addPersonnel = (personData) => {
  const type = personData.type === 'agent' ? 'agent' : 'human';
  const id = `p-${type === 'agent' ? 'a' : 'h'}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const newItem = {
    id,
    type,
    name: (personData.name || '').trim(),
    role: (personData.role || '').trim(),
    email: personData.email ? personData.email.trim() : null,
    avatarUrl: personData.avatarUrl || null,
    skills: (personData.skills || '').trim(),
    projectIds: Array.isArray(personData.projectIds) ? personData.projectIds : [],
    status: personData.status || 'active',
    createdAt: Date.now()
  };

  const nextList = [newItem, ...personnelCache];
  saveCache(nextList);

  fetch('/api/personnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newItem)
  }).catch(err => console.error('Lỗi tạo nhân sự trên server:', err));

  return newItem;
};

export const updatePersonnel = (id, patch) => {
  const existingIndex = personnelCache.findIndex(p => p.id === id);
  if (existingIndex === -1) return null;

  const existing = personnelCache[existingIndex];
  const updated = { ...existing, ...patch };
  const nextList = [...personnelCache];
  nextList[existingIndex] = updated;
  saveCache(nextList);

  fetch(`/api/personnel/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }).catch(err => console.error('Lỗi cập nhật nhân sự trên server:', err));

  return updated;
};

export const deletePersonnel = (id) => {
  const nextList = personnelCache.filter(p => p.id !== id);
  saveCache(nextList);

  fetch(`/api/personnel/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }).catch(err => console.error('Lỗi xoá nhân sự trên server:', err));

  return true;
};

export const toggleProjectAssignment = (personnelId, projectId) => {
  const person = personnelCache.find(p => p.id === personnelId);
  if (!person) return null;

  let nextProjects = Array.isArray(person.projectIds) ? [...person.projectIds] : [];
  if (nextProjects.includes(projectId)) {
    nextProjects = nextProjects.filter(id => id !== projectId);
  } else {
    nextProjects.push(projectId);
  }

  return updatePersonnel(personnelId, { projectIds: nextProjects });
};
