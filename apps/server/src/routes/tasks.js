import { readBoard } from './boards.js';
import {
  createTask, updateTask, deleteTask, moveTask, clearColumn, TaskOpError
} from '../orchestrator/serverTaskOps.js';
import { emitBoardChanged } from '../events.js';

// Granular, per-task endpoints - the real Phase-2 replacement for the
// Phase-0 whole-board PUT bridge (see plan §5: a whole-board PUT from a
// human's open tab would silently overwrite whatever the background worker
// just wrote to a DIFFERENT task in the same module). Each of these mutates
// exactly the row(s) the operation touches, then returns the fresh board so
// the frontend cache stays a straightforward "replace with what I got back".
const withErrorHandling = (fn) => async (request, reply) => {
  try {
    return await fn(request, reply);
  } catch (err) {
    if (err instanceof TaskOpError) return reply.code(400).send({ error: err.message });
    throw err;
  }
};

export default async function taskRoutes(fastify) {
  fastify.post('/api/modules/:id/tasks', withErrorHandling(async (request) => {
    const moduleId = request.params.id;
    const { columnId, ...data } = request.body;
    createTask(moduleId, columnId, data);
    emitBoardChanged(moduleId);
    return readBoard(moduleId);
  }));

  fastify.patch('/api/tasks/:id', withErrorHandling(async (request) => {
    const { moduleId, patch } = request.body;
    updateTask(moduleId, request.params.id, patch);
    emitBoardChanged(moduleId);
    return readBoard(moduleId);
  }));

  fastify.patch('/api/tasks/:id/move', withErrorHandling(async (request) => {
    const { moduleId, toColumnId, toIndex } = request.body;
    moveTask(moduleId, request.params.id, toColumnId, toIndex);
    emitBoardChanged(moduleId);
    return readBoard(moduleId);
  }));

  fastify.delete('/api/tasks/:id', withErrorHandling(async (request) => {
    const { moduleId } = request.body;
    deleteTask(moduleId, request.params.id);
    emitBoardChanged(moduleId);
    return readBoard(moduleId);
  }));

  fastify.post('/api/modules/:id/columns/:columnId/clear', withErrorHandling(async (request) => {
    const moduleId = request.params.id;
    clearColumn(moduleId, request.params.columnId);
    emitBoardChanged(moduleId);
    return readBoard(moduleId);
  }));
}
