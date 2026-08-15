import React, { useEffect, useState } from 'react';
import { Target, TrendingUp, TrendingDown, Plus, Trash2, BarChart3, PieChart } from 'lucide-react';
import { getModuleKpiList } from '../utils/boardStorage';
import {
  loadModuleOkr, saveModuleOkr, createEmptyKeyResult, createEmptyObjective,
  computeKrProgress, krTrend
} from '../utils/okrStorage';

const STATUS_LABEL = (progress) => {
  if (progress >= 100) return { text: 'Đạt mục tiêu', className: 'done' };
  if (progress > 0) return { text: 'Đang triển khai', className: 'inprogress' };
  return { text: 'Chưa bắt đầu', className: 'todo' };
};

export default function ModuleKpiPage({ module }) {
  const [okr, setOkr] = useState(() => loadModuleOkr(module, getModuleKpiList(module)));

  useEffect(() => {
    setOkr(loadModuleOkr(module, getModuleKpiList(module)));
  }, [module]);

  const persist = (next) => {
    setOkr(next);
    saveModuleOkr(module.id, next);
  };

  const updateObjectiveText = (objId, text) => {
    persist({ ...okr, objectives: okr.objectives.map(o => o.id === objId ? { ...o, text } : o) });
  };

  const addObjective = () => {
    const obj = createEmptyObjective(module.id, okr.objectives.length);
    persist({ ...okr, objectives: [...okr.objectives, obj] });
  };

  const deleteObjective = (objId) => {
    persist({ ...okr, objectives: okr.objectives.filter(o => o.id !== objId) });
  };

  const updateKrField = (objId, krId, field, value) => {
    persist({
      ...okr,
      objectives: okr.objectives.map(o => o.id !== objId ? o : {
        ...o,
        keyResults: o.keyResults.map(kr => kr.id === krId ? { ...kr, [field]: value, updatedAt: Date.now() } : kr)
      })
    });
  };

  const commitCurrentValue = (objId, krId, rawValue) => {
    persist({
      ...okr,
      objectives: okr.objectives.map(o => o.id !== objId ? o : {
        ...o,
        keyResults: o.keyResults.map(kr => {
          if (kr.id !== krId) return kr;
          const prevRaw = kr.currentValue === undefined || kr.currentValue === null ? '' : String(kr.currentValue);
          if (rawValue === prevRaw) return kr;
          return { ...kr, previousValue: kr.currentValue, currentValue: rawValue, updatedAt: Date.now() };
        })
      })
    });
  };

  const addKeyResult = (objId) => {
    persist({
      ...okr,
      objectives: okr.objectives.map(o => o.id !== objId ? o : {
        ...o,
        keyResults: [...o.keyResults, createEmptyKeyResult(module.id, o.keyResults.length)]
      })
    });
  };

  const deleteKeyResult = (objId, krId) => {
    persist({
      ...okr,
      objectives: okr.objectives.map(o => o.id !== objId ? o : { ...o, keyResults: o.keyResults.filter(kr => kr.id !== krId) })
    });
  };

  const allKeyResults = okr.objectives.flatMap(o => o.keyResults);
  const withProgress = allKeyResults.map(kr => ({ ...kr, progress: computeKrProgress(kr) }));
  const overallProgress = withProgress.length
    ? Math.round(withProgress.reduce((sum, kr) => sum + kr.progress, 0) / withProgress.length)
    : 0;

  const doneCount = withProgress.filter(kr => kr.progress >= 100).length;
  const inProgressCount = withProgress.filter(kr => kr.progress > 0 && kr.progress < 100).length;
  const todoCount = withProgress.length - doneCount - inProgressCount;
  const total = withProgress.length || 1;
  const donePct = (doneCount / total) * 100;
  const inProgressPct = (inProgressCount / total) * 100;
  const donutGradient = `conic-gradient(var(--emerald) 0% ${donePct}%, var(--amber) ${donePct}% ${donePct + inProgressPct}%, var(--border-strong) ${donePct + inProgressPct}% 100%)`;

  return (
    <div className="kpi-page">
      <div className="okr-summary-bar">
        <div className="okr-overall-progress">
          <span className="kpi-section-heading" style={{ margin: 0 }}><Target size={16} /> Tổng tiến độ OKRs</span>
          <div className="okr-overall-bar">
            <div className="okr-overall-fill" style={{ width: `${overallProgress}%` }} />
          </div>
          <span className="okr-overall-value">{overallProgress}%</span>
        </div>
      </div>

      <div className="kpi-dashboard-grid">
        <div className="kpi-chart-card">
          <div className="kpi-section-heading">
            <BarChart3 size={16} />
            <h3>Tiến độ từng Key Result</h3>
          </div>
          {withProgress.length === 0 ? (
            <p className="empty-text">Chưa có Key Result nào.</p>
          ) : (
            <div className="kr-bar-chart">
              {withProgress.map(kr => {
                const status = STATUS_LABEL(kr.progress);
                const trend = krTrend(kr);
                return (
                  <div key={kr.id} className="kr-bar-row">
                    <span className="kr-bar-label" title={kr.text}>{kr.text || 'Chưa đặt tên'}</span>
                    <div className="kr-bar-track">
                      <div className={`kr-bar-fill kr-bar-${status.className}`} style={{ width: `${kr.progress}%` }} />
                    </div>
                    <span className="kr-bar-value">
                      {kr.progress}%
                      {trend === 'up' && <TrendingUp size={12} className="trend-up" />}
                      {trend === 'down' && <TrendingDown size={12} className="trend-down" />}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="kpi-chart-card">
          <div className="kpi-section-heading">
            <PieChart size={16} />
            <h3>Phân bổ trạng thái</h3>
          </div>
          <div className="kr-donut-row">
            <div className="kr-donut" style={{ background: donutGradient }}>
              <div className="kr-donut-hole">
                <span className="kr-donut-total">{withProgress.length}</span>
                <span className="kr-donut-total-label">Key Results</span>
              </div>
            </div>
            <div className="kr-donut-legend">
              <div className="kr-legend-row">
                <span className="kr-legend-dot" style={{ background: 'var(--emerald)' }} />
                <span className="kr-legend-label">Đạt mục tiêu</span>
                <span className="kr-legend-value">{doneCount}</span>
              </div>
              <div className="kr-legend-row">
                <span className="kr-legend-dot" style={{ background: 'var(--amber)' }} />
                <span className="kr-legend-label">Đang triển khai</span>
                <span className="kr-legend-value">{inProgressCount}</span>
              </div>
              <div className="kr-legend-row">
                <span className="kr-legend-dot" style={{ background: 'var(--border-strong)' }} />
                <span className="kr-legend-label">Chưa bắt đầu</span>
                <span className="kr-legend-value">{todoCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {okr.objectives.map((obj, objIndex) => (
        <div key={obj.id} className="okr-objective-card">
          <div className="okr-objective-top">
            <span className={`page-icon-badge accent-${module.accent || 'indigo'}`}><Target size={18} /></span>
            <div className="okr-objective-text-wrap">
              <span className="okr-objective-eyebrow">Objective {objIndex + 1}</span>
              <textarea
                className="okr-objective-input"
                rows={2}
                placeholder="Mô tả Objective..."
                value={obj.text}
                onChange={e => updateObjectiveText(obj.id, e.target.value)}
              />
            </div>
            {okr.objectives.length > 1 && (
              <button className="kr-delete-btn" onClick={() => deleteObjective(obj.id)} title="Xoá Objective">
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <div className="kr-list">
            {obj.keyResults.map(kr => {
              const progress = computeKrProgress(kr);
              const status = STATUS_LABEL(progress);
              const trend = krTrend(kr);
              return (
                <div key={kr.id} className="kr-card kr-card-editable">
                  <div className="kr-card-top">
                    <input
                      type="text"
                      className="kr-text-input"
                      placeholder="Mô tả Key Result..."
                      value={kr.text}
                      onChange={e => updateKrField(obj.id, kr.id, 'text', e.target.value)}
                    />
                    <span className={`kr-status kr-status-${status.className}`}>{status.text}</span>
                    <button className="kr-delete-btn" onClick={() => deleteKeyResult(obj.id, kr.id)} title="Xoá Key Result">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="kr-input-row">
                    <label>
                      <span>Hiện tại</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={kr.currentValue}
                        onBlur={e => commitCurrentValue(obj.id, kr.id, e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      <span>Mục tiêu</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={kr.targetValue}
                        onChange={e => updateKrField(obj.id, kr.id, 'targetValue', e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      <span>Đơn vị</span>
                      <input
                        type="text"
                        value={kr.unit}
                        onChange={e => updateKrField(obj.id, kr.id, 'unit', e.target.value)}
                        placeholder="%, VNĐ..."
                      />
                    </label>
                    <div className="kr-progress-readout">
                      <span className="kr-progress-value">{progress}%</span>
                      {trend === 'up' && <TrendingUp size={14} className="trend-up" />}
                      {trend === 'down' && <TrendingDown size={14} className="trend-down" />}
                    </div>
                  </div>

                  <div className="kr-progress-row">
                    <div className="kr-progress-track">
                      <div className={`kr-progress-fill kr-bar-${status.className}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <input
                    type="text"
                    className="kr-note-input"
                    placeholder="Ghi chú số liệu hiện tại..."
                    value={kr.note}
                    onChange={e => updateKrField(obj.id, kr.id, 'note', e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          <button className="add-kr-btn" onClick={() => addKeyResult(obj.id)}>
            <Plus size={15} /> Thêm Key Result
          </button>
        </div>
      ))}

      <button className="add-kr-btn add-objective-btn" onClick={addObjective}>
        <Plus size={15} /> Thêm Objective
      </button>
    </div>
  );
}
