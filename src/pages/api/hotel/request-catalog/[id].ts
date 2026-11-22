import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { updateCatalog } from '../../../../lib/hotel/requests';
import { cleanCatalog } from '../../../../lib/hotel/requests-core';

export const prerender = false;

// Pas de suppression physique : on désactive (« active: false »), les demandes passées gardent leur libellé.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'requests')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Demande inconnue.' });
  const b = await readJson(request);
  const c = cleanCatalog(b);
  if (!c.ok) return json(400, { error: c.error });
  try {
    if (!(await updateCatalog(id, c.value, b.active !== false))) return json(404, { error: 'Demande inconnue.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'catalog_update', entityType: 'request_catalog', entityId: id, diff: { active: b.active !== false }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('catalogue', e); }
};
