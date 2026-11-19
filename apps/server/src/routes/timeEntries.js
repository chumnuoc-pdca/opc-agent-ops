import {
  startTimer, stopTimer, getActiveEntryForPersonnel, listTimeEntriesForTask
} from '../orchestrator/timeTrackingOps.js';
import { TaskOpError } from '../orchestrator/serverTaskOps.js';
import { emitBoardChanged } from '../events.js';

const withErrorHandling = (fn) => async (request, reply) => {
  try {
    return await fn(request, reply);
  } catch (err) {
    if (err instanceof TaskOpError) return reply.code(400).send({ error: err.message });
    throw err;
  }
};

export default async function timeEntriesRoutes(fastify) {
  fastify.post('/api/tasks/:id/timer/start', withErrorHandling(async (request) => {
    const { personnelId } = request.body || {};
    if (!personnelId) throw new TaskOpError('Thiếu personnelId.');
    const result = startTimer(request.params.id, personnelId);
    emitBoardChanged(result.task.moduleId);
    if (result.previousTask) emitBoardChanged(result.previousTask.moduleId);
    return result;
  }));

  fastify.post('/api/timer/stop', withErrorHandling(async (request) => {
    const { personnelId } = request.body || {};
    if (!personnelId) throw new TaskOpError('Thiếu personnelId.');
    const result = stopTimer(personnelId);
    emitBoardChanged(result.task.moduleId);
    return result;
  }));

  fastify.get('/api/personnel/:id/active-entry', async (request) => {
    return getActiveEntryForPersonnel(request.params.id);
  });

  fastify.get('/api/tasks/:id/time-entries', async (request) => {
    return listTimeEntriesForTask(request.params.id);
  });
}
