import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { runMigrations } from './db/client.js';
import structureRoutes from './routes/structure.js';
import moduleCopyRoutes from './routes/moduleCopy.js';
import boardRoutes from './routes/boards.js';
import moduleKvRoutes from './routes/moduleKv.js';
import taskRoutes from './routes/tasks.js';
import timeEntriesRoutes from './routes/timeEntries.js';
import notesRoutes from './routes/notes.js';
import timeBlocksRoutes from './routes/timeBlocks.js';
import timeStatsRoutes from './routes/timeStats.js';
import orchestratorRoutes from './routes/orchestrator.js';
import agentRunRoutes from './routes/agentRuns.js';
import auditLogRoutes from './routes/auditLog.js';
import streamRoutes from './routes/stream.js';
import hrMetaRoutes from './routes/hrMeta.js';
import personnelRoutes from './routes/personnel.js';
import authRoutes, { isValidSessionToken, SESSION_COOKIE } from './routes/auth.js';
import adminRestoreRoutes from './routes/adminRestore.js';
import { loadAgentRegistry, watchAgentRegistry } from './agents-loader.js';
import { startWorker } from './worker/index.js';
import { startHrMetaSchedule } from './hrMetaAgent.js';
import { rebuildKnowledgeIndex } from './orchestrator/knowledgeIndex.js';

runMigrations();
loadAgentRegistry();
watchAgentRegistry();
// Phase 14: rebuild toàn bộ chỉ mục RAG mỗi lần khởi động - tự chữa lành,
// rẻ ở quy mô dữ liệu hiện tại (xem lý do trong knowledgeIndex.js).
rebuildKnowledgeIndex();

// Mặc định Fastify giới hạn body 1MB - cấu trúc groups/modules (PUT
// /api/structure ghi đè toàn bộ cây, xem routes/structure.js) đã vượt
// ngưỡng đó chỉ riêng phần text, nên thêm 1 ảnh bìa base64 (~200-500KB) là
// tràn giới hạn và bị 413 âm thầm (saveStructure() chỉ console.error, không
// báo người dùng) - đây là nguyên nhân thật gây lỗi "không đổi được ảnh bìa".
const fastify = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });
await fastify.register(cors, { origin: true, credentials: true });
await fastify.register(cookie);

// Chặn mọi /api/* (trừ /api/auth/* để còn đăng nhập được và /api/health để
// dễ kiểm tra server sống) nếu chưa có cookie session hợp lệ - xem plan §4.
fastify.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/api/') || request.url.startsWith('/api/auth/') || request.url === '/api/health') return;
  // Tự có token riêng (ADMIN_RESTORE_TOKEN), không cần cookie session.
  if (request.url === '/api/admin/restore-db') return;
  if (!isValidSessionToken(request.cookies?.[SESSION_COOKIE])) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

await fastify.register(authRoutes);
await fastify.register(adminRestoreRoutes);
await fastify.register(structureRoutes);
await fastify.register(moduleCopyRoutes);
await fastify.register(boardRoutes);
await fastify.register(moduleKvRoutes);
await fastify.register(taskRoutes);
await fastify.register(timeEntriesRoutes);
await fastify.register(notesRoutes);
await fastify.register(timeBlocksRoutes);
await fastify.register(timeStatsRoutes);
await fastify.register(orchestratorRoutes);
await fastify.register(agentRunRoutes);
await fastify.register(auditLogRoutes);
await fastify.register(streamRoutes);
await fastify.register(hrMetaRoutes);
await fastify.register(personnelRoutes);

startWorker();
startHrMetaSchedule();

fastify.get('/api/health', async () => ({ ok: true }));

// Phục vụ luôn bản build của giao diện web (apps/web/dist) - gộp frontend +
// backend thành 1 service duy nhất khi deploy (không cần CORS/2 domain
// riêng). Chỉ có khi ĐÃ build (`npm run build`) - lúc dev bình thường vẫn
// dùng Vite riêng như cũ, thư mục dist chưa tồn tại thì bỏ qua, không lỗi.
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  await fastify.register(fastifyStatic, { root: webDist });
  // SPA fallback: mọi route KHÔNG khớp file tĩnh/API nào (vd /modules/xyz do
  // BrowserRouter tự xử lý phía client) trả về index.html thay vì 404.
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    reply.sendFile('index.html');
  });
}

const PORT = process.env.PORT || 4001;
const HOST = process.env.HOST || '0.0.0.0';
fastify.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`OPC Agent Ops server chạy tại http://${HOST}:${PORT}`);
});
