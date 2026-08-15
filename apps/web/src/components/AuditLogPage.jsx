import React, { useEffect, useState } from 'react';
import { ScrollText, CheckCircle2, XCircle, Star } from 'lucide-react';
import HeaderActions from './HeaderActions';
import AgentRunBadge from './AgentRunBadge';

const RISK_LABEL = { R0: 'Tự động', R1: 'Rủi ro thấp', R2: 'Cần xác nhận', R3: 'Rủi ro cao', R4: 'Bị chặn (không qua AI)' };

const formatWhen = (ts) => new Date(ts).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

const jsonFetch = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
};

// Hàng "Đánh giá Agent Run" - 1 dòng/1 lần agent chạy thật (khác audit log
// vốn là 1 dòng/1 tool call), cho phép chấm điểm + ghi chú ngay tại chỗ
// (plan §6: "Nhật ký đánh giá" = agent_runs.eval_score/eval_notes).
function EvalRunRow({ run, onSaved }) {
  const [score, setScore] = useState(run.evalScore ?? '');
  const [notes, setNotes] = useState(run.evalNotes ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = score !== (run.evalScore ?? '') || notes !== (run.evalNotes ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await jsonFetch(`/api/agent-runs/${encodeURIComponent(run.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evalScore: score === '' ? null : Number(score), evalNotes: notes })
      });
      onSaved(run.id, { evalScore: score === '' ? null : Number(score), evalNotes: notes });
    } catch (err) {
      window.alert(`Lưu đánh giá thất bại: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="eval-run-item">
      <div className="eval-run-top">
        <span className="task-code-chip accent-indigo">{run.taskCode || run.taskId}</span>
        <AgentRunBadge agentRun={{ status: run.status }} />
        <span className="eval-run-agent">{run.agentId}</span>
        <span className="eval-run-when">{formatWhen(run.createdAt)}</span>
      </div>
      <div className="eval-run-content">{run.taskContent}</div>
      {run.errorText && <div className="audit-log-error">Lỗi: {run.errorText}</div>}
      <div className="eval-run-fields">
        <label className="eval-score-field">
          <Star size={13} /> Điểm (1-10)
          <input
            type="number"
            min={1}
            max={10}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="eval-score-input"
          />
        </label>
        <input
          type="text"
          placeholder="Ghi chú đánh giá (vd: đúng rule, thiếu số liệu, cần sửa prompt...)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="eval-notes-input"
        />
        <button className="eval-save-btn" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? 'Đang lưu...' : 'Lưu đánh giá'}
        </button>
      </div>
    </div>
  );
}

export default function AuditLogPage({ theme, onToggleTheme, flatModules, onJumpToModule }) {
  const [tab, setTab] = useState('actions'); // 'actions' | 'evals'
  const [log, setLog] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      jsonFetch('/api/audit-log').catch(() => []),
      jsonFetch('/api/agent-runs').catch(() => [])
    ]).then(([auditRows, runRows]) => {
      setLog(auditRows);
      setRuns(runRows);
      setLoading(false);
    });
  }, []);

  const handleRunSaved = (runId, patch) => {
    setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, ...patch } : r)));
  };

  const successCount = log.filter((e) => e.status === 'success').length;
  const errorCount = log.filter((e) => e.status === 'error').length;
  const scoredCount = runs.filter((r) => r.evalScore != null).length;
  const avgScore = scoredCount
    ? (runs.reduce((s, r) => s + (r.evalScore || 0), 0) / scoredCount).toFixed(1)
    : '—';

  return (
    <div className="board-container">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Nhật ký AI</span>
          </div>
          <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
        </div>
        <div className="board-title-section">
          <div className="board-title-row">
            <span className="page-icon-badge accent-sky"><ScrollText size={18} /></span>
            <h1>Nhật ký AI</h1>
          </div>
          <p className="board-subtitle">
            Nhật ký hành động thật của agent (mọi thao tác sửa/xoá/chuyển trạng thái) và nhật ký đánh giá từng lần agent chạy.
          </p>
        </div>

        <div className="view-toggles-row">
          <div className="view-toggles">
            <button className={`view-btn ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>
              <ScrollText size={16} /> Nhật ký hành động
            </button>
            <button className={`view-btn ${tab === 'evals' ? 'active' : ''}`} onClick={() => setTab('evals')}>
              <Star size={16} /> Đánh giá Agent Run
            </button>
          </div>
        </div>

        {tab === 'actions' && log.length > 0 && (
          <div className="audit-log-stat-row">
            <div className="audit-log-stat-chip accent-indigo">
              <span className="audit-log-stat-value">{log.length}</span>
              <span className="audit-log-stat-label">Tổng hành động</span>
            </div>
            <div className="audit-log-stat-chip accent-emerald">
              <span className="audit-log-stat-value">{successCount}</span>
              <span className="audit-log-stat-label">Thành công</span>
            </div>
            <div className="audit-log-stat-chip accent-rose">
              <span className="audit-log-stat-value">{errorCount}</span>
              <span className="audit-log-stat-label">Lỗi</span>
            </div>
          </div>
        )}

        {tab === 'evals' && runs.length > 0 && (
          <div className="audit-log-stat-row">
            <div className="audit-log-stat-chip accent-indigo">
              <span className="audit-log-stat-value">{runs.length}</span>
              <span className="audit-log-stat-label">Tổng lượt chạy</span>
            </div>
            <div className="audit-log-stat-chip accent-emerald">
              <span className="audit-log-stat-value">{scoredCount}</span>
              <span className="audit-log-stat-label">Đã chấm điểm</span>
            </div>
            <div className="audit-log-stat-chip accent-rose">
              <span className="audit-log-stat-value">{avgScore}</span>
              <span className="audit-log-stat-label">Điểm TB</span>
            </div>
          </div>
        )}
      </div>

      <div className="audit-log-scroll">
        {loading ? (
          <div className="chat-empty-state">Đang tải nhật ký...</div>
        ) : tab === 'actions' ? (
          log.length === 0 ? (
            <div className="chat-empty-state">
              <span className="page-icon-badge accent-sky lg"><ScrollText size={26} /></span>
              <p>Chưa có hành động nào được agent thực hiện. Mọi thao tác sửa/xoá/chuyển trạng thái công việc do agent thực hiện sẽ được ghi lại tại đây.</p>
            </div>
          ) : (
            <div className="audit-log-list">
              {log.map((entry) => (
                <div key={entry.id} className={`audit-log-item status-${entry.status}`}>
                  <div className="audit-log-item-icon">
                    {entry.status === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  </div>
                  <div className="audit-log-item-body">
                    <div className="audit-log-item-top">
                      <span className="audit-log-summary">{entry.summary}</span>
                      {entry.riskLevel && <span className={`risk-badge risk-${entry.riskLevel}`}>{entry.riskLevel}</span>}
                    </div>
                    <div className="audit-log-item-meta">
                      <span>{formatWhen(entry.createdAt)}</span>
                      <span>·</span>
                      <span>{RISK_LABEL[entry.riskLevel] || entry.riskLevel || '—'}</span>
                      <span>·</span>
                      <span>{entry.actorType === 'agent' ? 'Agent thực hiện' : entry.actorType}</span>
                      {entry.taskCode && (
                        <>
                          <span>·</span>
                          <span>{entry.taskCode}</span>
                        </>
                      )}
                    </div>
                    {entry.status === 'error' && (
                      <div className="audit-log-error">Thất bại: {entry.error}</div>
                    )}
                    {entry.before && (
                      <div className="audit-log-diff">
                        <span>Trước đó:</span>
                        <span className="audit-log-diff-before">{entry.before.content}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : runs.length === 0 ? (
          <div className="chat-empty-state">
            <span className="page-icon-badge accent-sky lg"><Star size={26} /></span>
            <p>Chưa có lượt agent nào chạy xong để đánh giá.</p>
          </div>
        ) : (
          <div className="audit-log-list">
            {runs.map((run) => (
              <EvalRunRow key={run.id} run={run} onSaved={handleRunSaved} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
