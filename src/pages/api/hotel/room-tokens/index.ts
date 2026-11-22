import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, toInt, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { appOrigin } from '../../../../lib/hotel/notify';
import { canEdit } from '../../../../lib/hotel/permissions';
import { listTokenStatus, regenerateTokens } from '../../../../lib/hotel/requests';
import { guestUrl } from '../../../../lib/hotel/requests-core';

export const prerender = false;

// Direction seulement. Les jetons ne sont jamais relus : seule l'empreinte est en base, l'adresse n'est rendue qu'à la génération.
export const GET: APIRoute = async ({ locals, url }) => {
  if (!canEdit(locals.user!.role, 'settings')) return json(403, { error: 'forbidden' });
  try { return json(200, { rooms: await listTokenStatus(), origin: appOrigin(url.origin) }); } catch (e) { return unavailable('qr', e); }
};

// { all: true } ou { roomIds: [..] } : génère de nouveaux QR codes et révoque les anciens.
export const POST: APIRoute = async ({ request, locals, clientAddress, url }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'settings')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  let ids: number[] | 'all';
  if (b.all === true) ids = 'all';
  else if (Array.isArray(b.roomIds) && b.roomIds.length > 0 && b.roomIds.length <= 200) {
    const parsed = b.roomIds.map((x) => toInt(x, 1, 2_000_000_000));
    if (parsed.some((x) => x === null)) return json(400, { error: 'Chambre inconnue.' });
    ids = parsed as number[];
  } else return json(400, { error: 'Aucune chambre choisie.' });
  try {
    const origin = appOrigin(url.origin);
    const made = await regenerateTokens(ids, u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'qr_regenerate', diff: { count: made.length, all: ids === 'all' }, ip: safeIp(() => clientAddress) });
    return json(200, { origin, items: made.map((m) => ({ roomId: m.roomId, number: m.number, url: guestUrl(origin, m.token) })) });
  } catch (e) { return unavailable('qr', e); }
};
