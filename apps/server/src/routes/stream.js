import { boardEvents } from '../events.js';

// Server-Sent Events - one-directional server→client push (the client still
// mutates via plain REST POST/PATCH/DELETE, so no need for a full
// WebSocket). Each connected tab gets every `changed` event; the client
// filters by moduleId itself (see apps/web/src/utils/liveUpdates.js).
export default async function streamRoutes(fastify) {
  fastify.get('/api/stream', (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    reply.raw.write('\n');

    const onChanged = (moduleId) => {
      reply.raw.write(`data: ${JSON.stringify({ moduleId })}\n\n`);
    };
    boardEvents.on('changed', onChanged);

    // Keep the connection alive through proxies/idle timeouts.
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 25000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      boardEvents.off('changed', onChanged);
    });
  });
}
