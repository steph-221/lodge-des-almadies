import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { itemExists, listPrepLines, savePrepLine } from '../../../../lib/hotel/stock';

export const prerender = false;

export const GET: APIRoute = async () => {
  try { return json(200, { lines: await listPrepLines() }); } catch (e) { return unavailable('templates', e); }
};

// Une ligne de gabarit : type de chambre (vide = tous), nature, occupation (vide = toutes), condition, article, quantité.
// Une ligne existante pour la même combinaison est remplacée.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const empty = (v: unknown) => v === undefined || v === null || v === '';
  const kind = b.kind;
  if (kind !== 'depart' && kind !== 'recouche') return json(400, { error: 'Nature inconnue (départ ou recouche).' });
  const itemId = toInt(b.itemId, 1, 2_000_000_000);
  const qty = toInt(b.qty, 0, 999);
  const roomTypeId = empty(b.roomTypeId) ? null : toInt(b.roomTypeId, 1, 2_000_000_000);
  const occupancy = empty(b.occupancy) ? null : toInt(b.occupancy, 1, 8);
  const cond = empty(b.cond) ? null : b.cond;
  if (!itemId || qty === null) return json(400, { error: 'Article ou quantité invalide.' });
  if (!empty(b.roomTypeId) && roomTypeId === null) return json(400, { error: 'Type de chambre inconnu.' });
  if (!empty(b.occupancy) && occupancy === null) return json(400, { error: 'Occupation : 1 à 8 personnes.' });
  if (cond !== null && cond !== 'extra_bed' && cond !== 'baby_cot') return json(400, { error: 'Condition inconnue.' });
  try {
    if (!(await itemExists(itemId))) return json(404, { error: 'Article inconnu.' });
    await savePrepLine({ roomTypeId, kind, occupancy, cond, itemId, qty });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'template_save', entityType: 'item', entityId: itemId, diff: { roomTypeId, kind, occupancy, cond, qty }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return json(400, { error: 'Type de chambre ou article inconnu.' });
    return unavailable('templates', e);
  }
};
