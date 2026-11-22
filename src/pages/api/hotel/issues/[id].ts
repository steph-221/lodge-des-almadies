import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { getIssue, setIssueStatus } from '../../../../lib/hotel/issues';
import { canEdit } from '../../../../lib/hotel/permissions';
import { canIssueTransition, isIssueStatus } from '../../../../lib/hotel/requests-core';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'maintenance')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Panne inconnue.' });
  const b = await readJson(request);
  if (!isIssueStatus(b.status) || b.status === 'open') return json(400, { error: 'État inconnu.' });
  try {
    const cur = await getIssue(id);
    if (!cur) return json(404, { error: 'Panne inconnue.' });
    if (!canIssueTransition(cur.status, b.status)) return json(409, { error: 'Cette panne est déjà résolue ou dans cet état.' });
    const r = await setIssueStatus(id, b.status, u.id);
    if ('error' in r) return json(r.error === 'unknown' ? 404 : 409, { error: r.error === 'unknown' ? 'Panne inconnue.' : 'Cette panne vient d’être modifiée, rechargez.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'issue_' + b.status, entityType: 'issue', entityId: id, diff: { roomReleased: r.roomReleased }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true, roomReleased: r.roomReleased });
  } catch (e) { return unavailable('pannes', e); }
};
