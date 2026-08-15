import { PROJECT_LOGIC } from '../data/initialData';

// Fixed category set requested for every module's asset inventory - each
// carries its own accent so the page reads as color-coded like the rest of
// the app, without introducing a whole new palette.
export const ASSET_CATEGORIES = [
  { id: 'code', label: 'Code', accent: 'violet' },
  { id: 'media', label: 'Media', accent: 'rose' },
  { id: 'community', label: 'Cộng đồng', accent: 'sky' },
  { id: 'platform', label: 'Nền tảng', accent: 'indigo' },
  { id: 'traffic', label: 'Traffic', accent: 'amber' },
  { id: 'channel', label: 'Kênh', accent: 'emerald' }
];

const CATEGORY_KEYWORDS = {
  code: ['code', 'workflow', 'agent', 'n8n', 'api', 'schema', 'automation', 'tool', 'repo'],
  media: ['content', 'video', 'visual', 'script', 'hook', 'concept', 'template', 'bài', 'highlight', 'transcript', 'character', 'design'],
  community: ['cộng đồng', 'community', 'member', 'thành viên', 'onboarding', 'live', 'q&a'],
  platform: ['dashboard', 'landing', 'website', 'checkout', 'crm', 'hosting', 'cms', 'app', 'nền tảng', 'platform'],
  traffic: ['traffic', 'lead', 'seo', 'email', 'newsletter', 'referral', 'affiliate'],
  channel: ['kênh', 'channel', 'fanpage', 'tiktok', 'facebook', 'youtube', 'social']
};

export const guessCategoryForText = (text) => {
  const lower = text.toLowerCase();
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return catId;
  }
  return 'platform';
};

const buildAsset = (moduleId, index, name = '', categoryId = 'platform') => ({
  id: `asset-${moduleId}-${index}-${Date.now()}`,
  name,
  categoryId,
  metric: '',
  link: '',
  status: 'planned', // 'planned' | 'inprogress' | 'done'
  note: '',
  documents: [],
  updatedAt: Date.now()
});

// Seeds from this module's own curated asset list (PROJECT_LOGIC), auto-sorted
// into the closest-matching category by keyword - the user re-files/edits/adds
// from there. No fabricated data: a module with no PROJECT_LOGIC entry just
// starts empty.
export const buildDefaultAssets = (module) => {
  const seedTexts = PROJECT_LOGIC[module.id]?.assets || [];
  return {
    items: seedTexts.map((text, i) => buildAsset(module.id, i, text, guessCategoryForText(text))),
    updatedAt: Date.now()
  };
};

// Same cache-in-memory + background-PUT bridge as boardStorage.js (see there
// for why the signatures stay synchronous) - backed by the server's
// `module_assets` table instead of localStorage.
let assetsCache = {};

export const hydrateAssetsCache = async () => {
  const res = await fetch('/api/assets');
  if (!res.ok) throw new Error('Không tải được tài sản từ server.');
  assetsCache = await res.json();
};

export const loadModuleAssets = (module) => {
  if (assetsCache[module.id]) return assetsCache[module.id];
  return buildDefaultAssets(module);
};

export const saveModuleAssets = (moduleId, data) => {
  const next = { ...data, updatedAt: Date.now() };
  assetsCache[moduleId] = next;
  fetch(`/api/modules/${encodeURIComponent(moduleId)}/assets`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next)
  }).catch((err) => console.error('Lưu tài sản thất bại:', err));
};

export const createEmptyAsset = (moduleId, categoryId, index) => buildAsset(moduleId, index, '', categoryId);
