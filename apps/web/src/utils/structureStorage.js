import { INITIAL_MODULES, flattenGroups } from '../data/initialData';

// The group/module tree is user-editable (add/rename/delete groups, add/rename/
// delete/move modules, edit module codes) and now lives in the server's
// SQLite DB (seeded from INITIAL_MODULES once via `npm run seed`), not
// localStorage. taskOperations.js's `resolveModule` calls `loadStructure()`
// *synchronously* (same as it always has), so - exactly like boardStorage.js -
// we keep that signature by maintaining an in-memory cache hydrated once via
// `hydrateStructureCache()` at app boot (see App.jsx); writes update the cache
// synchronously and fire the real PUT in the background.
let structureCache = [];

export const hydrateStructureCache = async () => {
  const res = await fetch('/api/structure');
  if (!res.ok) throw new Error('Không tải được cấu trúc dự án/module từ server.');
  structureCache = await res.json();
  return structureCache;
};

export const loadStructure = () => structureCache;

export const saveStructure = (groups) => {
  structureCache = groups;
  fetch('/api/structure', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(groups)
  }).catch((err) => console.error('Lưu cấu trúc thất bại:', err));
};

export const createGroupId = () => `group-${Date.now()}-${Math.round(Math.random() * 1000)}`;
export const createModuleId = () => `mod-${Date.now()}-${Math.round(Math.random() * 1000)}`;

export const addGroup = (groups, { title, code, accent, logoUrl, customAccentColor }) => [
  ...groups,
  {
    id: createGroupId(), title, code: code || title.charAt(0).toUpperCase(), accent,
    logoUrl: logoUrl || null, customAccentColor: customAccentColor || null,
    coverUrl: null, description: '', modules: []
  }
];

export const updateGroup = (groups, groupId, { title, code, accent, logoUrl, customAccentColor }) =>
  groups.map(g => g.id === groupId ? {
    ...g, title, code, accent,
    logoUrl: logoUrl ?? g.logoUrl ?? null,
    customAccentColor: customAccentColor ?? null
  } : g);

// Cập nhật riêng ảnh bìa/mô tả dự án (trang Tổng quan Dự án) - tách khỏi
// updateGroup vì đây là 2 field chỉ sửa ở trang đó, không đi qua GroupModal.
export const updateGroupProfile = (groups, groupId, { coverUrl, description }) =>
  groups.map(g => g.id === groupId ? {
    ...g,
    coverUrl: coverUrl !== undefined ? coverUrl : g.coverUrl,
    description: description !== undefined ? description : g.description
  } : g);

// Deletes a group and every module inside it. Returns the new groups array
// plus the list of removed module ids, so callers can also clean up their
// persisted board-data-v7-<id> entries in localStorage.
export const deleteGroup = (groups, groupId) => {
  const target = groups.find(g => g.id === groupId);
  const removedModuleIds = target ? target.modules.map(m => m.id) : [];
  return { groups: groups.filter(g => g.id !== groupId), removedModuleIds };
};

export const addModule = (groups, groupId, { code, title, description, type, details }) => {
  const newModule = {
    id: createModuleId(),
    code,
    title,
    description,
    details: details || '',
    type: type === 'operation' ? 'operation' : 'product'
  };
  return groups.map(g => g.id === groupId ? { ...g, modules: [...g.modules, newModule] } : g);
};

// Updates a module's code/title/description/type/details in place, and moves
// it to a different group if `groupId` changed.
export const updateModule = (groups, moduleId, { groupId, code, title, description, type, details }) => {
  let moved = null;
  const stripped = groups.map(g => {
    const found = g.modules.find(m => m.id === moduleId);
    if (!found) return g;
    moved = { ...found, code, title, description, type: type === 'operation' ? 'operation' : 'product', details: details ?? found.details };
    return { ...g, modules: g.modules.filter(m => m.id !== moduleId) };
  });
  if (!moved) return groups;
  return stripped.map(g => g.id === groupId ? { ...g, modules: [...g.modules, moved] } : g);
};

export const deleteModule = (groups, moduleId) =>
  groups.map(g => ({ ...g, modules: g.modules.filter(m => m.id !== moduleId) }));

export const reorderGroups = (groups, fromIndex, toIndex) => {
  const next = [...groups];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export const reorderModules = (groups, groupId, fromIndex, toIndex) =>
  groups.map(g => {
    if (g.id !== groupId) return g;
    const nextModules = [...g.modules];
    const [moved] = nextModules.splice(fromIndex, 1);
    nextModules.splice(toIndex, 0, moved);
    return { ...g, modules: nextModules };
  });

export const isCodeTaken = (groups, code, excludeModuleId) =>
  groups.some(g => g.modules.some(m => m.id !== excludeModuleId && m.code.toLowerCase() === code.toLowerCase()));

// Module info text (description/details) is seeded once into localStorage on
// first run, so a later content update to INITIAL_MODULES never reaches a
// browser that already has structure saved. This re-syncs just the
// description/details of modules that still match a known seed id (M1-M14),
// leaving code/title (in case the user renamed them), custom modules/groups
// the user added, and all task/KPI/asset/finance data completely untouched.
export const resyncModuleContent = (groups) => {
  const seedById = new Map(
    flattenGroups(INITIAL_MODULES).map(m => [m.id, { description: m.description, details: m.details }])
  );
  return groups.map(g => ({
    ...g,
    modules: g.modules.map(m => {
      const seed = seedById.get(m.id);
      return seed ? { ...m, description: seed.description, details: seed.details } : m;
    })
  }));
};
