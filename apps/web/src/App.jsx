import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MobileDrawer from './components/MobileDrawer';
import MobileBottomNav from './components/MobileBottomNav';
import Board from './components/Board';
import Overview from './components/Overview';
import ProjectOverviewPage from './components/ProjectOverviewPage';
import CalendarPage from './components/CalendarPage';
import GlobalTimelinePage from './components/GlobalTimelinePage';
import ChatPage from './components/ChatPage';
import AuditLogPage from './components/AuditLogPage';
import SettingsPage from './components/SettingsPage';
import PersonnelModal from './components/PersonnelModal';
import GlobalTooltip from './components/GlobalTooltip';
import { flattenGroups } from './data/initialData';
import {
  saveStructure, hydrateStructureCache, addGroup, updateGroup, deleteGroup,
  addModule, updateModule, deleteModule, resyncModuleContent, reorderGroups, reorderModules,
  updateGroupProfile
} from './utils/structureStorage';
import { deleteModuleBoard, hydrateBoardCache, loadAllBoards } from './utils/boardStorage';
import { reconcileTagsFromUsage } from './utils/tagStorage';
import { hydrateCaseStudyCache } from './utils/caseStudyStorage';
import { hydrateAssetsCache } from './utils/assetStorage';
import { hydrateOkrCache } from './utils/okrStorage';
import { hydrateFinanceCache } from './utils/financeStorage';
import { hydratePersonnelCache } from './utils/personnelStorage';
import { connectLiveUpdates } from './utils/liveUpdates';
import { useIsMobile } from './utils/useIsMobile';
import { onOpenMobileMenu } from './utils/mobileMenuBus';

const THEME_KEY = 'opc-theme';

// Every module page is looked up fresh from `flatModules` by the :moduleId
// route param on every render, so any structure change (rename, resync,
// live edit elsewhere) shows up immediately with no manual "sync the current
// view" bookkeeping - and an unknown/deleted id just bounces back to Overview.
function ModuleRoute({ flatModules, groups, theme, onToggleTheme, onJumpToModule }) {
  const { moduleId } = useParams();
  const module = flatModules.find(m => m.id === moduleId);
  if (!module) return <Navigate to="/" replace />;
  return (
    <Board
      module={module}
      groups={groups}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onJumpToModule={onJumpToModule}
    />
  );
}

// Same lookup-fresh-by-id pattern as ModuleRoute above - any structure
// change (rename, live edit) shows up immediately, unknown/deleted id just
// bounces back to Overview.
function ProjectRoute({
  groups, flatModules, theme, onToggleTheme, onJumpToModule, onSelectModule,
  onUpdateProfile, onUpdateGroup, onDeleteGroup, onCreateModule, onUpdateModule, onDeleteModule
}) {
  const { groupId } = useParams();
  const group = groups.find(g => g.id === groupId);
  if (!group) return <Navigate to="/" replace />;
  return (
    <ProjectOverviewPage
      group={group}
      groups={groups}
      flatModules={flatModules}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onJumpToModule={onJumpToModule}
      onSelectModule={onSelectModule}
      onUpdateProfile={onUpdateProfile}
      onUpdateGroup={onUpdateGroup}
      onDeleteGroup={onDeleteGroup}
      onCreateModule={onCreateModule}
      onUpdateModule={onUpdateModule}
      onDeleteModule={onDeleteModule}
    />
  );
}

function App() {
  const [groups, setGroups] = useState([]);
  // Guards the save-on-change effect below: without this, the initial empty
  // `groups=[]` (before the server responds) would fire a save and wipe the
  // real DB structure the instant this component mounts.
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [isPersonnelModalOpen, setIsPersonnelModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => onOpenMobileMenu(() => setIsMobileDrawerOpen(true)), []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // One-time boot sequence: load the group/module structure and every
  // module's board from the server before the app renders any page that
  // might read them synchronously (Board.jsx reads boardStorage's in-memory
  // cache via a useState initializer, so it must already be hydrated).
  useEffect(() => {
    Promise.all([
      hydrateStructureCache(),
      hydrateBoardCache(),
      hydrateCaseStudyCache(),
      hydrateAssetsCache(),
      hydrateOkrCache(),
      hydrateFinanceCache(),
      hydratePersonnelCache()
    ])
      .then(([structure]) => {
        setGroups(structure);
        setIsBootstrapped(true);
        connectLiveUpdates();

        // Tự đăng ký vào "hệ thống tag" mọi tag đang thật sự được dùng trên
        // task (nhiều module có tag riêng chưa từng qua Tag Manager) - đảm
        // bảo ô lọc tag + màu hiển thị trên thẻ luôn khớp với dữ liệu thật.
        const tagNamesInUse = loadAllBoards(flattenGroups(structure))
          .flatMap(({ board }) => Object.values(board.tasks || {}))
          .flatMap((task) => task.tags || []);
        reconcileTagsFromUsage(tagNamesInUse);
      })
      .catch((err) => setBootstrapError(err.message));
  }, []);

  useEffect(() => {
    if (!isBootstrapped) return;
    saveStructure(groups);
  }, [groups, isBootstrapped]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const flatModules = useMemo(() => flattenGroups(groups), [groups]);

  // Sidebar only needs to know *which* page is active for highlighting -
  // derive that shape straight from the URL instead of tracking it separately.
  const moduleRouteMatch = location.pathname.match(/^\/modules\/([^/]+)/);
  const projectRouteMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const view = moduleRouteMatch
    ? { type: 'module', module: { id: decodeURIComponent(moduleRouteMatch[1]) } }
    : projectRouteMatch
    ? { type: 'project', group: { id: decodeURIComponent(projectRouteMatch[1]) } }
    : location.pathname === '/calendar' ? { type: 'calendar' }
    : location.pathname === '/timeline' ? { type: 'timeline' }
    : location.pathname === '/chat' ? { type: 'chat' }
    : location.pathname === '/audit-log' ? { type: 'auditLog' }
    : location.pathname === '/settings' ? { type: 'settings' }
    : { type: 'overview' };

  const selectModule = (module) => navigate(`/modules/${encodeURIComponent(module.id)}`);
  const selectProject = (group) => navigate(`/projects/${encodeURIComponent(group.id)}`);
  const selectOverview = () => navigate('/');
  const selectCalendar = () => navigate('/calendar');
  const selectTimeline = () => navigate('/timeline');
  const selectChat = () => navigate('/chat');
  const selectAuditLog = () => navigate('/audit-log');
  const selectSettings = () => navigate('/settings');

  // ---- Group CRUD ----
  const handleCreateGroup = (data) => setGroups(prev => addGroup(prev, data));
  const handleUpdateGroup = (groupId, data) => setGroups(prev => updateGroup(prev, groupId, data));
  const handleDeleteGroup = (groupId) => {
    const { groups: next, removedModuleIds } = deleteGroup(groups, groupId);
    removedModuleIds.forEach(deleteModuleBoard);
    setGroups(next);
    if (view.type === 'module' && removedModuleIds.includes(view.module.id)) {
      navigate('/');
    }
    if (view.type === 'project' && view.group.id === groupId) {
      navigate('/');
    }
  };

  // ---- Module CRUD ----
  const handleCreateModule = (groupId, data) => {
    setGroups(prev => addModule(prev, groupId, data));
  };
  const handleUpdateModule = (moduleId, data) => {
    setGroups(prev => updateModule(prev, moduleId, data));
  };
  const handleDeleteModule = (moduleId) => {
    deleteModuleBoard(moduleId);
    setGroups(prev => deleteModule(prev, moduleId));
    if (view.type === 'module' && view.module.id === moduleId) {
      navigate('/');
    }
  };

  const handleResyncContent = () => {
    setGroups(prev => resyncModuleContent(prev));
  };

  // ---- Sidebar drag-to-reorder ----
  const handleReorderGroups = (fromIndex, toIndex) => {
    setGroups(prev => reorderGroups(prev, fromIndex, toIndex));
  };
  const handleReorderModules = (groupId, fromIndex, toIndex) => {
    setGroups(prev => reorderModules(prev, groupId, fromIndex, toIndex));
  };

  // ---- Trang Tổng quan Dự án: sửa ảnh bìa/mô tả ----
  const handleUpdateGroupProfile = (groupId, data) => {
    setGroups(prev => updateGroupProfile(prev, groupId, data));
  };

  // ---- Copy module (kèm tasks/checklist + Case Study) sang dự án khác ----
  const handleCopyModule = async (moduleId, { targetGroupId, code, title }) => {
    const res = await fetch(`/api/modules/${encodeURIComponent(moduleId)}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetGroupId, code, title })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Sao chép module thất bại.');
    }
    const structure = await res.json();
    setGroups(structure);
  };

  if (bootstrapError) {
    return (
      <div className="app-boot-error">
        Không kết nối được tới server ({bootstrapError}). Kiểm tra backend đang chạy ở port 4001.
      </div>
    );
  }
  if (!isBootstrapped) {
    return <div className="app-boot-loading">Đang tải dữ liệu...</div>;
  }

  // Trên mobile, mọi hành động ĐIỀU HƯỚNG gọi từ trong Sidebar (đang nằm
  // trong drawer) phải tự đóng drawer luôn - CRUD (tạo/sửa/xoá dự án...)
  // thì không cần vì nó mở modal riêng đè lên drawer, không cần đóng drawer.
  const withDrawerClose = (fn) => (...args) => {
    fn(...args);
    setIsMobileDrawerOpen(false);
  };

  const sidebarElement = (
    <Sidebar
      groups={groups}
      flatModules={flatModules}
      view={view}
      onSelectModule={withDrawerClose(selectModule)}
      onSelectProject={withDrawerClose(selectProject)}
      onSelectOverview={withDrawerClose(selectOverview)}
      onSelectCalendar={withDrawerClose(selectCalendar)}
      onSelectTimeline={withDrawerClose(selectTimeline)}
      onSelectChat={withDrawerClose(selectChat)}
      onSelectAuditLog={withDrawerClose(selectAuditLog)}
      onSelectSettings={withDrawerClose(selectSettings)}
      onOpenPersonnel={withDrawerClose(() => setIsPersonnelModalOpen(true))}
      onCreateGroup={handleCreateGroup}
      onUpdateGroup={handleUpdateGroup}
      onDeleteGroup={handleDeleteGroup}
      onCreateModule={handleCreateModule}
      onUpdateModule={handleUpdateModule}
      onDeleteModule={handleDeleteModule}
      onReorderGroups={handleReorderGroups}
      onReorderModules={handleReorderModules}
      onCopyModule={handleCopyModule}
    />
  );

  return (
    <div className="app-container">
      {isMobile ? (
        <MobileDrawer isOpen={isMobileDrawerOpen} onClose={() => setIsMobileDrawerOpen(false)}>
          {sidebarElement}
        </MobileDrawer>
      ) : (
        sidebarElement
      )}
      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <Overview
                theme={theme}
                onToggleTheme={toggleTheme}
                onSelectModule={selectModule}
                onSelectGroup={(id) => selectProject({ id })}
                onUpdateGroup={handleUpdateGroup}
                groups={groups}
                flatModules={flatModules}
              />
            }
          />
          <Route
            path="/modules/:moduleId"
            element={
              <ModuleRoute
                flatModules={flatModules}
                groups={groups}
                theme={theme}
                onToggleTheme={toggleTheme}
                onJumpToModule={selectModule}
              />
            }
          />
          <Route
            path="/projects/:groupId"
            element={
              <ProjectRoute
                groups={groups}
                flatModules={flatModules}
                theme={theme}
                onToggleTheme={toggleTheme}
                onJumpToModule={selectModule}
                onSelectModule={selectModule}
                onUpdateProfile={handleUpdateGroupProfile}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
                onCreateModule={handleCreateModule}
                onUpdateModule={handleUpdateModule}
                onDeleteModule={handleDeleteModule}
              />
            }
          />
          <Route
            path="/calendar"
            element={
              <CalendarPage
                theme={theme}
                onToggleTheme={toggleTheme}
                onJumpToModule={selectModule}
                flatModules={flatModules}
              />
            }
          />
          <Route
            path="/timeline"
            element={
              <GlobalTimelinePage
                theme={theme}
                onToggleTheme={toggleTheme}
                onJumpToModule={selectModule}
                flatModules={flatModules}
              />
            }
          />
          <Route
            path="/chat"
            element={
              <ChatPage
                theme={theme}
                onToggleTheme={toggleTheme}
                flatModules={flatModules}
                onOpenSettings={selectSettings}
              />
            }
          />
          <Route
            path="/audit-log"
            element={
              <AuditLogPage
                theme={theme}
                onToggleTheme={toggleTheme}
                flatModules={flatModules}
                onJumpToModule={selectModule}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsPage
                theme={theme}
                onToggleTheme={toggleTheme}
                onJumpToModule={selectModule}
                flatModules={flatModules}
                onResyncContent={handleResyncContent}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {isMobile && (
        <MobileBottomNav
          view={view}
          onSelectOverview={selectOverview}
          onSelectCalendar={selectCalendar}
          onSelectChat={selectChat}
        />
      )}

      <GlobalTooltip />

      <PersonnelModal
        isOpen={isPersonnelModalOpen}
        onClose={() => setIsPersonnelModalOpen(false)}
        groups={groups}
      />
    </div>
  );
}

export default App;
