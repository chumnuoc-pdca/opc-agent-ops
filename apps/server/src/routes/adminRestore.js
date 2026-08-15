import crypto from 'node:crypto';
import { writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { db, DB_PATH } from '../db/client.js';

// Đường dẫn TẠM THỜI để chuyển nguyên file SQLite thật (opc.db) từ máy dev
// lên volume của server đã deploy (Railway/Fly.io) - chỉ dùng 1 lần lúc mới
// deploy, không phải API vận hành lâu dài. Route này KHÔNG đăng ký nếu chưa
// set biến môi trường ADMIN_RESTORE_TOKEN - xoá/bỏ biến đó (rồi redeploy)
// là tắt hẳn tính năng này, không cần sửa code.
const tokenMatches = (candidate) => {
  const token = process.env.ADMIN_RESTORE_TOKEN;
  if (!token) return false;
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export default async function adminRestoreRoutes(fastify) {
  if (!process.env.ADMIN_RESTORE_TOKEN) return;

  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (request, body, done) => {
    done(null, body);
  });

  fastify.post('/api/admin/restore-db', async (request, reply) => {
    if (!tokenMatches(request.headers['x-restore-token'])) {
      reply.code(401);
      return { ok: false, error: 'Sai token' };
    }
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      reply.code(400);
      return { ok: false, error: 'Thiếu nội dung file' };
    }

    const incomingPath = `${DB_PATH}.incoming`;
    writeFileSync(incomingPath, request.body);

    // Trả lời trước rồi mới đổi file thật + thoát tiến trình - đảm bảo
    // client nhận được phản hồi thành công trước khi server restart.
    reply.send({ ok: true, message: `Đã nhận ${request.body.length} bytes, server sẽ khởi động lại để áp dụng.` });

    setTimeout(() => {
      db.close();
      renameSync(incomingPath, DB_PATH);
      // File .db mới là 1 file gọn (đã checkpoint ở máy nguồn trước khi gửi)
      // - xoá -wal/-shm cũ để tránh SQLite đọc nhầm dữ liệu WAL cũ không còn
      // khớp với file .db vừa thay.
      for (const suffix of ['-wal', '-shm']) {
        const p = `${DB_PATH}${suffix}`;
        if (existsSync(p)) unlinkSync(p);
      }
      process.exit(1);
    }, 300);
  });
}
