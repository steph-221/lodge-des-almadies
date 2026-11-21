import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { cancelStay, getStay, updateStay } from '../../../../lib/hotel/stays';
import { cleanStay } from '../../../../lib/hotel/validate';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'stays')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Séjour inconnu.' });
  const b = await readJson(request);
  try {
    const cur = await getStay(id);
    if (!cur || cur.status !== 'booked') return json(404, { error: 'Séjour inconnu ou annulé.' });
    const c = cleanStay({
      roomId: cur.roomId, guestName: cur.guestName, guests: cur.guests, arrival: cur.arrival, departure: cur.departure,
      arrivalTime: cur.arrivalTime ?? '', extraBed: cur.extraBed, babyCot: cur.babyCot, notes: cur.notes, externalId: cur.externalId ?? '', ...b,
    });
    if (!c.ok) return json(400, { error: c.error });
    const r = await updateStay(id, c.value);
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'stay_update', entityType: 'stay', entityId: id, diff: { room: r.stay.roomNumber, arrival: r.stay.arrival, departure: r.stay.departure }, ip: safeIp(() => clientAddress) });
    return json(200, { stay: r.stay });
  } catch (e) { return unavailable('stays', e); }
};

// Annulation (pas de suppression physique : l'historique reste).
export const DELETE: APIRoute = async ({ params, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'stays')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Séjour inconnu.' });
  try {
    if (!(await cancelStay(id))) return json(404, { error: 'Séjour inconnu ou déjà annulé.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'stay_cancel', entityType: 'stay', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('stays', e); }
};
