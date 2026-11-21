import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { receiveBatch } from '../../../../lib/hotel/laundry';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Retour d'un lot : quantités revenues propres et abîmées par article ; le reste est compté manquant.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Lot inconnu.' });
  const b = await readJson(request);
  if (!Array.isArray(b.lines)) return json(400, { error: 'Quantités manquantes.' });
  const returns: { itemId: number; received: number; damaged: number }[] = [];
  for (const l of b.lines.slice(0, 100)) {
    const r = (l ?? {}) as Record<string, unknown>;
    const itemId = toInt(r.itemId, 1, 2_000_000_000);
    const received = toInt(r.received ?? 0, 0, 99999);
    const damaged = toInt(r.damaged ?? 0, 0, 99999);
    if (!itemId || received === null || damaged === null) return json(400, { error: 'Quantités invalides.' });
    returns.push({ itemId, received, damaged });
  }
  try {
    const r = await receiveBatch(id, returns, u.id);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'laundry_receive', entityType: 'laundry_batch', entityId: id, diff: { missing: r.missing }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true, missing: r.missing });
  } catch (e) { return unavailable('laundry', e); }
};
