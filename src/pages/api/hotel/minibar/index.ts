import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { listDotation, minibarRooms, recordReading } from '../../../../lib/hotel/minibar';
import { canEdit } from '../../../../lib/hotel/permissions';
import { listItems } from '../../../../lib/hotel/stock';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Chambres à relever, dotations par type de chambre et articles de minibar (pour l'éditeur de dotation).
export const GET: APIRoute = async ({ locals }) => {
  const u = locals.user!;
  try {
    const [rooms, dotation, items] = await Promise.all([minibarRooms(), listDotation(), listItems()]);
    return json(200, { rooms, dotation, items: items.filter((i) => i.kind === 'minibar' && i.active).map((i) => ({ id: i.id, name: i.name, price: i.price })), canConfigure: canEdit(u.role, 'linen') });
  } catch (e) { return unavailable('minibar', e); }
};

// Relevé d'une chambre : quantités restantes par article ; la consommation, la sortie de stock et l'extra en découlent.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'minibar')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const roomId = toInt(b.roomId, 1, 2_000_000_000);
  if (!roomId || !Array.isArray(b.counts)) return json(400, { error: 'Chambre ou comptage manquant.' });
  const counts: { itemId: number; counted: number }[] = [];
  for (const c of b.counts.slice(0, 100)) {
    const r = (c ?? {}) as Record<string, unknown>;
    const itemId = toInt(r.itemId, 1, 2_000_000_000);
    const counted = toInt(r.counted, 0, 99);
    if (!itemId || counted === null) return json(400, { error: 'Quantité comptée invalide.' });
    counts.push({ itemId, counted });
  }
  try {
    const r = await recordReading(roomId, counts, u.id, todayDakar());
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'minibar_reading', entityType: 'room', entityId: roomId, diff: { readingId: r.readingId, total: r.total }, ip: safeIp(() => clientAddress) });
    return json(201, r);
  } catch (e) { return unavailable('minibar', e); }
};
