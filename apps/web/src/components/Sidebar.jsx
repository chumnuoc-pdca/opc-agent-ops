import React, { useState, useMemo, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  ChevronDown, ChevronRight, LayoutDashboard, Boxes, Search, X,
  CalendarDays, GanttChartSquare, Sparkles, Settings, Plus, MoreHorizontal, Pencil, ScrollText, Layers, FolderKanban, GripVertical, Copy, Users
} from 'lucide-react';
import { loadAllBoards } from '../utils/boardStorage';
import GroupModal from './GroupModal';
import ModuleModal from './ModuleModal';
import CopyModuleModal from './CopyModuleModal';
import { ModuleTypeIcon } from './ModuleTypeBadge';

const MODULE_DND_TYPE_PREFIX = 'SIDEBAR-MODULES-';

export default function Sidebar({
  groups, flatModules, view,
  onSelectModule, onSelectProject, onSelectOverview, onSelectCalendar, onSelectTimeline, onSelectChat, onSelectAuditLog, onSelectSettings, onOpenPersonnel,
  onCreateGroup, onUpdateGroup, onDeleteGroup,
  onCreateModule, onUpdateModule, onDeleteModule,
  onReorderGroups, onReorderModules, onCopyModule
}) {
  const [expandedGroups, setExpandedGroups] = useState(() => groups.map(g => g.id));
  const [query, setQuery] = useState('');
  const [openRowMenu, setOpenRowMenu] = useState(null); // `group-<id>` | `module-<id>`
  const [groupModal, setGroupModal] = useState(null); // { mode, group }
  const [moduleModal, setModuleModal] = useState(null); // { mode, module, defaultGroupId }
  const [copyModal, setCopyModal] = useState(null); // { module, sourceGroupId }

  // Close the sidebar row "..." menu when clicking anywhere outside of it
  useEffect(() => {
    if (!openRowMenu) return;
    const handler = (e) => {
      if (!e.target.closest('.sidebar-row-actions')) {
        setOpenRowMenu(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    document.addEventListener('click', handler);
    return () => {
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('click', handler);
    };
  }, [openRowMenu]);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const trimmed = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!trimmed) return null;
    const modules = flatModules.filter(m =>
      m.title.toLowerCase().includes(trimmed) || m.code.toLowerCase().includes(trimmed)
    );
    const tasks = [];
    loadAllBoards(flatModules).forEach(({ module, board }) => {
      Object.values(board.tasks || {}).forEach(task => {
        if (task.content.toLowerCase().includes(trimmed)) {
          tasks.push({ module, task });
        }
      });
    });
    return { modules, tasks: tasks.slice(0, 25) };
  }, [trimmed, flatModules]);

  const isModuleActive = (moduleId) => view.type === 'module' && view.module.id === moduleId;

  const closeRowMenu = () => setOpenRowMenu(null);

  const handleSaveGroup = (data) => {
    if (groupModal.mode === 'create') onCreateGroup(data);
    else onUpdateGroup(groupModal.group.id, data);
    setGroupModal(null);
  };

  const handleDeleteGroupClick = () => {
    const group = groupModal.group;
    const moduleCount = group.modules.length;
    const message = moduleCount > 0
      ? `Xoá dự án "${group.title}" sẽ xoá vĩnh viễn ${moduleCount} module và toàn bộ công việc bên trong. Tiếp tục?`
      : `Xoá dự án "${group.title}"?`;
    if (!window.confirm(message)) return;
    onDeleteGroup(group.id);
    setGroupModal(null);
  };

  const handleSaveModule = (data) => {
    if (moduleModal.mode === 'create') onCreateModule(data.groupId, data);
    else onUpdateModule(moduleModal.module.id, data);
    setModuleModal(null);
  };

  const handleDeleteModuleClick = () => {
    const module = moduleModal.module;
    if (!window.confirm(`Xoá module "${module.title}" và toàn bộ công việc bên trong?`)) return;
    onDeleteModule(module.id);
    setModuleModal(null);
  };

  const handleSidebarDragEnd = (result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (type === 'GROUP') {
      onReorderGroups(source.index, destination.index);
    } else if (type.startsWith(MODULE_DND_TYPE_PREFIX)) {
      const groupId = type.slice(MODULE_DND_TYPE_PREFIX.length);
      onReorderModules(groupId, source.index, destination.index);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo"><Boxes size={19} /></div>
        <div className="sidebar-header-text">
          <h2>OPC Workspace</h2>
          <span>AI Business OS v2.0</span>
        </div>
      </div>

      <div className="sidebar-search">
        <Search size={15} className="sidebar-search-icon" />
        <input
          type="text"
          placeholder="Tìm module hoặc công việc..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className="sidebar-search-clear" onClick={() => setQuery('')}>
            <X size={13} />
          </button>
        )}
      </div>

      <div className="sidebar-content" onClick={closeRowMenu}>
        {searchResults ? (
          <div className="sidebar-search-results">
            <div className="sidebar-group-header static">Mô hình ({searchResults.modules.length})</div>
            {searchResults.modules.map(module => (
              <div
                key={module.id}
                className={`sidebar-item ${isModuleActive(module.id) ? 'active' : ''}`}
                onClick={() => onSelectModule(module)}
              >
                <span className={`sidebar-item-dot accent-${module.accent}`} />
                <ModuleTypeIcon type={module.type} />
                <span>{module.title}</span>
              </div>
            ))}
            {searchResults.modules.length === 0 && (
              <p className="sidebar-empty">Không tìm thấy module phù hợp.</p>
            )}

            <div className="sidebar-group-header static">Công việc ({searchResults.tasks.length})</div>
            {searchResults.tasks.map(({ module, task }) => (
              <div key={task.id} className="sidebar-task-result" onClick={() => onSelectModule(module)}>
                <span className="sidebar-task-content">{task.content}</span>
                <span className="sidebar-task-module">{module.code}</span>
              </div>
            ))}
            {searchResults.tasks.length === 0 && (
              <p className="sidebar-empty">Không tìm thấy công việc phù hợp.</p>
            )}
          </div>
        ) : (
          <>
            <div className="sidebar-section-label">Bảng Điều Khiển</div>
            <div
              className={`sidebar-item top-level ${view.type === 'overview' ? 'active' : ''}`}
              onClick={onSelectOverview}
            >
              <LayoutDashboard size={16} className="sidebar-item-icon" />
              <span>Tổng quan hệ thống</span>
            </div>
            <div
              className={`sidebar-item top-level ${view.type === 'calendar' ? 'active' : ''}`}
              onClick={onSelectCalendar}
            >
              <CalendarDays size={16} className="sidebar-item-icon" />
              <span>Lịch & Lịch biểu Ngày</span>
            </div>
            <div
              className={`sidebar-item top-level ${view.type === 'timeline' ? 'active' : ''}`}
              onClick={onSelectTimeline}
            >
              <GanttChartSquare size={16} className="sidebar-item-icon" />
              <span>Timeline Toàn Công Ty</span>
            </div>
            <div
              className="sidebar-item top-level"
              onClick={onOpenPersonnel}
            >
              <Users size={16} className="sidebar-item-icon" />
              <span>Nhân sự & AI Agents</span>
            </div>

            <div className="sidebar-section-label">Hệ Thống Dự án</div>
            <DragDropContext onDragEnd={handleSidebarDragEnd}>
              <Droppable droppableId="sidebar-groups" type="GROUP">
                {(groupsProvided) => (
                  <div ref={groupsProvided.innerRef} {...groupsProvided.droppableProps}>
                    {groups.map((group, groupIndex) => (
                      <Draggable key={group.id} draggableId={`group-${group.id}`} index={groupIndex}>
                        {(groupDragProvided, groupDragSnapshot) => (
                          <div
                            className={`sidebar-group ${groupDragSnapshot.isDragging ? 'dragging' : ''}`}
                            ref={groupDragProvided.innerRef}
                            {...groupDragProvided.draggableProps}
                          >
                            <div className="sidebar-group-header sidebar-group-header-row" {...groupDragProvided.dragHandleProps}>
                              <div className="sidebar-group-title">
                                <GripVertical size={13} className="sidebar-drag-grip" />
                                <button
                                  type="button"
                                  className="sidebar-group-expand-btn"
                                  onClick={e => { e.stopPropagation(); toggleGroup(group.id); }}
                                  title={expandedGroups.includes(group.id) ? 'Thu gọn' : 'Mở rộng'}
                                >
                                  {expandedGroups.includes(group.id) ? (
                                    <ChevronDown size={16} />
                                  ) : (
                                    <ChevronRight size={16} />
                                  )}
                                </button>
                                <span
                                  className="sidebar-group-title-clickable"
                                  onClick={e => { e.stopPropagation(); onSelectProject(group); }}
                                  title="Xem trang tổng quan dự án"
                                >
                                  <span
                                    className={`sidebar-group-avatar ${group.customAccentColor ? '' : `accent-${group.accent}`}`}
                                    style={group.customAccentColor ? { background: group.customAccentColor } : undefined}
                                  >
                                    {group.logoUrl ? <img src={group.logoUrl} alt="" /> : (group.code || group.title.charAt(0))}
                                  </span>
                                  <span>{group.title}</span>
                                </span>
                              </div>
                              <div className="sidebar-row-actions" onClick={e => e.stopPropagation()}>
                                <button
                                  className="sidebar-row-menu-btn"
                                  onClick={() => setOpenRowMenu(prev => prev === `group-${group.id}` ? null : `group-${group.id}`)}
                                >
                                  <MoreHorizontal size={13} />
                                </button>
                                {openRowMenu === `group-${group.id}` && (
                                  <div className="sidebar-row-menu">
                                    <button
                                      className="column-menu-item"
                                      onClick={() => { setModuleModal({ mode: 'create', defaultGroupId: group.id }); closeRowMenu(); }}
                                    >
                                      <Plus size={14} /> Thêm module
                                    </button>
                                    <button
                                      className="column-menu-item"
                                      onClick={() => { setGroupModal({ mode: 'edit', group }); closeRowMenu(); }}
                                    >
                                      <Pencil size={14} /> Sửa dự án
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {expandedGroups.includes(group.id) && (
                              <Droppable droppableId={`group-modules-${group.id}`} type={`${MODULE_DND_TYPE_PREFIX}${group.id}`}>
                                {(modulesProvided) => (
                                  <div className="sidebar-group-items" ref={modulesProvided.innerRef} {...modulesProvided.droppableProps}>
                                    {group.modules.map((module, moduleIndex) => (
                                      <Draggable key={module.id} draggableId={`module-${module.id}`} index={moduleIndex}>
                                        {(moduleDragProvided, moduleDragSnapshot) => (
                                          <div
                                            className={`sidebar-item sidebar-item-row ${isModuleActive(module.id) ? 'active' : ''} ${moduleDragSnapshot.isDragging ? 'dragging' : ''}`}
                                            ref={moduleDragProvided.innerRef}
                                            {...moduleDragProvided.draggableProps}
                                            {...moduleDragProvided.dragHandleProps}
                                            onClick={() => onSelectModule(module)}
                                          >
                                            <GripVertical size={12} className="sidebar-drag-grip" />
                                            <span className={`sidebar-item-dot accent-${group.accent}`} />
                                            <ModuleTypeIcon type={module.type} />
                                            <span className="sidebar-item-label">{module.title}</span>
                                            <div className="sidebar-row-actions" onClick={e => e.stopPropagation()}>
                                              <button
                                                className="sidebar-row-menu-btn"
                                                onClick={() => setOpenRowMenu(prev => prev === `module-${module.id}` ? null : `module-${module.id}`)}
                                              >
                                                <MoreHorizontal size={13} />
                                              </button>
                                              {openRowMenu === `module-${module.id}` && (
                                                <div className="sidebar-row-menu">
                                                  <button
                                                    className="column-menu-item"
                                                    onClick={() => {
                                                      setModuleModal({ mode: 'edit', module: { ...module, groupId: group.id } });
                                                      closeRowMenu();
                                                    }}
                                                  >
                                                    <Pencil size={14} /> Sửa / chuyển dự án
                                                  </button>
                                                  <button
                                                    className="column-menu-item"
                                                    onClick={() => {
                                                      setCopyModal({ module, sourceGroupId: group.id });
                                                      closeRowMenu();
                                                    }}
                                                  >
                                                    <Copy size={14} /> Sao chép sang dự án khác
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {modulesProvided.placeholder}
                                    {group.modules.length === 0 && (
                                      <p className="sidebar-empty">Chưa có module nào trong dự án này.</p>
                                    )}
                                  </div>
                                )}
                              </Droppable>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {groupsProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <button className="sidebar-add-group-btn" onClick={() => setGroupModal({ mode: 'create' })}>
              <Plus size={14} /> Thêm dự án
            </button>

            <div className="sidebar-section-label">Công Cụ Trợ Lý AI</div>
            <div
              className={`sidebar-item top-level ${view.type === 'chat' ? 'active' : ''}`}
              onClick={onSelectChat}
            >
              <Sparkles size={16} className="sidebar-item-icon" />
              <span>Trợ lý Agnes-2.0-Pro</span>
            </div>
            <div
              className={`sidebar-item top-level ${view.type === 'auditLog' ? 'active' : ''}`}
              onClick={onSelectAuditLog}
            >
              <ScrollText size={16} className="sidebar-item-icon" />
              <span>Nhật ký & SOP AI</span>
            </div>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <div
          className={`sidebar-item top-level ${view.type === 'settings' ? 'active' : ''}`}
          onClick={onSelectSettings}
        >
          <Settings size={16} className="sidebar-item-icon" />
          <span>Cài đặt hệ thống</span>
        </div>
      </div>

      {groupModal && (
        <GroupModal
          mode={groupModal.mode}
          initial={groupModal.group}
          onClose={() => setGroupModal(null)}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroupClick}
        />
      )}

      {moduleModal && (
        <ModuleModal
          mode={moduleModal.mode}
          initial={moduleModal.module}
          defaultGroupId={moduleModal.defaultGroupId}
          groups={groups}
          onClose={() => setModuleModal(null)}
          onSave={handleSaveModule}
          onDelete={handleDeleteModuleClick}
        />
      )}

      {copyModal && (
        <CopyModuleModal
          sourceModule={copyModal.module}
          sourceGroupId={copyModal.sourceGroupId}
          groups={groups}
          onClose={() => setCopyModal(null)}
          onCopy={async (data) => {
            await onCopyModule(copyModal.module.id, data);
            setCopyModal(null);
          }}
        />
      )}
    </div>
  );
}
