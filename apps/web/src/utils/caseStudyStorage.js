import { INITIAL_MODULES } from '../data/initialData';

const findRawModule = (module) => {
  for (const group of INITIAL_MODULES) {
    const found = group.modules.find(m => m.id === module.id || m.code === module.code);
    if (found) return found;
  }
  return null;
};

// Seeds from the module's curated case studies (INITIAL_MODULES) - the user
// edits/adds/deletes from there. A module with no seed case studies just
// starts with an empty list.
const buildDefaultCaseStudies = (module) => {
  const rawModule = findRawModule(module);
  const seed = module.caseStudies || rawModule?.caseStudies || [];
  return { items: seed.map(cs => ({ ...cs })), updatedAt: Date.now() };
};

// Same cache-in-memory + background-PUT bridge as boardStorage.js/
// structureStorage.js: loadModuleCaseStudies/saveModuleCaseStudies keep their
// original synchronous signatures (ModuleCaseStudyPage.jsx's useState
// initializer calls them directly), backed by the server's
// `module_case_studies` table instead of localStorage. `context`/`rule`/
// `memory`/`skill` are the fields Phase 1's agent system-prompt builder reads
// (see apps/server/src/orchestrator/systemPrompt.js) - `results` etc. stay as
// the human-readable narrative/metrics, `rule`/`memory`/`skill` are the
// direct machine-consumable input an admin curates for the agent.
let caseStudyCache = {};

export const hydrateCaseStudyCache = async () => {
  const res = await fetch('/api/case-studies');
  if (!res.ok) throw new Error('Không tải được case study từ server.');
  caseStudyCache = await res.json();
};

export const loadModuleCaseStudies = (module) => {
  if (caseStudyCache[module.id]) return caseStudyCache[module.id];
  return buildDefaultCaseStudies(module);
};

export const saveModuleCaseStudies = (moduleId, data) => {
  const next = { ...data, updatedAt: Date.now() };
  caseStudyCache[moduleId] = next;
  fetch(`/api/modules/${encodeURIComponent(moduleId)}/case-studies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next)
  }).catch((err) => console.error('Lưu case study thất bại:', err));
};

export const createEmptyCaseStudy = () => ({
  title: '',
  subtitle: '',
  context: '',
  goal: '',
  execution: '',
  results: '',
  tactics: '',
  replication: '',
  // Agent input - đây là phần admin nạp trực tiếp cho agent dùng khi lập kế hoạch.
  rule: '',
  memory: '',
  skill: ''
});
