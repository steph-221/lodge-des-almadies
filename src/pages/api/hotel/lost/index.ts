import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { createItem, listItems } from '../../../../lib/hotel/keys';
import { cleanItem, ITEM_STATUSES, type ItemStatus } from '../../../../lib/hotel/keys-core';
import { canEdit } from '../../../../lib/hotel/permissions';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!canEdit(locals.user!.role, 'keys')) return json(403, { error: 'forbidden' });
  const s = url.searchParams.get('status') ?? 'stored';
  const status = s === 'all' ? 'all' : (ITEM_STATUSES as readonly string[]).includes(s) ? (s as ItemStatus) : null;
  if (!status) return json(400, { error: 'État inconnu.' });
  try { return json(200, { items: await listItems(status) }); } catch (e) { return unavailable('objets-trouves', e); }
};

// Périmètre « P » : la femme de chambre peut signaler un objet trouvé (elle n'en gère ni la liste ni la restitution).
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  const c = cleanItem(await readJson(request), todayDakar());
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createItem(c.value, u.id);
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'lost_item_create', entityType: 'lost_item', entityId: r.item.id, diff: { room: r.item.roomNumber }, ip: safeIp(() => clientAddress) });
    return json(201, canEdit(u.role, 'keys') ? { item: r.item } : { ok: true });
  } catch (e) { return unavailable('objets-trouves', e); }
};
