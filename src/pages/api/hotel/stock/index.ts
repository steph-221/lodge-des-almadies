import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, isIsoDate, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { isLocation, itemExists, manualMovement, needsForDate, setInventory } from '../../../../lib/hotel/stock';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Linge et consommables à sortir pour les tâches non terminées du jour.
export const GET: APIRoute = async ({ url }) => {
  const d = url.searchParams.get('date');
  const date = d && isIsoDate(d) ? d : todayDakar();
  try { return json(200, { date, ...(await needsForDate(date)) }); } catch (e) { return unavailable('stock', e); }
};

// Mouvements manuels : inventaire (quantité comptée), réception de livraison, perte, consommation.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const itemId = toInt(b.itemId, 1, 2_000_000_000);
  const location = b.location === undefined ? 'store' : b.location;
  if (!itemId || !isLocation(location)) return json(400, { error: 'Article ou lieu inconnu.' });
  const action = b.action;
  if (action !== 'inventory' && action !== 'receipt' && action !== 'loss' && action !== 'consumption') return json(400, { error: 'Action inconnue.' });
  const qty = toInt(b.qty, action === 'inventory' ? 0 : 1, 1_000_000);
  if (qty === null) return json(400, { error: action === 'inventory' ? 'Quantité comptée invalide.' : 'Quantité invalide (entier positif).' });
  const note = typeof b.note === 'string' ? b.note.slice(0, 300) : '';
  try {
    if (!(await itemExists(itemId))) return json(404, { error: 'Article inconnu.' });
    let delta: number;
    if (action === 'inventory') delta = (await setInventory(itemId, location, qty, u.id)).delta;
    else { await manualMovement(itemId, location, qty, action, note, u.id); delta = action === 'receipt' ? qty : -qty; }
    await audit({ staffId: u.id, actor: actorOf(u), action: `stock_${action}`, entityType: 'item', entityId: itemId, diff: { location, qty, delta }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true, delta });
  } catch (e) { return unavailable('stock', e); }
};
