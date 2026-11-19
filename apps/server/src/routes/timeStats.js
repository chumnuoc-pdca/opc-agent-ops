import { getTimeStats } from '../orchestrator/timeStatsOps.js';

export default async function timeStatsRoutes(fastify) {
  fastify.get('/api/time-stats', async (request, reply) => {
    const { from, to, groupId } = request.query;
    if (!from || !to) return reply.code(400).send({ error: 'Thiếu tham số from/to (YYYY-MM-DD).' });
    const fromMs = new Date(`${from}T00:00:00`).getTime();
    const toMs = new Date(`${to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return reply.code(400).send({ error: 'from/to không hợp lệ.' });
    return getTimeStats({ fromMs, toMs, groupId: groupId || null });
  });
}
