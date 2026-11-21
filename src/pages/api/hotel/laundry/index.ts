import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { listBatches, sendBatch } from '../../../../lib/hotel/laundry';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

export const GET: APIRoute = async () => {
  try { return json(200, { batches: await listBatches() }); } catch (e) { return unavailable('laundry', e); }
};

// Envoi d'un lot de linge sale à la blanchisserie.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  if (!Array.isArray(b.lines)) return json(400, { error: 'Ajoutez au moins un article.' });
  const lines: { itemId: number; qty: number }[] = [];
  for (const l of b.lines.slice(0, 100)) {
    const r = (l ?? {}) as Record<string, unknown>;
    const itemId = toInt(r.itemId, 1, 2_000_000_000);
    const qty = toInt(r.qty, 1, 99999);
    if (!itemId || !qty) return json(400, { error: 'Quantités invalides.' });
    lines.push({ itemId, qty });
  }
  try {
    const r = await sendBatch(lines, typeof b.note === 'string' ? b.note : '', u.id);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'laundry_send', entityType: 'laundry_batch', entityId: r.id, diff: { lines: lines.length }, ip: safeIp(() => clientAddress) });
    return json(201, { id: r.id });
  } catch (e) { return unavailable('laundry', e); }
};
