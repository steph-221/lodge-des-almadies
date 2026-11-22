import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createCatalog, listCatalog } from '../../../../lib/hotel/requests';
import { cleanCatalog } from '../../../../lib/hotel/requests-core';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!canEdit(locals.user!.role, 'requests')) return json(403, { error: 'forbidden' });
  try { return json(200, { items: await listCatalog(false) }); } catch (e) { return unavailable('catalogue', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'requests')) return json(403, { error: 'forbidden' });
  const c = cleanCatalog(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const id = await createCatalog(c.value);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'catalog_create', entityType: 'request_catalog', entityId: id, ip: safeIp(() => clientAddress) });
    return json(201, { id });
  } catch (e) { return unavailable('catalogue', e); }
};
