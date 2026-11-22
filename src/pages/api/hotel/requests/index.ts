import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { activeRoomList, openIssuesCount } from '../../../../lib/hotel/issues';
import { appOrigin, notifyService } from '../../../../lib/hotel/notify';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createRequest, listCatalog, listRequests, summary } from '../../../../lib/hotel/requests';
import { servicesFor } from '../../../../lib/hotel/requests-core';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Chaque rôle ne voit que les demandes de son périmètre (direction et réception : toutes).
export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user!;
  const services = servicesFor(u.role);
  try {
    if (url.searchParams.get('summary') === '1') {
      const [s, issues] = await Promise.all([summary(services), openIssuesCount()]);
      return json(200, { ...s, openIssues: issues });
    }
    const [requests, catalog, rooms] = await Promise.all([listRequests(services), listCatalog(true), activeRoomList()]);
    return json(200, {
      requests, rooms, services,
      catalog: catalog.filter((c) => services.includes(c.service)),
      canManage: canEdit(u.role, 'requests'), canSettings: canEdit(u.role, 'settings'),
    });
  } catch (e) { return unavailable('demandes', e); }
};

// Saisie par le personnel au nom d'une chambre (appel téléphonique, demande au comptoir).
export const POST: APIRoute = async ({ request, locals, clientAddress, url }) => {
  const u = locals.user!;
  const b = await readJson(request);
  const roomId = toInt(b.roomId, 1, 2_000_000_000);
  const catalogId = toInt(b.catalogId, 1, 2_000_000_000);
  const qty = toInt(b.qty ?? 1, 1, 20);
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (!roomId || !catalogId || !qty) return json(400, { error: 'Chambre, demande ou quantité manquante.' });
  if (note.length > 300) return json(400, { error: 'Précision trop longue (300 caractères maximum).' });
  try {
    const item = (await listCatalog(true)).find((c) => c.id === catalogId);
    if (!item) return json(400, { error: 'Demande inconnue.' });
    if (!servicesFor(u.role).includes(item.service)) return json(403, { error: 'Cette demande ne relève pas de votre service.' });
    const r = await createRequest({ roomId, catalogId, qty, note, source: 'staff', lang: 'fr' }, u.id, todayDakar());
    if ('error' in r) return json(400, { error: r.error === 'note_required' ? 'Cette demande exige une précision.' : 'Chambre ou demande inconnue.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'request_create', entityType: 'request', entityId: r.id, diff: { roomId, catalogId, qty }, ip: safeIp(() => clientAddress) });
    await notifyService(r.service, 'request', { room: r.roomNumber, title: r.label, qty, note }, appOrigin(url.origin));
    return json(201, { id: r.id });
  } catch (e) { return unavailable('demandes', e); }
};
