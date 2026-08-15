import { db } from '../db/client.js';

export function rowToPersonnel(row) {
  return {
    id: row.id,
    type: row.type || 'human',
    name: row.name,
    role: row.role || '',
    email: row.email || null,
    avatarUrl: row.avatar_url || null,
    skills: row.skills || '',
    projectIds: JSON.parse(row.project_ids_json || '[]'),
    status: row.status || 'active',
    createdAt: row.created_at
  };
}

export default async function personnelRoutes(fastify) {
  // GET /api/personnel
  fastify.get('/api/personnel', async () => {
    const rows = db.prepare('SELECT * FROM personnel ORDER BY type ASC, created_at DESC').all();
    return rows.map(rowToPersonnel);
  });

  // POST /api/personnel
  fastify.post('/api/personnel', async (request, reply) => {
    const { type, name, role, email, avatarUrl, skills, projectIds, status } = request.body || {};
    if (!name || !name.trim()) {
      return reply.code(400).send({ error: 'Tên nhân sự không được để trống.' });
    }
    const id = `p-${type === 'agent' ? 'a' : 'h'}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const createdAt = Date.now();
    const payload = {
      id,
      type: type === 'agent' ? 'agent' : 'human',
      name: name.trim(),
      role: (role || '').trim(),
      email: email ? email.trim() : null,
      avatar_url: avatarUrl || null,
      skills: (skills || '').trim(),
      project_ids_json: JSON.stringify(projectIds || []),
      status: status || 'active',
      created_at: createdAt
    };

    db.prepare(`
      INSERT INTO personnel (id, type, name, role, email, avatar_url, skills, project_ids_json, status, created_at)
      VALUES (@id, @type, @name, @role, @email, @avatar_url, @skills, @project_ids_json, @status, @created_at)
    `).run(payload);

    const row = db.prepare('SELECT * FROM personnel WHERE id = ?').get(id);
    return rowToPersonnel(row);
  });

  // PUT /api/personnel/:id
  fastify.put('/api/personnel/:id', async (request, reply) => {
    const { id } = request.params;
    const { type, name, role, email, avatarUrl, skills, projectIds, status } = request.body || {};
    const existing = db.prepare('SELECT * FROM personnel WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Không tìm thấy nhân sự.' });
    }

    const payload = {
      id,
      type: type || existing.type,
      name: name !== undefined ? name.trim() : existing.name,
      role: role !== undefined ? role.trim() : existing.role,
      email: email !== undefined ? (email ? email.trim() : null) : existing.email,
      avatar_url: avatarUrl !== undefined ? avatarUrl : existing.avatar_url,
      skills: skills !== undefined ? skills.trim() : existing.skills,
      project_ids_json: projectIds !== undefined ? JSON.stringify(projectIds) : existing.project_ids_json,
      status: status || existing.status
    };

    db.prepare(`
      UPDATE personnel SET
        type = @type,
        name = @name,
        role = @role,
        email = @email,
        avatar_url = @avatar_url,
        skills = @skills,
        project_ids_json = @project_ids_json,
        status = @status
      WHERE id = @id
    `).run(payload);

    const row = db.prepare('SELECT * FROM personnel WHERE id = ?').get(id);
    return rowToPersonnel(row);
  });

  // DELETE /api/personnel/:id
  fastify.delete('/api/personnel/:id', async (request, reply) => {
    const { id } = request.params;
    const existing = db.prepare('SELECT 1 FROM personnel WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Không tìm thấy nhân sự.' });
    }
    db.prepare('DELETE FROM personnel WHERE id = ?').run(id);
    return { ok: true, id };
  });
}
