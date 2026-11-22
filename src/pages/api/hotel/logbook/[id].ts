import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { markRead, readersOf, removeEntry, setPinned } from '../../../../lib/hotel/logbook';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Accusé de lecture : tout le personnel. Épingler, retirer, voir qui a lu : rôles à écriture complète seulement.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Message inconnu.' });
  const b = await readJson(request);
  try {
    if (b.read === true) {
      if (!(u.id > 0)) return json(409, { error: 'L’accès de secours ne laisse pas d’accusé de lecture.' });
      await markRead(id, u.id);
      return json(200, { ok: true });
    }
    if (typeof b.pinned === 'boolean') {
      if (!canEdit(u.role, 'logbook')) return json(403, { error: 'Non autorisé.' });
      if (!(await setPinned(id, b.pinned))) return json(404, { error: 'Message inconnu.' });
      await audit({ staffId: u.id, actor: actorOf(u), action: b.pinned ? 'logbook_pin' : 'logbook_unpin', entityType: 'logbook_entry', entityId: id, ip: safeIp(() => clientAddress) });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Action inconnue.' });
  } catch (e) { return unavailable('logbook', e); }
};

export const GET: APIRoute = async ({ params, locals }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Message inconnu.' });
  if (!canEdit(u.role, 'logbook')) return json(403, { error: 'Non autorisé.' });
  try { return json(200, { readers: await readersOf(id) }); } catch (e) { return unavailable('logbook', e); }
};

export const DELETE: APIRoute = async ({ params, locals, clientAddress }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Message inconnu.' });
  if (!canEdit(u.role, 'logbook')) return json(403, { error: 'Non autorisé.' });
  try {
    if (!(await removeEntry(id))) return json(404, { error: 'Message inconnu.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'logbook_remove', entityType: 'logbook_entry', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('logbook', e); }
};
