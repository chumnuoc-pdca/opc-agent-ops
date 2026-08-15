import { Columns3, Clock, ListTodo, BookOpen, Target, Package, Wallet } from 'lucide-react';
import ModuleCaseStudyPage from '../components/ModuleCaseStudyPage';
import ModuleKpiPage from '../components/ModuleKpiPage';
import ModuleAssetsPage from '../components/ModuleAssetsPage';
import ModuleFinancePage from '../components/ModuleFinancePage';

// Single source of truth for the tabs on a module's page (Board.jsx).
export const MODULE_VIEW_TABS = [
  { id: 'board', label: 'Kanban', icon: Columns3 },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'list', label: 'Project Plan', icon: ListTodo },
  { id: 'caseStudy', label: 'Case Study', icon: BookOpen, Component: ModuleCaseStudyPage },
  { id: 'kpi', label: 'KPIs & OKRs', icon: Target, Component: ModuleKpiPage },
  { id: 'assets', label: 'Tài sản', icon: Package, Component: ModuleAssetsPage },
  { id: 'finance', label: 'Tài chính', icon: Wallet, Component: ModuleFinancePage }
];

export const GENERIC_VIEW_COMPONENTS = MODULE_VIEW_TABS
  .filter(tab => tab.Component)
  .reduce((acc, tab) => ({ ...acc, [tab.id]: tab.Component }), {});
