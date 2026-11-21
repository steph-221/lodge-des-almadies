import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { deletePrepLine } from '../../../../lib/hotel/stock';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Ligne inconnue.' });
  try {
    if (!(await deletePrepLine(id))) return json(404, { error: 'Ligne inconnue.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'template_delete', entityType: 'prep_line', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('templates', e); }
};
