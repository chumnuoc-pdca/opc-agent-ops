import { listTimeBlocksForDate, createTimeBlock, updateTimeBlock, deleteTimeBlock } from '../orchestrator/timeBlockOps.js';
import { TaskOpError } from '../orchestrator/serverTaskOps.js';

const withErrorHandling = (fn) => async (request, reply) => {
  try {
    return await fn(request, reply);
  } catch (err) {
    if (err instanceof TaskOpError) return reply.code(400).send({ error: err.message });
    throw err;
  }
};

export default async function timeBlocksRoutes(fastify) {
  fastify.get('/api/time-blocks', withErrorHandling(async (request, reply) => {
    const { date } = request.query;
    if (!date) return reply.code(400).send({ error: 'Thiếu tham số date (YYYY-MM-DD).' });
    return listTimeBlocksForDate(date);
  }));

  fastify.post('/api/time-blocks', withErrorHandling(async (request) => {
    const { taskId, startsAt, endsAt } = request.body || {};
    return createTimeBlock(taskId, startsAt, endsAt);
  }));

  fastify.patch('/api/time-blocks/:id', withErrorHandling(async (request) => {
    const { startsAt, endsAt } = request.body || {};
    return updateTimeBlock(request.params.id, { startsAt, endsAt });
  }));

  fastify.delete('/api/time-blocks/:id', withErrorHandling(async (request) => {
    deleteTimeBlock(request.params.id);
    return { ok: true, id: request.params.id };
  }));
}
