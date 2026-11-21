import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { addCharge, isChargeSource, listCharges, markCarried } from '../../../../lib/hotel/minibar';
import { canEdit } from '../../../../lib/hotel/permissions';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Le restaurant (périmètre limité) ne voit et n'ajoute que le room service.
export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user!;
  try {
    let charges = await listCharges(url.searchParams.get('all') === '1');
    if (!canEdit(u.role, 'extras')) charges = charges.filter((c) => c.source === 'room_service');
    const rooms = (await sql().query(`select id::int as id, number from rooms where active`)) as { id: number; number: string }[];
    rooms.sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }));
    return json(200, { charges, rooms, canManage: canEdit(u.role, 'extras') });
  } catch (e) { return unavailable('charges', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  const b = await readJson(request);
  const roomId = toInt(b.roomId, 1, 2_000_000_000);
  const qty = toInt(b.qty ?? 1, 1, 999);
  const unitPrice = toInt(b.unitPrice, 0, 10_000_000);
  const label = typeof b.label === 'string' ? b.label.trim() : '';
  const source = b.source ?? 'other';
  if (!roomId) return json(400, { error: 'Choisissez une chambre.' });
  if (!label || label.length > 120) return json(400, { error: 'Libellé obligatoire (120 caractères maximum).' });
  if (qty === null || unitPrice === null) return json(400, { error: 'Quantité ou prix invalide (entiers, prix en FCFA).' });
  if (!isChargeSource(source) || source === 'minibar') return json(400, { error: 'Origine inconnue (les extras du minibar viennent du relevé).' });
  if (!canEdit(u.role, 'extras') && source !== 'room_service') return json(403, { error: 'Vous ne pouvez saisir que le room service.' });
  try {
    const r = await addCharge({ roomId, source, label, qty, unitPrice }, u.id, todayDakar());
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'charge_create', entityType: 'charge', entityId: r.id, diff: { roomId, source, amount: qty * unitPrice }, ip: safeIp(() => clientAddress) });
    return json(201, { id: r.id });
  } catch (e) { return unavailable('charges', e); }
};

// « Reporté sur la facture » (ou remis à reporter) pour une ou plusieurs lignes.
export const PATCH: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'extras')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 500 || typeof b.carried !== 'boolean') return json(400, { error: 'Lignes ou état manquants.' });
  const ids = b.ids.map((x) => toInt(x, 1, 2_000_000_000));
  if (ids.some((x) => x === null)) return json(400, { error: 'Ligne inconnue.' });
  try {
    const n = await markCarried(ids as number[], b.carried);
    await audit({ staffId: u.id, actor: actorOf(u), action: b.carried ? 'charge_carried' : 'charge_uncarried', diff: { count: n }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true, count: n });
  } catch (e) { return unavailable('charges', e); }
};
