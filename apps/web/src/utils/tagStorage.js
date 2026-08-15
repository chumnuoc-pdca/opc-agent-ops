const TAGS_STORAGE_KEY = 'opc-business-tags';

export const DEFAULT_TAGS = [
  { id: 'tag-biz', name: 'Kinh doanh', color: 'amber' },
  { id: 'tag-mkt', name: 'Tiếp thị', color: 'rose' },
  { id: 'tag-doc', name: 'Tài liệu', color: 'indigo' },
  { id: 'tag-fin', name: 'Tài chính', color: 'emerald' },
  { id: 'tag-ops', name: 'Vận hành', color: 'sky' },
  { id: 'tag-dev', name: 'Kỹ thuật', color: 'purple' },
  { id: 'tag-res', name: 'Nghiên cứu', color: 'teal' },
  { id: 'tag-hr', name: 'Nhân sự', color: 'violet' }
];

export const TAG_COLORS = [
  { id: 'amber', label: 'Vàng / Cam', hex: '#f59e0b' },
  { id: 'rose', label: 'Hồng / Đỏ', hex: '#f43f5e' },
  { id: 'indigo', label: 'Xanh lam', hex: '#6366f1' },
  { id: 'emerald', label: 'Xanh lá', hex: '#10b981' },
  { id: 'sky', label: 'Xanh da trời', hex: '#0ea5e9' },
  { id: 'purple', label: 'Tím', hex: '#a855f7' },
  { id: 'teal', label: 'Xanh ngọc', hex: '#14b8a6' },
  { id: 'violet', label: 'Tím sẫm', hex: '#8b5cf6' }
];

export function getTags() {
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    if (!raw) return DEFAULT_TAGS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TAGS;
  } catch {
    return DEFAULT_TAGS;
  }
}

export function saveTags(tags) {
  try {
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags));
  } catch (err) {
    console.error('Lưu danh sách tag thất bại:', err);
  }
}

export function addTag({ name, color }) {
  const tags = getTags();
  const newTag = {
    id: `tag-${Date.now()}`,
    name: name.trim(),
    color: color || 'indigo'
  };
  const updated = [...tags, newTag];
  saveTags(updated);
  return updated;
}

export function updateTag(id, { name, color }) {
  const tags = getTags();
  const updated = tags.map(t => (t.id === id ? { ...t, name: name.trim(), color } : t));
  saveTags(updated);
  return updated;
}

export function deleteTag(id) {
  const tags = getTags();
  const updated = tags.filter(t => t.id !== id);
  saveTags(updated);
  return updated;
}

export function getTagByNameOrId(tags, identifier) {
  if (!identifier) return null;
  return tags.find(t => t.id === identifier || t.name.toLowerCase() === identifier.toLowerCase());
}

// Nhiều module có tag riêng gắn thẳng vào task.tags (vd MFC1: "MFC-Market",
// "SaleKit", "Proposal"...) nhưng chưa từng được thêm vào "hệ thống tag"
// (registry dùng chung cho ô lọc tag trên board + Tag Manager) - khiến
// những tag đó không lọc được và luôn hiện màu mặc định (indigo) trên thẻ,
// khác hẳn với tag thật đang dùng. Gọi hàm này 1 lần lúc khởi động (sau khi
// đã tải xong mọi board) để tự đăng ký bổ sung, gán màu xoay vòng theo
// TAG_COLORS - không đụng tới tag đã có sẵn.
export function reconcileTagsFromUsage(tagNamesInUse) {
  const tags = getTags();
  const known = new Set(tags.map(t => t.name.toLowerCase()));
  const missing = [...new Set(tagNamesInUse)].filter(name => name && !known.has(name.toLowerCase()));
  if (missing.length === 0) return tags;

  const newTags = missing.map((name, i) => ({
    id: `tag-auto-${Date.now()}-${i}`,
    name,
    color: TAG_COLORS[(tags.length + i) % TAG_COLORS.length].id
  }));
  const updated = [...tags, ...newTags];
  saveTags(updated);
  return updated;
}
