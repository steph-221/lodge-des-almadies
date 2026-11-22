import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { setCardStatus } from '../../../../lib/hotel/keys';
import { cleanCardStatus } from '../../../../lib/hotel/keys-core';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Déclarer une carte perdue ou la retirer : définitif. Une carte perdue sort du registre actif, l'historique reste, et le cahier de liaison prévient l'équipe.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'keys')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Carte inconnue.' });
  const c = cleanCardStatus(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await setCardStatus(id, c.value.status, c.value.note, u.id);
    if ('error' in r) return json(r.code, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: c.value.status === 'lost' ? 'card_lost' : 'card_retired', entityType: 'key_card', entityId: id, diff: { code: r.card.code, room: r.card.roomNumber }, ip: safeIp(() => clientAddress) });
    return json(200, { card: { ...r.card, status: c.value.status }, alerted: r.alerted });
  } catch (e) { return unavailable('cartes', e); }
};
