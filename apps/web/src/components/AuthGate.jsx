import React, { useEffect, useState } from 'react';
import { Lock, Loader2, ShieldCheck } from 'lucide-react';

const THEME_KEY = 'opc-theme';

// Cổng đăng nhập thật - trước đây file này chỉ set theme rồi render thẳng
// children, route /api/auth/* phía server cũng từng là stub luôn trả về
// "đã đăng nhập" bất kể mật khẩu gì (app hoàn toàn không có bảo vệ dù giao
// diện/tài liệu mô tả là có). CSS .auth-gate-* đã có sẵn từ trước (thiết kế
// đầy đủ, chưa từng được dùng) - component này chỉ nối logic thật vào.
export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | authed | guest
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'light');
  }, []);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setStatus(data.authenticated ? 'authed' : 'guest'))
      .catch(() => setStatus('guest'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus('authed');
      } else {
        setError(data.error || 'Sai mật khẩu.');
      }
    } catch {
      setError('Không kết nối được máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="auth-gate">
        <span className="auth-gate-checking"><Loader2 className="spin" size={20} /></span>
      </div>
    );
  }

  if (status === 'guest') {
    return (
      <div className="auth-gate">
        <div className="auth-gate-backdrop" />
        <div className="auth-gate-card">
          <div className="auth-gate-logo"><Lock size={20} /></div>
          <h1>OPC Agent Ops</h1>
          <p className="auth-gate-subtitle">Nhập mật khẩu chung của team để tiếp tục.</p>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Mật khẩu"
            />
            {error && <p className="auth-gate-error">{error}</p>}
            <button type="submit" className="primary-btn auth-gate-submit" disabled={submitting || !password}>
              {submitting ? <><Loader2 className="spin" size={14} /> Đang kiểm tra...</> : 'Đăng nhập'}
            </button>
          </form>
          <p className="auth-gate-hint"><ShieldCheck size={13} /> Phiên đăng nhập được lưu 30 ngày trên thiết bị này</p>
        </div>
      </div>
    );
  }

  return children;
}
