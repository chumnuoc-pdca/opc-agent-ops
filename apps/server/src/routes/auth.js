import crypto from 'node:crypto';
import { db } from '../db/client.js';
import { APP_PASSWORD } from '../config.js';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

// Chuẩn bị statement LÚC GỌI (không phải lúc import module) - runMigrations()
// chạy trong index.js's body, còn import các route file (kể cả file này)
// được ESM chạy trước đó, nên prepare() ở top-level sẽ lỗi "no such table"
// với bảng mới tinh chưa từng có trong data/opc.db.
let stmts = null;
const getStmts = () => {
  if (!stmts) {
    stmts = {
      insertSession: db.prepare('INSERT INTO auth_sessions (token, created_at, expires_at) VALUES (?, ?, ?)'),
      deleteSession: db.prepare('DELETE FROM auth_sessions WHERE token = ?'),
      findValidSession: db.prepare('SELECT token FROM auth_sessions WHERE token = ? AND expires_at > ?')
    };
  }
  return stmts;
};

// So sánh hằng thời gian, tránh lộ độ dài/nội dung mật khẩu qua thời gian phản hồi.
const passwordMatches = (candidate) => {
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(APP_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const isValidSessionToken = (token) => {
  if (!token) return false;
  const row = getStmts().findValidSession.get(token, Date.now());
  return Boolean(row);
};

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const { password } = request.body || {};
    if (!passwordMatches(password)) {
      reply.code(401);
      return { ok: false, error: 'Sai mật khẩu' };
    }
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    getStmts().insertSession.run(token, now, now + SESSION_TTL_MS);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS / 1000
    });
    return { ok: true };
  });

  fastify.get('/api/auth/me', async (request) => ({
    authenticated: isValidSessionToken(request.cookies?.[SESSION_COOKIE])
  }));

  fastify.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) getStmts().deleteSession.run(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}

export { SESSION_COOKIE };
