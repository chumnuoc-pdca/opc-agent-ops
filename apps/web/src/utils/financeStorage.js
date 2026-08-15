export const COST_CATEGORIES = [
  { id: 'production', label: 'Sản xuất nội dung', accent: 'rose' },
  { id: 'ads', label: 'Quảng cáo/Marketing', accent: 'amber' },
  { id: 'tools', label: 'Công cụ & Hạ tầng', accent: 'sky' },
  { id: 'people', label: 'Nhân sự/CTV', accent: 'violet' },
  { id: 'other', label: 'Khác', accent: 'indigo' }
];

export const buildDefaultFinance = (defaultRevenueSources = '', defaultCostStructure = '') => ({
  revenueSources: defaultRevenueSources,
  costStructure: defaultCostStructure,
  revenues: [],
  costs: [],
  updatedAt: Date.now()
});

// Same cache-in-memory + background-PUT bridge as boardStorage.js - backed by
// the server's `module_finance` table instead of localStorage.
let financeCache = {};

export const hydrateFinanceCache = async () => {
  const res = await fetch('/api/finance');
  if (!res.ok) throw new Error('Không tải được dữ liệu tài chính từ server.');
  financeCache = await res.json();
};

export const loadModuleFinance = (moduleId, defaultRevenueSources = '', defaultCostStructure = '') => {
  const parsed = financeCache[moduleId];
  if (parsed) {
    return {
      revenueSources: parsed.revenueSources !== undefined ? parsed.revenueSources : defaultRevenueSources,
      costStructure: parsed.costStructure !== undefined ? parsed.costStructure : defaultCostStructure,
      revenues: parsed.revenues || [],
      costs: parsed.costs || [],
      updatedAt: parsed.updatedAt || Date.now()
    };
  }
  return buildDefaultFinance(defaultRevenueSources, defaultCostStructure);
};

export const saveModuleFinance = (moduleId, finance) => {
  const next = { ...finance, updatedAt: Date.now() };
  financeCache[moduleId] = next;
  fetch(`/api/modules/${encodeURIComponent(moduleId)}/finance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next)
  }).catch((err) => console.error('Lưu tài chính thất bại:', err));
};

export const createEmptyRevenue = (moduleId, index) => ({
  id: `rev-${moduleId}-${index}-${Date.now()}`,
  source: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  note: ''
});

export const createEmptyCost = (moduleId, index) => ({
  id: `cost-${moduleId}-${index}-${Date.now()}`,
  item: '',
  categoryId: 'other',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  note: ''
});

const sumAmounts = (entries) => entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

export const computeFinanceTotals = (finance) => {
  const totalRevenue = sumAmounts(finance.revenues || []);
  const totalCost = sumAmounts(finance.costs || []);
  const profit = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;
  return { totalRevenue, totalCost, profit, marginPct };
};

export const formatVND = (value) => {
  if (isNaN(value) || value === null) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

// Short form for chart axis/bar labels where full "1.234.567 ₫" would overflow.
export const formatVNDCompact = (value) => {
  const v = Number(value) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')} tỷ`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')} tr`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)} k`;
  return `${v}`;
};

// Groups revenue/cost entries by "YYYY-MM" so the trend chart can show real
// month-over-month movement instead of just a single all-time total bar.
export const buildMonthlySeries = (revenues, costs) => {
  const map = new Map();
  const add = (dateStr, field, amount) => {
    const key = (dateStr || '').slice(0, 7);
    if (!key) return;
    const entry = map.get(key) || { key, revenue: 0, cost: 0 };
    entry[field] += parseFloat(amount) || 0;
    map.set(key, entry);
  };
  (revenues || []).forEach(r => add(r.date, 'revenue', r.amount));
  (costs || []).forEach(c => add(c.date, 'cost', c.amount));
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
};

export const formatMonthKey = (key) => {
  const [y, m] = key.split('-');
  return `T${Number(m)}/${y.slice(2)}`;
};
