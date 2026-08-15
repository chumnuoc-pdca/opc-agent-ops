import React, { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Plus, Trash2, PieChart, BarChart3, Coins, Receipt, Edit3,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  COST_CATEGORIES, loadModuleFinance, saveModuleFinance,
  createEmptyRevenue, createEmptyCost, computeFinanceTotals, formatVND, formatVNDCompact,
  buildMonthlySeries, formatMonthKey
} from '../utils/financeStorage';

const extractDefaultRevenueSources = (module) => {
  if (!module?.details) return '';
  const lines = module.details.split('\n');
  const foundLine = lines.find(l => l.trim().startsWith('Nguồn tiền:'));
  if (foundLine) {
    return foundLine.replace(/Nguồn tiền:\s*/i, '').trim();
  }
  return '';
};

const DEFAULT_COST_STRUCTURE = "Chi phí sản xuất nội dung AI; chi phí API & công cụ hạ tầng; chi phí ads/marketing thử nghiệm; chi phí nhân sự & CTV vận hành.";

export default function ModuleFinancePage({ module }) {
  const defaultRev = extractDefaultRevenueSources(module);
  const [finance, setFinance] = useState(() => loadModuleFinance(module.id, defaultRev, DEFAULT_COST_STRUCTURE));

  useEffect(() => {
    const defaultRevUpdate = extractDefaultRevenueSources(module);
    setFinance(loadModuleFinance(module.id, defaultRevUpdate, DEFAULT_COST_STRUCTURE));
  }, [module]);

  const persist = (next) => {
    setFinance(next);
    saveModuleFinance(module.id, next);
  };

  const updateField = (field, value) => {
    persist({ ...finance, [field]: value });
  };

  const updateRevenue = (id, field, value) => {
    persist({ ...finance, revenues: (finance.revenues || []).map(r => r.id === id ? { ...r, [field]: value } : r) });
  };

  const updateCost = (id, field, value) => {
    persist({ ...finance, costs: (finance.costs || []).map(c => c.id === id ? { ...c, [field]: value } : c) });
  };

  const addRevenue = () => persist({ ...finance, revenues: [...(finance.revenues || []), createEmptyRevenue(module.id, (finance.revenues || []).length)] });
  const addCost = () => persist({ ...finance, costs: [...(finance.costs || []), createEmptyCost(module.id, (finance.costs || []).length)] });
  const deleteRevenue = (id) => persist({ ...finance, revenues: (finance.revenues || []).filter(r => r.id !== id) });
  const deleteCost = (id) => persist({ ...finance, costs: (finance.costs || []).filter(c => c.id !== id) });

  const { totalRevenue, totalCost, profit, marginPct } = computeFinanceTotals(finance);
  const maxBar = Math.max(totalRevenue, totalCost, 1);

  const monthlySeries = buildMonthlySeries(finance.revenues || [], finance.costs || []);
  const hasMonthlyTrend = monthlySeries.length >= 2;
  const maxMonthly = Math.max(1, ...monthlySeries.map(m => Math.max(m.revenue, m.cost)));

  const costByCategory = COST_CATEGORIES.map(cat => ({
    ...cat,
    total: (finance.costs || []).filter(c => c.categoryId === cat.id).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
  })).filter(c => c.total > 0);

  const costCatColors = { production: 'var(--rose)', ads: 'var(--amber)', tools: 'var(--sky)', people: 'var(--violet)', other: 'var(--indigo)' };
  let acc = 0;
  const donutStops = costByCategory.map(c => {
    const pct = totalCost > 0 ? (c.total / totalCost) * 100 : 0;
    const stop = `${costCatColors[c.id]} ${acc}% ${acc + pct}%`;
    acc += pct;
    return stop;
  });
  const donutGradient = donutStops.length > 0 ? `conic-gradient(${donutStops.join(', ')})` : 'var(--border-strong)';

  return (
    <div className="kpi-page">
      {/* Top 2-Column Editable Overview Cards: Nguồn Tiền & Cấu Trúc Chi Phí */}
      <div className="finance-overview-grid">
        <div className="finance-overview-card revenue-sources-card">
          <div className="finance-card-header">
            <div className="finance-card-title">
              <span className="page-icon-badge accent-emerald" style={{ width: 28, height: 28 }}>
                <Coins size={15} />
              </span>
              <h3>Nguồn Tiền</h3>
            </div>
            <span className="finance-edit-hint"><Edit3 size={12} /> Có thể chỉnh sửa</span>
          </div>
          <textarea
            className="finance-overview-textarea"
            rows={3}
            placeholder="Nhập chi tiết các nguồn doanh thu của mô hình này..."
            value={finance.revenueSources || ''}
            onChange={e => updateField('revenueSources', e.target.value)}
          />
        </div>

        <div className="finance-overview-card cost-structure-card">
          <div className="finance-card-header">
            <div className="finance-card-title">
              <span className="page-icon-badge accent-rose" style={{ width: 28, height: 28 }}>
                <Receipt size={15} />
              </span>
              <h3>Cấu Trúc Chi Phí</h3>
            </div>
            <span className="finance-edit-hint"><Edit3 size={12} /> Có thể chỉnh sửa</span>
          </div>
          <textarea
            className="finance-overview-textarea"
            rows={3}
            placeholder="Nhập chi tiết cấu trúc chi phí (Chi phí sản xuất, API, Ads, nhân sự...)..."
            value={finance.costStructure || ''}
            onChange={e => updateField('costStructure', e.target.value)}
          />
        </div>
      </div>

      {/* Financial Stat Cards */}
      <div className="finance-stat-grid">
        <div className="finance-stat-card">
          <div className="finance-stat-top">
            <span className="page-icon-badge accent-emerald"><Coins size={16} /></span>
            <span className="finance-stat-label">Tổng doanh thu</span>
          </div>
          <span className="finance-stat-value">{formatVND(totalRevenue)}</span>
        </div>
        <div className="finance-stat-card">
          <div className="finance-stat-top">
            <span className="page-icon-badge accent-rose"><Receipt size={16} /></span>
            <span className="finance-stat-label">Tổng chi phí</span>
          </div>
          <span className="finance-stat-value">{formatVND(totalCost)}</span>
        </div>
        <div className="finance-stat-card">
          <div className="finance-stat-top">
            <span className={`page-icon-badge ${profit >= 0 ? 'accent-indigo' : 'accent-rose'}`}>
              {profit >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            </span>
            <span className="finance-stat-label">Lợi nhuận</span>
          </div>
          <span className={`finance-stat-value ${profit >= 0 ? '' : 'negative'}`}>{formatVND(profit)}</span>
        </div>
        <div className="finance-stat-card">
          <div className="finance-stat-top">
            <span className="page-icon-badge accent-violet"><PieChart size={16} /></span>
            <span className="finance-stat-label">Tỷ suất lợi nhuận</span>
          </div>
          <span className="finance-stat-value">{marginPct}%</span>
        </div>
      </div>

      <div className="kpi-dashboard-grid">
        <div className="kpi-chart-card finance-trend-card">
          <div className="kpi-section-heading">
            <BarChart3 size={16} />
            <h3>{hasMonthlyTrend ? 'Doanh thu và chi phí theo tháng' : 'Doanh thu và chi phí'}</h3>
          </div>

          {hasMonthlyTrend ? (
            <>
              <div className="finance-monthly-chart">
                {monthlySeries.map(m => (
                  <div className="finance-month-col" key={m.key}>
                    <div className="finance-month-bars">
                      <div
                        className="finance-bar finance-bar-revenue"
                        style={{ height: `${Math.max(2, (m.revenue / maxMonthly) * 100)}%` }}
                        title={`Doanh thu ${formatMonthKey(m.key)}: ${formatVND(m.revenue)}`}
                      />
                      <div
                        className="finance-bar finance-bar-cost"
                        style={{ height: `${Math.max(2, (m.cost / maxMonthly) * 100)}%` }}
                        title={`Chi phí ${formatMonthKey(m.key)}: ${formatVND(m.cost)}`}
                      />
                    </div>
                    <span className="finance-month-label">{formatMonthKey(m.key)}</span>
                  </div>
                ))}
              </div>
              <div className="finance-chart-legend">
                <span><i className="legend-dot" style={{ background: 'var(--emerald)' }} /> Doanh thu</span>
                <span><i className="legend-dot" style={{ background: 'var(--rose)' }} /> Chi phí</span>
              </div>
            </>
          ) : (
            <div className="kr-bar-chart">
              <div className="kr-bar-row">
                <span className="kr-bar-label">Doanh thu</span>
                <div className="kr-bar-track">
                  <div className="kr-bar-fill kr-bar-done" style={{ width: `${(totalRevenue / maxBar) * 100}%` }} />
                </div>
                <span className="kr-bar-value">{formatVNDCompact(totalRevenue)}</span>
              </div>
              <div className="kr-bar-row">
                <span className="kr-bar-label">Chi phí</span>
                <div className="kr-bar-track">
                  <div className="kr-bar-fill" style={{ width: `${(totalCost / maxBar) * 100}%`, background: 'var(--rose)' }} />
                </div>
                <span className="kr-bar-value">{formatVNDCompact(totalCost)}</span>
              </div>
            </div>
          )}

          <div className="finance-profit-readout">
            {profit >= 0 ? <TrendingUp size={14} className="trend-up" /> : <TrendingDown size={14} className="trend-down" />}
            <span>Lợi nhuận ròng: <strong>{formatVND(profit)}</strong> ({marginPct}%)</span>
          </div>
        </div>

        <div className="kpi-chart-card">
          <div className="kpi-section-heading">
            <PieChart size={16} />
            <h3>Phân bổ chi phí theo mục</h3>
          </div>
          {costByCategory.length > 0 ? (
            <div className="finance-donut-wrap">
              <div className="finance-donut-chart" style={{ background: donutGradient }}>
                <div className="finance-donut-hole">
                  <span className="donut-center-val">{formatVNDCompact(totalCost)}</span>
                  <span className="donut-center-lbl">Chi phí</span>
                </div>
              </div>
              <div className="finance-donut-legend">
                {costByCategory.map(c => {
                  const pct = totalCost > 0 ? Math.round((c.total / totalCost) * 100) : 0;
                  return (
                    <div key={c.id} className="donut-legend-item">
                      <span className="legend-dot" style={{ background: costCatColors[c.id] }} />
                      <span className="legend-lbl">{c.label}</span>
                      <span className="legend-pct">{pct}%</span>
                      <span className="legend-val">{formatVNDCompact(c.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="kpi-empty-hint">Chưa có khoản chi phí nào được ghi nhận.</p>
          )}
        </div>
      </div>

      <div className="finance-tables-grid">
        <div className="asset-category-block">
          <div className="kpi-section-heading">
            <TrendingUp size={16} style={{ color: 'var(--emerald)' }} />
            <h3>Nhật ký doanh thu</h3>
            <button className="add-kr-btn" onClick={addRevenue}>
              <Plus size={13} /> Thêm khoản thu
            </button>
          </div>
          {(finance.revenues || []).length > 0 ? (
            <div className="asset-list">
              {(finance.revenues || []).map(r => (
                <div key={r.id} className="asset-card">
                  <div className="asset-card-row">
                    <input
                      type="text"
                      className="asset-name-input"
                      placeholder="Nguồn thu..."
                      value={r.source}
                      onChange={e => updateRevenue(r.id, 'source', e.target.value)}
                    />
                    <button className="asset-delete-btn" onClick={() => deleteRevenue(r.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="asset-card-row">
                    <input
                      type="number"
                      className="finance-amount-input"
                      placeholder="Số tiền (VNĐ)..."
                      value={r.amount}
                      onChange={e => updateRevenue(r.id, 'amount', e.target.value)}
                    />
                    <input
                      type="date"
                      className="finance-date-input"
                      value={r.date}
                      onChange={e => updateRevenue(r.id, 'date', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="kpi-empty-hint">Chưa ghi nhận khoản thu nào.</p>
          )}
        </div>

        <div className="asset-category-block">
          <div className="kpi-section-heading">
            <TrendingDown size={16} style={{ color: 'var(--rose)' }} />
            <h3>Nhật ký chi phí</h3>
            <button className="add-kr-btn" onClick={addCost}>
              <Plus size={13} /> Thêm khoản chi
            </button>
          </div>
          {(finance.costs || []).length > 0 ? (
            <div className="asset-list">
              {(finance.costs || []).map(c => (
                <div key={c.id} className="asset-card">
                  <div className="asset-card-row">
                    <input
                      type="text"
                      className="asset-name-input"
                      placeholder="Hạng mục chi..."
                      value={c.item}
                      onChange={e => updateCost(c.id, 'item', e.target.value)}
                    />
                    <select
                      className="asset-status-select"
                      value={c.categoryId}
                      onChange={e => updateCost(c.id, 'categoryId', e.target.value)}
                    >
                      {COST_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                    <button className="asset-delete-btn" onClick={() => deleteCost(c.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="asset-card-row">
                    <input
                      type="number"
                      className="finance-amount-input"
                      placeholder="Số tiền (VNĐ)..."
                      value={c.amount}
                      onChange={e => updateCost(c.id, 'amount', e.target.value)}
                    />
                    <input
                      type="date"
                      className="finance-date-input"
                      value={c.date}
                      onChange={e => updateCost(c.id, 'date', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="kpi-empty-hint">Chưa ghi nhận khoản chi nào.</p>
          )}
        </div>
      </div>
    </div>
  );
}
