import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { getEvent, getEventFull, setStatus, updateEvent } from '../../../../../lib/hotel/events';
import { cleanEvent, isEventStatus } from '../../../../../lib/hotel/events-core';
import { canEdit } from '../../../../../lib/hotel/permissions';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Dossier inconnu.' });
  try {
    const full = await getEventFull(id, canEdit(locals.user!.role, 'events'));
    return full ? json(200, full) : json(404, { error: 'Dossier inconnu.' });
  } catch (e) { return unavailable('groupes', e); }
};

// Modifie les champs du dossier et/ou son statut (« status »).
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'events')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Dossier inconnu.' });
  const b = await readJson(request);
  try {
    const cur = await getEvent(id);
    if (!cur) return json(404, { error: 'Dossier inconnu.' });
    const fields = ['title', 'clientName', 'contactName', 'contactPhone', 'contactEmail', 'attendees', 'optionUntil', 'notes', 'layout', 'equipment', 'breaksNote', 'mealsNote', 'quoteNote'];
    if (fields.some((k) => k in b)) {
      const c = cleanEvent({ ...cur, optionUntil: cur.optionUntil ?? '', ...b });
      if (!c.ok) return json(400, { error: c.error });
      await updateEvent(id, c.value);
      await audit({ staffId: u.id, actor: actorOf(u), action: 'event_update', entityType: 'event', entityId: id, diff: { reference: cur.reference }, ip: safeIp(() => clientAddress) });
    }
    if (b.status !== undefined) {
      if (!isEventStatus(b.status)) return json(400, { error: 'Statut inconnu.' });
      if (b.status !== cur.status) {
        const r = await setStatus(id, b.status);
        if ('error' in r) return json(r.code, { error: r.error });
        await audit({ staffId: u.id, actor: actorOf(u), action: 'event_status', entityType: 'event', entityId: id, diff: { reference: cur.reference, from: cur.status, to: b.status }, ip: safeIp(() => clientAddress) });
      }
    }
    return json(200, { event: await getEvent(id) });
  } catch (e) { return unavailable('groupes', e); }
};
