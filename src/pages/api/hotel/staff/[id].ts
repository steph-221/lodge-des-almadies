import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { audit } from '../../../../lib/hotel/audit';
import { canManageStaff } from '../../../../lib/hotel/permissions';
import { findById, resetSecret, setActive } from '../../../../lib/hotel/staff';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json(400, { error: 'Compte inconnu.' });
  const body = await readJson(request);
  const action = typeof body.action === 'string' ? body.action : '';
  let ip: string | undefined;
  try { ip = clientAddress; } catch { /* indisponible */ }
  try {
    const target = await findById(id);
    if (!target) return json(404, { error: 'Compte inconnu.' });
    if (!canManageStaff(u.role, target.role)) return json(403, { error: 'Vous ne pouvez pas gérer ce compte.' });
    const who = { staffId: u.id, actor: (u.backup ? 'secours' : 'staff') as 'secours' | 'staff', entityType: 'staff', entityId: id, ip };

    if (action === 'reset') {
      const r = await resetSecret(id);
      if (!r) return json(404, { error: 'Compte inconnu.' });
      await audit({ ...who, action: 'staff_reset_secret' });
      return json(200, { secret: r.secret });
    }
    if (action === 'deactivate' || action === 'activate') {
      if (action === 'deactivate' && id === u.id) return json(400, { error: 'Vous ne pouvez pas désactiver votre propre compte.' });
      await setActive(id, action === 'activate');
      await audit({ ...who, action: action === 'activate' ? 'staff_activate' : 'staff_deactivate' });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Action inconnue.' });
  } catch (e) {
    console.error('[staff]', (e as Error).message);
    return json(503, { error: 'Base indisponible, réessayez dans un instant.' });
  }
};
