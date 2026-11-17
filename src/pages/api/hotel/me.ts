import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';

export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const u = locals.user;
  if (!u) return json(401, { error: 'unauthorized' });
  return json(200, { id: u.id, name: u.name, role: u.role, backup: u.backup });
};
