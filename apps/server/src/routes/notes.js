import { listNotes, createNote, updateNote, deleteNote } from '../orchestrator/notesOps.js';
import { TaskOpError } from '../orchestrator/serverTaskOps.js';

const withErrorHandling = (fn) => async (request, reply) => {
  try {
    return await fn(request, reply);
  } catch (err) {
    if (err instanceof TaskOpError) return reply.code(400).send({ error: err.message });
    throw err;
  }
};

export default async function notesRoutes(fastify) {
  fastify.get('/api/notes', withErrorHandling(async (request) => {
    const { scopeType, scopeId } = request.query;
    return listNotes(scopeType, scopeId || null);
  }));

  fastify.post('/api/notes', withErrorHandling(async (request) => {
    const { scopeType, scopeId, title, content, authorPersonnelId } = request.body || {};
    return createNote(scopeType, scopeId || null, { title, content, authorPersonnelId });
  }));

  fastify.patch('/api/notes/:id', withErrorHandling(async (request) => {
    const { title, content } = request.body || {};
    return updateNote(request.params.id, { title, content });
  }));

  fastify.delete('/api/notes/:id', withErrorHandling(async (request) => {
    deleteNote(request.params.id);
    return { ok: true, id: request.params.id };
  }));
}
