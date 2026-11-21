import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { cleanItem } from '../../../../lib/hotel/items';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createItem, listItems } from '../../../../lib/hotel/stock';

export const prerender = false;

export const GET: APIRoute = async () => {
  try { return json(200, { items: await listItems() }); } catch (e) { return unavailable('items', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const c = cleanItem(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createItem(c.value);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'item_create', entityType: 'item', entityId: r.id, diff: { name: c.value.name, kind: c.value.kind }, ip: safeIp(() => clientAddress) });
    return json(201, { id: r.id });
  } catch (e) { return unavailable('items', e); }
};
