import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Send, Square, Pencil, Trash2, Bot, User, Settings as SettingsIcon, Sparkles,
  CheckCircle2, AlertTriangle, Loader2, BookMarked
} from 'lucide-react';
import { loadSessions, saveSessions, createSession, deriveTitle } from '../utils/chatStorage';
import MarkdownMessage from './MarkdownMessage';
import HeaderActions from './HeaderActions';

const TOOL_LABELS = {
  list_modules: 'Liệt kê module',
  search_tasks: 'Tìm công việc',
  get_task_detail: 'Xem chi tiết công việc',
  get_module_summary: 'Tóm tắt module',
  get_overview_summary: 'Tóm tắt workspace',
  get_upcoming_deadlines: 'Xem hạn sắp tới',
  search_knowledge: 'Tìm kiếm tri thức',
  create_task: 'Tạo công việc',
  update_task_fields: 'Cập nhật công việc',
  move_task_status: 'Chuyển trạng thái',
  set_task_blocked: 'Đánh dấu bị chặn',
  add_checklist_item: 'Thêm việc nhỏ',
  toggle_checklist_item: 'Đánh dấu việc nhỏ',
  delete_task: 'Xoá công việc',
  bulk_update_tasks: 'Cập nhật hàng loạt'
};

const ActivityIcon = ({ status }) => {
  if (status === 'running') return <Loader2 size={13} className="spin" />;
  if (status === 'done') return <CheckCircle2 size={13} />;
  if (status === 'error') return <AlertTriangle size={13} />;
  return null;
};

const STATUS_LABEL = { running: 'đang chạy', done: 'hoàn tất', error: 'lỗi' };

// Đọc response dạng SSE của POST /api/orchestrator/command/stream - lặp lại
// đúng kỹ thuật buffer/split "\n\n" đã có trong utils/aiClient.js (browser
// copy) nhưng parse envelope riêng của route này
// (delta/tool_call/tool_result/final/error) thay vì OpenAI SSE thô.
async function readEventStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIndex = buffer.indexOf('\n\n');
    while (sepIndex !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLine = rawEvent.split('\n').find(line => line.startsWith('data:'));
      if (dataLine) {
        try { onEvent(JSON.parse(dataLine.slice(5).trim())); } catch { /* bỏ qua frame lỗi/dở dang */ }
      }
      sepIndex = buffer.indexOf('\n\n');
    }
  }
}

// Gom trích dẫn từ mọi lần gọi search_knowledge trong 1 lượt trả lời, bỏ
// trùng theo nguồn (1 note/task có thể khớp nhiều lần nếu AI gọi tool lại
// với từ khoá khác).
const extractCitations = (toolActivities) => {
  const items = [];
  (toolActivities || []).forEach((a) => {
    if (a.name === 'search_knowledge' && a.status === 'done') {
      (a.result?.result?.items || []).forEach((it) => items.push(it));
    }
  });
  const seen = new Set();
  return items.filter((it) => {
    const key = `${it.sourceType}:${it.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function ChatPage({
  theme, onToggleTheme, flatModules, onOpenSettings,
  onJumpToModule, onJumpToGroup, onJumpToKnowledge
}) {
  const handleCitationClick = (citation) => {
    if (citation.navType === 'module' && citation.navId) onJumpToModule?.({ id: citation.navId });
    else if (citation.navType === 'group' && citation.navId) onJumpToGroup?.(citation.navId);
    else if (citation.navType === 'page' && citation.navId === 'knowledge') onJumpToKnowledge?.();
  };

  const [sessions, setSessions] = useState(() => {
    const saved = loadSessions();
    return saved.length > 0 ? saved : [createSession()];
  });
  const [activeId, setActiveId] = useState(() => sessions[0].id);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const activeSession = sessions.find(s => s.id === activeId) || sessions[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.messages?.length, isStreaming]);

  const updateSession = (sessionId, updater) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? updater(s) : s));
  };

  const handleNewSession = () => {
    const session = createSession();
    setSessions(prev => [session, ...prev]);
    setActiveId(session.id);
  };

  const handleDeleteSession = (sessionId) => {
    if (!window.confirm('Xoá cuộc trò chuyện này?')) return;
    setSessions(prev => {
      const next = prev.filter(s => s.id !== sessionId);
      const finalSessions = next.length > 0 ? next : [createSession()];
      if (sessionId === activeId) setActiveId(finalSessions[0].id);
      return finalSessions;
    });
  };

  const startRename = (session) => {
    setRenamingId(session.id);
    setRenameValue(session.title);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      updateSession(renamingId, s => ({ ...s, title: renameValue.trim() }));
    }
    setRenamingId(null);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !activeSession) return;
    setError('');

    const sessionId = activeSession.id;
    const userMessage = { id: `msg-${Date.now()}-u`, role: 'user', content: text };
    const assistantId = `msg-${Date.now()}-a`;
    const isFirstMessage = activeSession.messages.length === 0;
    // Lịch sử các lượt TRƯỚC tin nhắn này - server tự ghép thêm command mới
    // (xem POST /api/orchestrator/command/stream).
    const history = activeSession.messages.map(m => ({ role: m.role, content: m.content }));

    updateSession(sessionId, s => ({
      ...s,
      title: isFirstMessage ? deriveTitle(text) : s.title,
      updatedAt: Date.now(),
      messages: [...s.messages, userMessage, { id: assistantId, role: 'assistant', content: '', toolActivities: [] }]
    }));
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Tích luỹ nội dung/tool activities cục bộ rồi mới đẩy vào state theo
    // khung hình (requestAnimationFrame) - tránh re-render mỗi token nhưng
    // vẫn hiện chữ chạy dần mượt mà. `settled` chặn 1 lần flush trễ (đã lên
    // lịch trước đó) ghi đè lên trạng thái cuối cùng đã chốt qua `finalize`.
    let contentBuf = '';
    let activities = [];
    let settled = false;
    let flushScheduled = false;

    const flushNow = () => {
      updateSession(sessionId, s => ({
        ...s,
        messages: s.messages.map(m => m.id === assistantId ? { ...m, content: contentBuf, toolActivities: activities } : m)
      }));
    };
    const scheduleFlush = () => {
      if (settled || flushScheduled) return;
      flushScheduled = true;
      requestAnimationFrame(() => {
        flushScheduled = false;
        if (!settled) flushNow();
      });
    };
    const finalize = (patch) => {
      settled = true;
      updateSession(sessionId, s => ({
        ...s,
        messages: s.messages.map(m => m.id === assistantId ? { ...m, ...patch } : m)
      }));
    };

    try {
      const res = await fetch('/api/orchestrator/command/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text, history }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        finalize({ content: data.error || '_Không nhận được phản hồi từ trợ lý AI._', error: true });
      } else {
        await readEventStream(res, (event) => {
          if (event.type === 'delta') {
            contentBuf += event.text;
            scheduleFlush();
          } else if (event.type === 'tool_call') {
            activities = [...activities, { id: event.id, name: event.name, args: event.args, status: 'running' }];
            scheduleFlush();
          } else if (event.type === 'tool_result') {
            activities = activities.map(a => a.id === event.id
              ? { ...a, status: event.ok === false ? 'error' : 'done', result: event.result }
              : a);
            scheduleFlush();
          } else if (event.type === 'error') {
            finalize({ content: event.message || '_Không nhận được phản hồi từ trợ lý AI._', error: true });
          } else if (event.type === 'final') {
            if (event.status === 'error') {
              finalize({ content: event.error || '_Không nhận được phản hồi từ trợ lý AI._', error: true });
            } else if (event.status === 'awaiting_approval') {
              // ceo-orchestrator.md hiện chỉ dùng tool R0/R1 nên trạng thái
              // này không nên xảy ra - phòng hờ, không xây luồng resume
              // riêng cho Chat.
              finalize({ content: 'Agent cần duyệt một thao tác trước khi tiếp tục — hãy dùng trang Kanban để duyệt.', error: true });
            } else {
              const toolActivities = (event.toolLog || []).map(t => ({
                id: t.id, name: t.name, args: t.args, status: t.result?.ok === false ? 'error' : 'done', result: t.result
              }));
              const content = event.finalContent || (event.status === 'max_rounds'
                ? 'Đã thực hiện nhiều bước liên tiếp nên tạm dừng để tránh vòng lặp. Bạn có thể nhắn tiếp để mình tiếp tục.'
                : '_Không nhận được phản hồi từ trợ lý AI._');
              finalize({ content, toolActivities });
            }
          }
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Lỗi kết nối tới máy chủ.');
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="board-container">
      <div className="board-header">
        <div className="board-header-top">
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Trợ lý AI</span>
          </div>
          <div className="header-actions-row">
            <HeaderActions theme={theme} onToggleTheme={onToggleTheme} onJumpToModule={onJumpToModule} flatModules={flatModules} />
            <button className="icon-btn" title="Cài đặt trợ lý AI" onClick={onOpenSettings}>
              <SettingsIcon size={17} />
            </button>
          </div>
        </div>
        <div className="board-title-section">
          <div className="board-title-row">
            <span className="page-icon-badge accent-violet"><Sparkles size={18} /></span>
            <h1>Trợ lý AI</h1>
          </div>
          <p className="board-subtitle">Hỏi về công việc, mô hình kinh doanh, hoặc nhờ trợ lý tạo/cập nhật công việc thay bạn - mọi thao tác rủi ro đều được xác nhận trước khi thực hiện.</p>
        </div>
      </div>

      <div className="chat-layout">
        <div className="chat-sessions">
          <button className="chat-new-btn" onClick={handleNewSession}>
            <Plus size={15} /> Cuộc trò chuyện mới
          </button>
          <div className="chat-session-list">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`chat-session-item ${session.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(session.id)}
              >
                {renamingId === session.id ? (
                  <input
                    className="chat-session-rename-input"
                    autoFocus
                    value={renameValue}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); }}
                  />
                ) : (
                  <span className="chat-session-title">{session.title}</span>
                )}
                <div className="chat-session-actions" onClick={e => e.stopPropagation()}>
                  <button onClick={() => startRename(session)} title="Đổi tên"><Pencil size={12} /></button>
                  <button onClick={() => handleDeleteSession(session.id)} title="Xoá"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chat-main">
          <div className="chat-messages" ref={scrollRef}>
            {(!activeSession || activeSession.messages.length === 0) && (
              <div className="chat-empty-state">
                <span className="page-icon-badge accent-violet lg"><Sparkles size={26} /></span>
                <p>Hỏi trợ lý AI về công việc, mô hình kinh doanh, hoặc nhờ trợ lý tạo/cập nhật công việc thay bạn.</p>
              </div>
            )}
            {activeSession?.messages.map(message => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                <div className="chat-message-avatar">
                  {message.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                </div>
                <div className="chat-message-stack">
                  {message.toolActivities?.length > 0 && (
                    <div className="tool-activity-list">
                      {message.toolActivities.map(activity => (
                        <div key={activity.id} className={`tool-activity-item status-${activity.status}`}>
                          <ActivityIcon status={activity.status} />
                          <span className="tool-activity-label">{TOOL_LABELS[activity.name] || activity.name}</span>
                          <span className="tool-activity-status">{STATUS_LABEL[activity.status]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={`chat-message-bubble ${message.error ? 'error' : ''}`}>
                    {message.content ? (
                      <MarkdownMessage content={message.content} />
                    ) : !message.toolActivities?.length ? (
                      <span className="chat-typing-dots"><span /><span /><span /></span>
                    ) : null}
                  </div>
                  {message.role === 'assistant' && extractCitations(message.toolActivities).length > 0 && (
                    <div className="chat-citations">
                      <span className="chat-citations-label"><BookMarked size={11} /> Nguồn:</span>
                      {extractCitations(message.toolActivities).map(c => (
                        <button
                          key={`${c.sourceType}:${c.sourceId}`}
                          type="button"
                          className="chat-citation-chip"
                          disabled={!c.navType}
                          onClick={() => handleCitationClick(c)}
                          title={c.snippet}
                        >
                          {c.title || '(không tiêu đề)'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="chat-error-banner">{error}</div>}

          <div className="chat-input-row">
            <textarea
              className="chat-input"
              rows={1}
              value={input}
              placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter để xuống dòng)"
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button className="chat-send-btn stop" onClick={handleStop}>
                <Square size={15} /> Dừng
              </button>
            ) : (
              <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
                <Send size={15} /> Gửi
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
