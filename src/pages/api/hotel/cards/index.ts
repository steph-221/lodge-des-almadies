import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { createCard, listCards } from '../../../../lib/hotel/keys';
import { CARD_STATUSES, cleanCard, type CardStatus } from '../../../../lib/hotel/keys-core';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Le registre des cartes est réservé à ceux qui le gèrent (la femme de chambre n'a que le périmètre « objets trouvés »).
export const GET: APIRoute = async ({ url, locals }) => {
  if (!canEdit(locals.user!.role, 'keys')) return json(403, { error: 'forbidden' });
  const s = url.searchParams.get('status') ?? 'active';
  const status = s === 'all' ? 'all' : (CARD_STATUSES as readonly string[]).includes(s) ? (s as CardStatus) : null;
  if (!status) return json(400, { error: 'État inconnu.' });
  try { return json(200, { cards: await listCards(status) }); } catch (e) { return unavailable('cartes', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'keys')) return json(403, { error: 'forbidden' });
  const c = cleanCard(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createCard(c.value, u.id);
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'card_create', entityType: 'key_card', entityId: r.card.id, diff: { code: r.card.code, kind: r.card.kind }, ip: safeIp(() => clientAddress) });
    return json(201, { card: r.card });
  } catch (e) { return unavailable('cartes', e); }
};
