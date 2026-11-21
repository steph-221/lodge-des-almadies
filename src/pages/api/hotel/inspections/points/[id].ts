import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { cleanPoint } from '../../../../../lib/hotel/inspections';
import { canEdit } from '../../../../../lib/hotel/permissions';
import { updatePoint } from '../../../../../lib/hotel/visits';

export const prerender = false;

// Un point n'est jamais supprimé (les visites passées le citent) : on le désactive.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'inspections')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Point inconnu.' });
  const b = await readJson(request);
  const c = cleanPoint(b);
  if (!c.ok) return json(400, { error: c.error });
  try {
    if (!(await updatePoint(id, c.value, b.active !== false))) return json(404, { error: 'Point inconnu.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'inspection_point_update', entityType: 'inspection_point', entityId: id, diff: { active: b.active !== false }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('inspections', e); }
};
