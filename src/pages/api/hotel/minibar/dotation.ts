import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { deleteDotation, saveDotation } from '../../../../lib/hotel/minibar';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// La dotation se règle avec les droits du linge (direction, gouvernante) : la femme de chambre relève mais ne configure pas.
export const PUT: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const roomTypeId = toInt(b.roomTypeId, 1, 2_000_000_000);
  const itemId = toInt(b.itemId, 1, 2_000_000_000);
  const qty = toInt(b.qty, 1, 99);
  if (!roomTypeId || !itemId || !qty) return json(400, { error: 'Type de chambre, article ou quantité (1 à 99) invalide.' });
  try {
    const r = await saveDotation(roomTypeId, itemId, qty);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'minibar_dotation_save', entityType: 'item', entityId: itemId, diff: { roomTypeId, qty }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('minibar', e); }
};

export const DELETE: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const roomTypeId = toInt(b.roomTypeId, 1, 2_000_000_000);
  const itemId = toInt(b.itemId, 1, 2_000_000_000);
  if (!roomTypeId || !itemId) return json(400, { error: 'Type de chambre ou article invalide.' });
  try {
    if (!(await deleteDotation(roomTypeId, itemId))) return json(404, { error: 'Ligne inconnue.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'minibar_dotation_delete', entityType: 'item', entityId: itemId, diff: { roomTypeId }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('minibar', e); }
};
