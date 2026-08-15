import { runHrMetaScan } from '../hrMetaAgent.js';

// Kích hoạt thủ công 1 lượt quét HR meta-agent - dùng để kiểm chứng/demo ngay
// thay vì đợi lịch định kỳ (mặc định 7 ngày, xem hrMetaAgent.js).
export default async function hrMetaRoutes(fastify) {
  fastify.post('/api/hr-meta/run', async (request, reply) => {
    try {
      const { candidates, result } = await runHrMetaScan();
      return { candidates, status: result.status, roundCount: result.roundCount };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
