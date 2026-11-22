import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { listSpaces, updateSpace } from '../../../../lib/hotel/events';
import { cleanSpace } from '../../../../lib/hotel/events-core';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Renommer, changer la capacité, ou retirer / remettre une salle (pas de suppression : l'historique des dossiers reste).
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'events')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Salle inconnue.' });
  const b = await readJson(request);
  try {
    const cur = (await listSpaces()).find((s) => s.id === id);
    if (!cur) return json(404, { error: 'Salle inconnue.' });
    const c = cleanSpace({ name: cur.name, capacity: cur.capacity, ...b });
    if (!c.ok) return json(400, { error: c.error });
    const r = await updateSpace(id, { ...c.value, active: typeof b.active === 'boolean' ? b.active : cur.active });
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'space_update', entityType: 'space', entityId: id, diff: { name: r.space.name, active: r.space.active }, ip: safeIp(() => clientAddress) });
    return json(200, { space: r.space });
  } catch (e) { return unavailable('salles', e); }
};
