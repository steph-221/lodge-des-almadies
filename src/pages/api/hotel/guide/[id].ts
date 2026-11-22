import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { updateGuide } from '../../../../lib/hotel/requests';
import { cleanGuide } from '../../../../lib/hotel/requests-core';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'requests')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Rubrique inconnue.' });
  const b = await readJson(request);
  const g = cleanGuide(b);
  if (!g.ok) return json(400, { error: g.error });
  try {
    if (!(await updateGuide(id, g.value, b.active !== false))) return json(404, { error: 'Rubrique inconnue.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'guide_update', entityType: 'guide_section', entityId: id, diff: { active: b.active !== false }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('guide', e); }
};
