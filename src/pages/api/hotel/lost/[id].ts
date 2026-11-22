import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { closeItem } from '../../../../lib/hotel/keys';
import { cleanItemClose } from '../../../../lib/hotel/keys-core';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Rendre ou éliminer un objet : définitif, une seule fois.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'keys')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Objet inconnu.' });
  const c = cleanItemClose(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await closeItem(id, c.value.status, c.value.returnedTo, u.id);
    if ('error' in r) return json(r.code, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: c.value.status === 'returned' ? 'lost_item_returned' : 'lost_item_discarded', entityType: 'lost_item', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { item: r.item });
  } catch (e) { return unavailable('objets-trouves', e); }
};
