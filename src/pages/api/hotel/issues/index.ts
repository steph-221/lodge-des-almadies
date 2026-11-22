import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { activeRoomList, createIssue, listIssues } from '../../../../lib/hotel/issues';
import { appOrigin, notifyService } from '../../../../lib/hotel/notify';
import { canEdit } from '../../../../lib/hotel/permissions';
import { cleanIssue } from '../../../../lib/hotel/requests-core';

export const prerender = false;

// Tout le personnel voit les pannes ouvertes et peut en signaler ; seuls les rôles en écriture complète font avancer ou bloquent une chambre.
export const GET: APIRoute = async ({ locals }) => {
  const u = locals.user!;
  try {
    const [issues, rooms] = await Promise.all([listIssues(), activeRoomList()]);
    return json(200, { issues, rooms, canManage: canEdit(u.role, 'maintenance') });
  } catch (e) { return unavailable('pannes', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress, url }) => {
  const u = locals.user!;
  const c = cleanIssue(await readJson(request), canEdit(u.role, 'maintenance'));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createIssue(c.value, u.id);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'issue_create', entityType: 'issue', entityId: r.id, diff: { roomId: c.value.roomId, priority: c.value.priority, blocks: c.value.blocksRoom }, ip: safeIp(() => clientAddress) });
    await notifyService('technique', 'issue', { room: r.roomNumber, title: c.value.title, priority: c.value.priority }, appOrigin(url.origin));
    return json(201, { id: r.id });
  } catch (e) { return unavailable('pannes', e); }
};
