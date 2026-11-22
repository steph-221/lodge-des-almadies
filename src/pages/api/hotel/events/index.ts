import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, isIsoDate, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { calendar, createEvent, listEvents, listSpaces } from '../../../../lib/hotel/events';
import { cleanEvent, isEventStatus, type EventStatus } from '../../../../lib/hotel/events-core';
import { canEdit } from '../../../../lib/hotel/permissions';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

// Liste des dossiers (?status=option,confirmed) ou calendrier des salles (?view=calendar&from=…&to=…).
// Prix et noms de clients : direction et réception seulement.
export const GET: APIRoute = async ({ url, locals }) => {
  const money = canEdit(locals.user!.role, 'events');
  try {
    if (url.searchParams.get('view') === 'calendar') {
      const today = todayDakar();
      const from = url.searchParams.get('from') ?? addDays(today, -7);
      const to = url.searchParams.get('to') ?? addDays(today, 60);
      if (!isIsoDate(from) || !isIsoDate(to) || to < from || Date.parse(to) - Date.parse(from) > 400 * 86400000) return json(400, { error: 'Période invalide.' });
      const slots = (await calendar(from, to)).map((s) => (money ? s : { ...s, clientName: '' }));
      return json(200, { slots, spaces: await listSpaces(), from, to });
    }
    const raw = url.searchParams.get('status');
    const statuses = raw ? (raw.split(',').filter(isEventStatus) as EventStatus[]) : null;
    const events = (await listEvents(statuses && statuses.length ? statuses : null)).map((e) => (money ? e : { ...e, clientName: '', total: 0 }));
    return json(200, { events, money });
  } catch (e) { return unavailable('groupes', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'events')) return json(403, { error: 'forbidden' });
  const c = cleanEvent(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const ev = await createEvent(c.value, Number(todayDakar().slice(0, 4)), u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'event_create', entityType: 'event', entityId: ev.id, diff: { reference: ev.reference }, ip: safeIp(() => clientAddress) });
    return json(201, { event: ev });
  } catch (e) { return unavailable('groupes', e); }
};
