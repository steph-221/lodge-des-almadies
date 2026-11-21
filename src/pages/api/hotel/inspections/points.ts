import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { cleanPoint, type PointInput } from '../../../../lib/hotel/inspections';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createPoints, setPerMorning } from '../../../../lib/hotel/visits';

export const prerender = false;

// Ajout d'un ou de plusieurs points à la grille de contrôle ({ points: [...] } ou un seul point).
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'inspections')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const raw = Array.isArray(b.points) ? b.points : [b];
  if (raw.length === 0 || raw.length > 60) return json(400, { error: 'Entre 1 et 60 points à la fois.' });
  const list: PointInput[] = [];
  for (const p of raw) {
    const c = cleanPoint((p ?? {}) as Record<string, unknown>);
    if (!c.ok) return json(400, { error: c.error });
    list.push(c.value);
  }
  try {
    const n = await createPoints(list);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'inspection_points_add', diff: { count: n }, ip: safeIp(() => clientAddress) });
    return json(201, { created: n });
  } catch (e) { return unavailable('inspections', e); }
};

// Nombre de visites par matin.
export const PUT: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'inspections')) return json(403, { error: 'forbidden' });
  const n = toInt((await readJson(request)).perMorning, 0, 36);
  if (n === null) return json(400, { error: 'Nombre de visites par matin : 0 à 36.' });
  try {
    await setPerMorning(n, u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'inspection_per_morning', diff: { perMorning: n }, ip: safeIp(() => clientAddress) });
    return json(200, { perMorning: n });
  } catch (e) { return unavailable('inspections', e); }
};
