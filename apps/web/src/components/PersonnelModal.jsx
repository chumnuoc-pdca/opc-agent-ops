import React, { useState } from 'react';
import { User, Bot, Plus, X, Search, Edit2, Trash2, Check, Mail, Sparkles, FolderKanban, ChevronDown } from 'lucide-react';
import {
  getPersonnel, addPersonnel, updatePersonnel, deletePersonnel, toggleProjectAssignment
} from '../utils/personnelStorage';
import { useOverlayClose } from '../utils/useOverlayClose';

export default function PersonnelModal({ isOpen, onClose, groups = [], initialProjectId = '', initialType = '', onCreated = null }) {
  const [personnelList, setPersonnelList] = useState(() => getPersonnel());
  const [activeTab, setActiveTab] = useState(initialType === 'agent' || initialType === 'human' ? initialType : 'all');
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Trạng thái nếu mở trực tiếp từ ô gán việc trong thẻ đầu việc (Direct Create Mode)
  const isDirectCreateMode = Boolean(initialType === 'human' || initialType === 'agent');
  const [showFullList, setShowFullList] = useState(false);

  const [editingPerson, setEditingPerson] = useState(() => {
    if (initialType !== 'agent' && initialType !== 'human') return null;
    return {
      mode: 'create',
      data: {
        type: initialType,
        name: '', role: '', email: '', skills: '',
        projectIds: initialProjectId ? [initialProjectId] : [],
        status: 'active'
      }
    };
  });

  const [openProjectDropdownId, setOpenProjectDropdownId] = useState(null);

  const handleFormClose = () => {
    setEditingPerson(null);
    if (isDirectCreateMode && !showFullList) {
      onClose();
    }
  };

  const overlayHandlers = useOverlayClose(() => {
    if (isDirectCreateMode && !showFullList) {
      handleFormClose();
    } else if (editingPerson) {
      setEditingPerson(null);
    } else {
      onClose();
    }
  });

  const refreshList = () => {
    setPersonnelList([...getPersonnel()]);
  };

  const filteredList = personnelList.filter(person => {
    if (activeTab === 'human' && person.type !== 'human') return false;
    if (activeTab === 'agent' && person.type !== 'agent') return false;

    if (selectedProjectId) {
      if (person.projectIds && person.projectIds.length > 0 && !person.projectIds.includes(selectedProjectId)) {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (person.name || '').toLowerCase().includes(q);
      const matchRole = (person.role || '').toLowerCase().includes(q);
      const matchSkills = (person.skills || '').toLowerCase().includes(q);
      const matchEmail = (person.email || '').toLowerCase().includes(q);
      if (!matchName && !matchRole && !matchSkills && !matchEmail) return false;
    }
    return true;
  });

  const humanCount = personnelList.filter(p => p.type === 'human').length;
  const agentCount = personnelList.filter(p => p.type === 'agent').length;

  const handleCreateOpen = (type = 'human') => {
    setEditingPerson({
      mode: 'create',
      data: {
        type,
        name: '',
        role: '',
        email: '',
        skills: '',
        projectIds: selectedProjectId ? [selectedProjectId] : [],
        status: 'active'
      }
    });
  };

  const handleEditOpen = (person) => {
    setEditingPerson({
      mode: 'edit',
      data: { ...person }
    });
  };

  const handleFormSave = (e) => {
    e.preventDefault();
    if (!editingPerson?.data?.name?.trim()) return;

    if (editingPerson.mode === 'create') {
      const created = addPersonnel(editingPerson.data);
      refreshList();
      setEditingPerson(null);
      if (onCreated) {
        onCreated(created);
      } else {
        onClose();
      }
      return;
    }
    updatePersonnel(editingPerson.data.id, editingPerson.data);
    refreshList();
    handleFormClose();
  };

  const handleDelete = (person) => {
    if (window.confirm(`Xoá nhân sự "${person.name}" khỏi hệ thống?`)) {
      deletePersonnel(person.id);
      refreshList();
    }
  };

  const handleToggleProject = (personId, projectId) => {
    toggleProjectAssignment(personId, projectId);
    refreshList();
  };

  if (!isOpen) return null;

  // Render form duy nhất (đơn lớp popup) khi mở từ thao tác gán việc trong thẻ đầu việc
  if (isDirectCreateMode && !showFullList && editingPerson) {
    return (
      <div className="modal-overlay" {...overlayHandlers}>
        <div className="modal-content personnel-form-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>{editingPerson.mode === 'create' ? 'Thêm Nhân sự / AI Agent mới' : 'Chỉnh sửa thông tin nhân sự'}</h2>
              <span className="modal-subtitle">
                Điền thông tin bên dưới để khởi tạo và gán vào công việc hiện tại
              </span>
            </div>
            <button type="button" className="close-btn" onClick={handleFormClose}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleFormSave}>
            <div className="modal-body">
              <div className="form-field">
                <label>Loại nhân sự</label>
                <div className="assignee-type-toggle">
                  <button
                    type="button"
                    className={`assignee-type-btn ${editingPerson.data.type === 'human' ? 'active' : ''}`}
                    onClick={() => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, type: 'human' } }))}
                  >
                    <User size={13} /> Con người
                  </button>
                  <button
                    type="button"
                    className={`assignee-type-btn ${editingPerson.data.type === 'agent' ? 'active' : ''}`}
                    onClick={() => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, type: 'agent' } }))}
                  >
                    <Bot size={13} /> Trợ lý AI Agent
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label>Tên nhân sự / Trợ lý AI (*)</label>
                <input
                  type="text"
                  required
                  value={editingPerson.data.name}
                  onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                  placeholder={editingPerson.data.type === 'agent' ? 'Vd: Alex Research, Nova Copywriter...' : 'Vd: Nguyễn Văn A, Linh Content...'}
                />
              </div>

              <div className="form-field">
                <label>Vai trò / Chức danh</label>
                <input
                  type="text"
                  value={editingPerson.data.role || ''}
                  onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, role: e.target.value } }))}
                  placeholder={editingPerson.data.type === 'agent' ? 'Vd: Research & Insights Agent' : 'Vd: Content Lead, Senior Scriptwriter...'}
                />
              </div>

              {editingPerson.data.type === 'human' && (
                <div className="form-field">
                  <label>Email / Liên hệ</label>
                  <input
                    type="email"
                    value={editingPerson.data.email || ''}
                    onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, email: e.target.value } }))}
                    placeholder="linh@company.com"
                  />
                </div>
              )}

              <div className="form-field">
                <label>Kỹ năng / Mô tả năng lực</label>
                <textarea
                  rows={2}
                  value={editingPerson.data.skills || ''}
                  onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, skills: e.target.value } }))}
                  placeholder={editingPerson.data.type === 'agent' ? 'Mô tả chuyên môn của Agent (Nghiên cứu thị trường, viết prompt kịch bản...)' : 'Kỹ năng chuyên môn, kinh nghiệm thực chiến...'}
                />
              </div>

              <div className="form-field">
                <label>Gán vào dự án (để trống = gán cho tất cả dự án)</label>
                <div className="projects-checkbox-grid">
                  {groups.map(g => {
                    const isChecked = editingPerson.data.projectIds?.includes(g.id);
                    return (
                      <label key={g.id} className={`project-checkbox-item ${isChecked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const curr = editingPerson.data.projectIds || [];
                            const next = isChecked ? curr.filter(id => id !== g.id) : [...curr, g.id];
                            setEditingPerson(prev => ({ ...prev, data: { ...prev.data, projectIds: next } }));
                          }}
                        />
                        <span>{g.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowFullList(true)}
                title="Mở toàn bộ danh sách quản lý nhân sự"
                style={{ marginRight: 'auto' }}
              >
                <FolderKanban size={14} /> Quản lý danh sách
              </button>
              <button type="button" className="secondary-btn" onClick={handleFormClose}>
                Huỷ
              </button>
              <button type="submit" className="primary-btn">
                <Plus size={15} /> Thêm mới & Gán việc
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Quản lý danh sách nhân sự (dạng Manager Modal đầy đủ)
  return (
    <div className="modal-overlay" {...overlayHandlers}>
      <div className="modal-content personnel-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <User size={22} className="modal-title-icon-main" />
            <div>
              <h2>Danh sách Nhân sự & Trợ lý AI</h2>
              <span className="modal-subtitle">Quản lý đội ngũ con người và các AI Agents thuộc các dự án</span>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Controls Bar */}
          <div className="personnel-controls-row">
            <div className="personnel-tabs">
              <button
                type="button"
                className={`personnel-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                Tất cả ({personnelList.length})
              </button>
              <button
                type="button"
                className={`personnel-tab ${activeTab === 'human' ? 'active' : ''}`}
                onClick={() => setActiveTab('human')}
              >
                <User size={14} /> Con người ({humanCount})
              </button>
              <button
                type="button"
                className={`personnel-tab ${activeTab === 'agent' ? 'active' : ''}`}
                onClick={() => setActiveTab('agent')}
              >
                <Bot size={14} /> Trợ lý AI ({agentCount})
              </button>
            </div>

            <div className="personnel-controls-right">
              <div className="personnel-project-select">
                <FolderKanban size={13} />
                <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
                  <option value="">Tất cả Dự án ({groups.length})</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>

              <div className="personnel-search">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Tìm theo tên, vai trò, email, kỹ năng..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="primary-btn sm"
                onClick={() => handleCreateOpen(activeTab === 'agent' ? 'agent' : 'human')}
              >
                <Plus size={15} /> Thêm mới
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          {filteredList.length === 0 ? (
            <div className="personnel-empty-state">
              <User size={36} className="empty-icon" />
              <p>Không tìm thấy nhân sự hoặc Trợ lý AI phù hợp với bộ lọc.</p>
              <button
                type="button"
                className="secondary-btn sm"
                onClick={() => handleCreateOpen('human')}
              >
                <Plus size={14} /> Thêm nhân sự mới
              </button>
            </div>
          ) : (
            <div className="personnel-grid">
              {filteredList.map(person => {
                const isAgent = person.type === 'agent';
                const assignedGroupIds = person.projectIds || [];
                const isAssignedAll = assignedGroupIds.length === 0;

                return (
                  <div key={person.id} className={`personnel-card type-${person.type}`}>
                    <div className="personnel-card-header">
                      <div className="personnel-avatar-wrap">
                        <div className={`personnel-avatar type-${person.type}`}>
                          {isAgent ? <Bot size={18} /> : <User size={18} />}
                        </div>
                      </div>

                      <div className="personnel-info">
                        <div className="personnel-name-row">
                          <h3 className="personnel-name">{person.name}</h3>
                          <span className={`personnel-type-badge type-${person.type}`}>
                            {isAgent ? <><Bot size={10} /> AI Agent</> : <><User size={10} /> Con người</>}
                          </span>
                        </div>
                        {person.role && <div className="personnel-role">{person.role}</div>}
                      </div>

                      <div className="personnel-card-actions">
                        <button
                          type="button"
                          className="icon-action-btn"
                          title="Chỉnh sửa thông tin"
                          onClick={() => handleEditOpen(person)}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn danger"
                          title="Xoá nhân sự"
                          onClick={() => handleDelete(person)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Contact & Skills */}
                    <div className="personnel-card-body">
                      {person.email && (
                        <div className="personnel-detail-row">
                          <Mail size={12} className="detail-icon" />
                          <span>{person.email}</span>
                        </div>
                      )}
                      {person.skills && (
                        <div className="personnel-detail-row skills">
                          <Sparkles size={12} className="detail-icon" />
                          <span>{person.skills}</span>
                        </div>
                      )}
                    </div>

                    {/* Assigned Projects Section */}
                    <div className="personnel-card-projects">
                      <div className="projects-label-row">
                        <span className="projects-label"><FolderKanban size={11} /> Thuộc dự án:</span>
                        <div className="project-dropdown-wrap">
                          <button
                            type="button"
                            className="toggle-project-btn"
                            onClick={() => setOpenProjectDropdownId(prev => prev === person.id ? null : person.id)}
                          >
                            + Gán dự án <ChevronDown size={11} />
                          </button>
                          {openProjectDropdownId === person.id && (
                            <div className="project-select-menu">
                              <div className="menu-header">Thêm/bỏ dự án:</div>
                              {groups.map(g => {
                                const isChecked = assignedGroupIds.includes(g.id);
                                return (
                                  <label key={g.id} className="menu-item-label">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleProject(person.id, g.id)}
                                    />
                                    <span>{g.title}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="projects-tags-list">
                        {isAssignedAll ? (
                          <span className="project-tag-chip all">Tất cả dự án ({groups.length})</span>
                        ) : (
                          assignedGroupIds.map(gId => {
                            const groupObj = groups.find(g => g.id === gId);
                            if (!groupObj) return null;
                            return (
                              <span key={gId} className="project-tag-chip">
                                {groupObj.title?.split(' - ')[0] || groupObj.code}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>

      {/* Add / Edit Form Sub-Modal Dialog khi đang ở trong Manager Modal */}
      {editingPerson && (
        <div className="sub-modal-overlay" onClick={() => setEditingPerson(null)}>
          <div className="sub-modal-content personnel-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingPerson.mode === 'create' ? 'Thêm Nhân sự / AI Agent mới' : 'Chỉnh sửa thông tin nhân sự'}</h2>
                <span className="modal-subtitle">
                  {editingPerson.mode === 'create'
                    ? 'Điền thông tin bên dưới để khởi tạo và gán vào hệ thống'
                    : 'Cập nhật thông tin nhân sự và quyền quản lý dự án'}
                </span>
              </div>
              <button type="button" className="close-btn" onClick={() => setEditingPerson(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSave}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Loại nhân sự</label>
                  <div className="assignee-type-toggle">
                    <button
                      type="button"
                      className={`assignee-type-btn ${editingPerson.data.type === 'human' ? 'active' : ''}`}
                      onClick={() => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, type: 'human' } }))}
                    >
                      <User size={13} /> Con người
                    </button>
                    <button
                      type="button"
                      className={`assignee-type-btn ${editingPerson.data.type === 'agent' ? 'active' : ''}`}
                      onClick={() => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, type: 'agent' } }))}
                    >
                      <Bot size={13} /> Trợ lý AI Agent
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label>Tên nhân sự / Trợ lý AI (*)</label>
                  <input
                    type="text"
                    required
                    value={editingPerson.data.name}
                    onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                    placeholder={editingPerson.data.type === 'agent' ? 'Vd: Alex Research, Nova Copywriter...' : 'Vd: Nguyễn Văn A, Linh Content...'}
                  />
                </div>

                <div className="form-field">
                  <label>Vai trò / Chức danh</label>
                  <input
                    type="text"
                    value={editingPerson.data.role || ''}
                    onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, role: e.target.value } }))}
                    placeholder={editingPerson.data.type === 'agent' ? 'Vd: Research & Insights Agent' : 'Vd: Content Lead, Senior Scriptwriter...'}
                  />
                </div>

                {editingPerson.data.type === 'human' && (
                  <div className="form-field">
                    <label>Email / Liên hệ</label>
                    <input
                      type="email"
                      value={editingPerson.data.email || ''}
                      onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, email: e.target.value } }))}
                      placeholder="linh@company.com"
                    />
                  </div>
                )}

                <div className="form-field">
                  <label>Kỹ năng / Mô tả năng lực</label>
                  <textarea
                    rows={2}
                    value={editingPerson.data.skills || ''}
                    onChange={e => setEditingPerson(prev => ({ ...prev, data: { ...prev.data, skills: e.target.value } }))}
                    placeholder={editingPerson.data.type === 'agent' ? 'Mô tả chuyên môn của Agent (Nghiên cứu thị trường, viết prompt kịch bản...)' : 'Kỹ năng chuyên môn, kinh nghiệm thực chiến...'}
                  />
                </div>

                <div className="form-field">
                  <label>Gán vào dự án (để trống = gán cho tất cả dự án)</label>
                  <div className="projects-checkbox-grid">
                    {groups.map(g => {
                      const isChecked = editingPerson.data.projectIds?.includes(g.id);
                      return (
                        <label key={g.id} className={`project-checkbox-item ${isChecked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const curr = editingPerson.data.projectIds || [];
                              const next = isChecked ? curr.filter(id => id !== g.id) : [...curr, g.id];
                              setEditingPerson(prev => ({ ...prev, data: { ...prev.data, projectIds: next } }));
                            }}
                          />
                          <span>{g.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setEditingPerson(null)}>
                  Huỷ
                </button>
                <button type="submit" className="primary-btn">
                  {editingPerson.mode === 'create' ? <><Plus size={15} /> Thêm mới</> : <><Check size={15} /> Lưu thay đổi</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
