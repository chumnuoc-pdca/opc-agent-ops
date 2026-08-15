import React from 'react';
import { Loader2, ShieldAlert, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';

// Trạng thái vận hành agent hiển thị dưới dạng badge trên thẻ - KHÔNG phải
// cột Kanban mới (xem plan §Context). "none" (chưa chạy) không hiện gì, để
// không làm rối các thẻ giao cho người hoặc agent chưa tới lượt.
export const AGENT_RUN_BADGE = {
  queued: { icon: Loader2, label: 'Đang chờ chạy', className: 'agent-run-queued', spin: true },
  running: { icon: Loader2, label: 'Agent đang chạy', className: 'agent-run-running', spin: true },
  awaiting_approval: { icon: ShieldAlert, label: 'Chờ duyệt', className: 'agent-run-awaiting-approval' },
  awaiting_handoff: { icon: Link2, label: 'Đã bàn giao', className: 'agent-run-awaiting-handoff' },
  error: { icon: AlertTriangle, label: 'Lỗi', className: 'agent-run-error' },
  done: { icon: CheckCircle2, label: 'Agent xong', className: 'agent-run-done' }
};

export default function AgentRunBadge({ agentRun, size = 11 }) {
  const meta = agentRun?.status && AGENT_RUN_BADGE[agentRun.status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`agent-run-badge ${meta.className}`} title={agentRun.error || meta.label}>
      <Icon size={size} className={meta.spin ? 'spin' : ''} /> {meta.label}
    </span>
  );
}
