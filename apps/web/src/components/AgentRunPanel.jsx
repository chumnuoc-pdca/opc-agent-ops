import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Check, X, ChevronDown, ChevronRight } from 'lucide-react';

const STATUS_LABELS = {
  queued: 'Đang chờ worker nhặt việc',
  running: 'Agent đang chạy',
  awaiting_approval: 'Chờ duyệt thao tác',
  awaiting_handoff: 'Đã bàn giao sang agent khác',
  error: 'Lỗi',
  done: 'Hoàn tất',
  aborted: 'Đã huỷ'
};

// Hiển thị trong TaskModal khi task được gán cho 1 agent (assignee.type ===
// 'agent') - trạng thái vận hành thật (không phải cột Kanban), preview +
// nút Duyệt/Từ chối khi agent đang tạm dừng chờ người duyệt tool rủi ro
// cao (R2/R3), và nhật ký đánh giá (điểm 1-10 + ghi chú) khi đã xong.
export default function AgentRunPanel({ task }) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [evalScore, setEvalScore] = useState('');
  const [evalNotes, setEvalNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const runId = task.agentRun?.runId;

  const load = useCallback(() => {
    if (!runId) return;
    setLoading(true);
    fetch(`/api/agent-runs/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        setRun(data);
        setEvalScore(data.evalScore ?? '');
        setEvalNotes(data.evalNotes ?? '');
      })
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => { load(); }, [load]);

  if (!task.assignee || task.assignee.type !== 'agent') return null;

  if (!runId) {
    return (
      <div className="agent-run-panel">
        <div className="agent-run-panel-header"><Bot size={14} /> Vận hành Agent</div>
        <p className="agent-run-panel-empty">
          Chưa có lần chạy nào - worker nền sẽ tự nhặt việc này trong giây lát.
        </p>
      </div>
    );
  }

  const handleResume = async (approved) => {
    setResuming(true);
    try {
      await fetch(`/api/tasks/${task.id}/agent-run/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });
      load();
    } finally {
      setResuming(false);
    }
  };

  const handleSaveEval = async () => {
    await fetch(`/api/agent-runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evalScore: evalScore ? Number(evalScore) : null, evalNotes })
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="agent-run-panel">
      <div className="agent-run-panel-header">
        <Bot size={14} /> Vận hành Agent — {task.agentRun.agentId}
      </div>

      {loading && !run && <p className="agent-run-panel-empty">Đang tải...</p>}

      {run && (
        <>
          <div className={`agent-run-status-row agent-run-status-${run.status}`}>
            {STATUS_LABELS[run.status] || run.status}
          </div>

          {run.errorText && <p className="agent-run-error-text">{run.errorText}</p>}

          {run.status === 'awaiting_approval' && run.pendingToolCall && (
            <div className="agent-run-approval-card">
              <p>{run.pendingToolCall.preview}</p>
              <div className="agent-run-approval-actions">
                <button type="button" className="agent-run-approve-btn" onClick={() => handleResume(true)} disabled={resuming}>
                  <Check size={13} /> Duyệt
                </button>
                <button type="button" className="agent-run-reject-btn" onClick={() => handleResume(false)} disabled={resuming}>
                  <X size={13} /> Từ chối
                </button>
              </div>
            </div>
          )}

          {(run.status === 'done' || run.status === 'awaiting_handoff') && (
            <div className="agent-run-eval-row">
              <input
                type="number" min="1" max="10" className="agent-run-eval-score"
                value={evalScore} onChange={(e) => setEvalScore(e.target.value)} placeholder="Điểm 1-10"
              />
              <input
                type="text" className="agent-run-eval-notes"
                value={evalNotes} onChange={(e) => setEvalNotes(e.target.value)} placeholder="Ghi chú đánh giá..."
              />
              <button type="button" className="agent-run-eval-save-btn" onClick={handleSaveEval}>
                {saved ? 'Đã lưu' : 'Lưu'}
              </button>
            </div>
          )}

          <button type="button" className="agent-run-transcript-toggle" onClick={() => setShowTranscript((s) => !s)}>
            {showTranscript ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Nhật ký ({run.transcript.filter((m) => m.role !== 'system').length} bước)
          </button>
          {showTranscript && (
            <div className="agent-run-transcript">
              {run.transcript.filter((m) => m.role !== 'system').map((m, i) => (
                <div key={i} className={`agent-run-transcript-line role-${m.role}`}>
                  <strong>{m.role === 'assistant' ? 'Agent' : m.role === 'tool' ? 'Kết quả tool' : 'Đầu vào'}:</strong>{' '}
                  {m.content || (m.tool_calls ? m.tool_calls.map((t) => t.function.name).join(', ') : '')}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
