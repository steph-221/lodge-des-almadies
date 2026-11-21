import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { cleanItem } from '../../../../lib/hotel/items';
import { canEdit } from '../../../../lib/hotel/permissions';
import { updateItem } from '../../../../lib/hotel/stock';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Article inconnu.' });
  const b = await readJson(request);
  const c = cleanItem(b);
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await updateItem(id, c.value, b.active !== false);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'item_update', entityType: 'item', entityId: id, diff: { name: c.value.name, active: b.active !== false }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('items', e); }
};
