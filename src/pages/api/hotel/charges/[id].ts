import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { voidCharge } from '../../../../lib/hotel/minibar';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Annulation d'une ligne (jamais supprimée : elle reste dans l'historique). Impossible une fois reportée sur la facture.
export const DELETE: APIRoute = async ({ params, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'extras')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Ligne inconnue.' });
  try {
    if (!(await voidCharge(id))) return json(404, { error: 'Ligne inconnue ou déjà reportée sur la facture.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'charge_void', entityType: 'charge', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('charges', e); }
};
