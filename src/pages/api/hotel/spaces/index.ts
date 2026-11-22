import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { createSpace, listSpaces } from '../../../../lib/hotel/events';
import { cleanSpace } from '../../../../lib/hotel/events-core';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

export const GET: APIRoute = async () => {
  try { return json(200, { spaces: await listSpaces() }); } catch (e) { return unavailable('salles', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'events')) return json(403, { error: 'forbidden' });
  const c = cleanSpace(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createSpace(c.value);
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'space_create', entityType: 'space', entityId: r.space.id, diff: { name: r.space.name }, ip: safeIp(() => clientAddress) });
    return json(201, { space: r.space });
  } catch (e) { return unavailable('salles', e); }
};
