import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, isIsoDate, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createStay, listStays } from '../../../../lib/hotel/stays';
import { todayDakar } from '../../../../lib/hotel/tasks';
import { cleanStay } from '../../../../lib/hotel/validate';

export const prerender = false;

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

// Séjours qui touchent la période (par défaut : de la veille à dans 30 jours).
export const GET: APIRoute = async ({ url }) => {
  const today = todayDakar();
  const from = url.searchParams.get('from') ?? addDays(today, -1);
  const to = url.searchParams.get('to') ?? addDays(today, 30);
  if (!isIsoDate(from) || !isIsoDate(to) || to < from || Date.parse(to) - Date.parse(from) > 400 * 86400000) return json(400, { error: 'Période invalide.' });
  try { return json(200, { stays: await listStays(from, to), from, to }); } catch (e) { return unavailable('stays', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'stays')) return json(403, { error: 'forbidden' });
  const c = cleanStay(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createStay(c.value, u.id);
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'stay_create', entityType: 'stay', entityId: r.stay.id, diff: { room: r.stay.roomNumber, arrival: r.stay.arrival, departure: r.stay.departure }, ip: safeIp(() => clientAddress) });
    return json(201, { stay: r.stay });
  } catch (e) { return unavailable('stays', e); }
};
