import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, isIsoDate, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { storageMode } from '../../../../lib/hotel/files';
import { cleanInspection, isService, type Service } from '../../../../lib/hotel/inspections';
import { canEdit } from '../../../../lib/hotel/permissions';
import { todayDakar } from '../../../../lib/hotel/tasks';
import { createInspection, getPerMorning, history, listDefects, listPoints, morningQueue } from '../../../../lib/hotel/visits';

export const prerender = false;

// La direction voit tout (liste du matin, grille, historique, défauts). La gouvernante et la technique ne voient que
// les défauts à corriger de leur service : jamais les notes, commentaires généraux ni photos des visites.
export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user!;
  const view = url.searchParams.get('view') ?? 'defects';
  try {
    if (view === 'defects') {
      let service: Service | null = null;
      if (u.role === 'gouvernante') service = 'housekeeping';
      else if (u.role === 'technique') service = 'maintenance';
      else {
        const q = url.searchParams.get('service');
        if (q && !isService(q)) return json(400, { error: 'Service inconnu.' });
        service = q as Service | null;
      }
      const all = canEdit(u.role, 'inspections') && url.searchParams.get('all') === '1';
      return json(200, { defects: await listDefects(service, all), canFixAll: u.role === 'direction' });
    }
    if (!canEdit(u.role, 'inspections')) return json(403, { error: 'forbidden' });
    if (view === 'queue') {
      const d = url.searchParams.get('date');
      const date = d && isIsoDate(d) ? d : todayDakar();
      return json(200, { date, ...(await morningQueue(date)), storage: storageMode() });
    }
    if (view === 'points') return json(200, { points: await listPoints(), perMorning: await getPerMorning() });
    if (view === 'history') {
      const rid = url.searchParams.get('roomId');
      return json(200, { visits: await history(rid ? idParam(rid) : null) });
    }
    return json(400, { error: 'Vue inconnue.' });
  } catch (e) { return unavailable('inspections', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'inspections')) return json(403, { error: 'forbidden' });
  const c = cleanInspection(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createInspection(c.value, u.id);
    if ('error' in r) return json(400, { error: r.error });
    const defects = c.value.items.filter((i) => i.result === 'fix').length;
    await audit({ staffId: u.id, actor: actorOf(u), action: 'inspection_create', entityType: 'room_inspection', entityId: r.id, diff: { roomId: c.value.roomId, defects }, ip: safeIp(() => clientAddress) });
    return json(201, { id: r.id });
  } catch (e) { return unavailable('inspections', e); }
};
