// Tries to pull a starting target number + unit out of a KPI phrase, e.g.
// "Tỷ lệ hoàn thành học tập (tối thiểu 80%)" -> { value: '80', unit: '%' }.
// Falls back to an empty target when the phrase carries no explicit number -
// the user fills that in themselves, which is the whole point of this page.
export const guessTargetFromText = (text) => {
  const parenMatch = text.match(/\(([^)]+)\)/);
  const source = parenMatch ? parenMatch[1] : text;
  const numMatch = source.match(/(\d+(?:[.,]\d+)?)\s*(%|VNĐ|đ|USD|\$|k|tr|M)?/i);
  if (!numMatch) return { value: '', unit: '' };
  return { value: numMatch[1].replace(',', '.'), unit: numMatch[2] || '' };
};

const buildKeyResult = (moduleId, index, text = '') => {
  const guess = guessTargetFromText(text);
  return {
    id: `kr-${moduleId}-${index}-${Date.now()}`,
    text,
    unit: guess.unit,
    targetValue: guess.value,
    currentValue: '',
    previousValue: '',
    note: '',
    updatedAt: Date.now()
  };
};

const buildObjective = (moduleId, index, text = '', keyResultTexts = []) => ({
  id: `obj-${moduleId}-${index}-${Date.now()}`,
  text,
  keyResults: keyResultTexts.map((t, i) => buildKeyResult(moduleId, `${index}-${i}`, t))
});

// The first Objective seeds from the module's own one-line description (already
// written, already goal-shaped) with Key Results from the module's own parsed
// KPI list - but a module/quarter can have several Objectives, each with its
// own Key Results, so this is just a starting point the user builds on.
export const buildDefaultOkr = (module, kpiList) => ({
  objectives: [buildObjective(module.id, 0, module.description || module.title, kpiList)],
  updatedAt: Date.now()
});

// Older saved OKRs used a single flat {objective, keyResults} shape (before
// multi-Objective support existed) - migrate those into the new
// {objectives: [...]} shape instead of silently dropping real user data.
const migrateOkrShape = (saved, module) => {
  if (Array.isArray(saved.objectives)) return saved;
  if (typeof saved.objective === 'string') {
    return {
      objectives: [{
        id: `obj-${module.id}-0-${Date.now()}`,
        text: saved.objective,
        keyResults: saved.keyResults || []
      }],
      updatedAt: saved.updatedAt || Date.now()
    };
  }
  return null;
};

// Same cache-in-memory + background-PUT bridge as boardStorage.js - backed by
// the server's `module_okr` table instead of localStorage.
let okrCache = {};

export const hydrateOkrCache = async () => {
  const res = await fetch('/api/okr');
  if (!res.ok) throw new Error('Không tải được OKR từ server.');
  okrCache = await res.json();
};

export const loadModuleOkr = (module, kpiList) => {
  if (okrCache[module.id]) {
    const migrated = migrateOkrShape(okrCache[module.id], module);
    if (migrated) return migrated;
  }
  return buildDefaultOkr(module, kpiList);
};

export const saveModuleOkr = (moduleId, okr) => {
  const next = { ...okr, updatedAt: Date.now() };
  okrCache[moduleId] = next;
  fetch(`/api/modules/${encodeURIComponent(moduleId)}/okr`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next)
  }).catch((err) => console.error('Lưu OKR thất bại:', err));
};

export const createEmptyKeyResult = (moduleId, index) => buildKeyResult(moduleId, index);
export const createEmptyObjective = (moduleId, index) => buildObjective(moduleId, index);

// A Key Result's progress is derived from currentValue/targetValue whenever
// both are real numbers; otherwise it's simply "chưa có số liệu" (0), since
// there is nothing to compute a percentage from.
export const computeKrProgress = (kr) => {
  const target = parseFloat(kr.targetValue);
  const current = parseFloat(kr.currentValue);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
};

export const krTrend = (kr) => {
  const current = parseFloat(kr.currentValue);
  const previous = parseFloat(kr.previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current === previous) return null;
  return current > previous ? 'up' : 'down';
};
