import React, { useEffect, useState } from 'react';
import { Code2, Image, Users, Layers, TrendingUp, Radio, Plus, Trash2, Package } from 'lucide-react';
import { ASSET_CATEGORIES, loadModuleAssets, saveModuleAssets, createEmptyAsset } from '../utils/assetStorage';
import DocumentLinker from './DocumentLinker';

const CATEGORY_ICON = {
  code: Code2,
  media: Image,
  community: Users,
  platform: Layers,
  traffic: TrendingUp,
  channel: Radio
};

const STATUS_OPTIONS = [
  { id: 'planned', label: 'Dự kiến' },
  { id: 'inprogress', label: 'Đang triển khai' },
  { id: 'done', label: 'Đã tạo' }
];

export default function ModuleAssetsPage({ module }) {
  const [assets, setAssets] = useState(() => loadModuleAssets(module));

  useEffect(() => {
    setAssets(loadModuleAssets(module));
  }, [module]);

  const persist = (next) => {
    setAssets(next);
    saveModuleAssets(module.id, next);
  };

  const updateItem = (id, field, value) => {
    persist({ ...assets, items: assets.items.map(item => item.id === id ? { ...item, [field]: value, updatedAt: Date.now() } : item) });
  };

  const addItem = (categoryId) => {
    const item = createEmptyAsset(module.id, categoryId, assets.items.length);
    persist({ ...assets, items: [...assets.items, item] });
  };

  const deleteItem = (id) => {
    persist({ ...assets, items: assets.items.filter(item => item.id !== id) });
  };

  const totalCount = assets.items.length;
  const doneCount = assets.items.filter(i => i.status === 'done').length;
  const inProgressCount = assets.items.filter(i => i.status === 'inprogress').length;
  const plannedCount = assets.items.filter(i => i.status === 'planned').length;

  return (
    <div className="kpi-page">
      <div className="asset-stat-row">
        <div className="audit-log-stat-chip accent-indigo">
          <span className="audit-log-stat-value">{totalCount}</span>
          <span className="audit-log-stat-label">Tổng tài sản</span>
        </div>
        <div className="audit-log-stat-chip accent-emerald">
          <span className="audit-log-stat-value">{doneCount}</span>
          <span className="audit-log-stat-label">Đã tạo</span>
        </div>
        <div className="audit-log-stat-chip accent-amber">
          <span className="audit-log-stat-value">{inProgressCount}</span>
          <span className="audit-log-stat-label">Đang triển khai</span>
        </div>
        <div className="audit-log-stat-chip">
          <span className="audit-log-stat-value">{plannedCount}</span>
          <span className="audit-log-stat-label">Dự kiến</span>
        </div>
      </div>

      {ASSET_CATEGORIES.map(cat => {
        const Icon = CATEGORY_ICON[cat.id];
        const items = assets.items.filter(i => i.categoryId === cat.id);
        return (
          <div key={cat.id} className="asset-category-block">
            <div className="kpi-section-heading asset-category-heading">
              <span className={`page-icon-badge accent-${cat.accent}`} style={{ width: 30, height: 30 }}><Icon size={15} /></span>
              <h3>{cat.label}</h3>
              <span className="asset-category-count">{items.length}</span>
            </div>

            {items.length > 0 && (
              <div className="asset-list">
                {items.map(item => (
                  <div key={item.id} className="asset-card">
                    <div className="asset-card-row">
                      <input
                        type="text"
                        className="asset-name-input"
                        placeholder="Tên tài sản..."
                        value={item.name}
                        onChange={e => updateItem(item.id, 'name', e.target.value)}
                      />
                      <select
                        className="asset-status-select"
                        value={item.status}
                        onChange={e => updateItem(item.id, 'status', e.target.value)}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <button className="kr-delete-btn" onClick={() => deleteItem(item.id)} title="Xoá tài sản">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="asset-card-row">
                      <input
                        type="text"
                        className="asset-meta-input"
                        placeholder="Số liệu (vd: 20 kênh, 500 email...)"
                        value={item.metric}
                        onChange={e => updateItem(item.id, 'metric', e.target.value)}
                      />
                      <input
                        type="text"
                        className="asset-meta-input"
                        placeholder="Link (nếu có)"
                        value={item.link}
                        onChange={e => updateItem(item.id, 'link', e.target.value)}
                      />
                    </div>
                    <input
                      type="text"
                      className="kr-note-input"
                      placeholder="Ghi chú..."
                      value={item.note}
                      onChange={e => updateItem(item.id, 'note', e.target.value)}
                    />
                    <DocumentLinker
                      documents={item.documents || []}
                      onChange={next => updateItem(item.id, 'documents', next)}
                    />
                  </div>
                ))}
              </div>
            )}

            <button className="add-kr-btn" onClick={() => addItem(cat.id)}>
              <Plus size={15} /> Thêm tài sản {cat.label}
            </button>
          </div>
        );
      })}

      {totalCount === 0 && (
        <div className="chat-empty-state">
          <span className="page-icon-badge accent-indigo lg"><Package size={26} /></span>
          <p>Chưa có tài sản nào được ghi nhận. Dùng nút "+ Thêm tài sản" trong từng nhóm để bắt đầu.</p>
        </div>
      )}
    </div>
  );
}
