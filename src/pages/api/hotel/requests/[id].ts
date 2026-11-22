import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { getRequest, setRequestStatus } from '../../../../lib/hotel/requests';
import { canTransition, isRequestStatus, servicesFor } from '../../../../lib/hotel/requests-core';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Prise en charge, fin ou annulation. Un rôle ne traite que les demandes de son service.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Demande inconnue.' });
  const b = await readJson(request);
  if (!isRequestStatus(b.status) || b.status === 'new') return json(400, { error: 'État inconnu.' });
  try {
    const cur = await getRequest(id);
    if (!cur) return json(404, { error: 'Demande inconnue.' });
    if (!servicesFor(u.role).includes(cur.service)) return json(403, { error: 'forbidden' });
    if (!canTransition(cur.status, b.status)) return json(409, { error: 'Cette demande a déjà été traitée.' });
    const r = await setRequestStatus(id, b.status, u.id, todayDakar());
    if ('error' in r) return json(r.error === 'unknown' ? 404 : 409, { error: r.error === 'unknown' ? 'Demande inconnue.' : 'Cette demande vient d’être modifiée, rechargez.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'request_' + b.status, entityType: 'request', entityId: id, diff: { chargeId: r.chargeId }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true, charged: r.chargeId !== null });
  } catch (e) { return unavailable('demandes', e); }
};
