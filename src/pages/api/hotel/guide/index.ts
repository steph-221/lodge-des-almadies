import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createGuide, listGuide } from '../../../../lib/hotel/requests';
import { cleanGuide } from '../../../../lib/hotel/requests-core';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!canEdit(locals.user!.role, 'requests')) return json(403, { error: 'forbidden' });
  try { return json(200, { items: await listGuide(false) }); } catch (e) { return unavailable('guide', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'requests')) return json(403, { error: 'forbidden' });
  const g = cleanGuide(await readJson(request));
  if (!g.ok) return json(400, { error: g.error });
  try {
    const id = await createGuide(g.value);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'guide_create', entityType: 'guide_section', entityId: id, ip: safeIp(() => clientAddress) });
    return json(201, { id });
  } catch (e) { return unavailable('guide', e); }
};
