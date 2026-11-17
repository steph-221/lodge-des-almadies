import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { audit } from '../../../../lib/hotel/audit';
import { canManageStaff, isRole } from '../../../../lib/hotel/permissions';
import { createStaff, listStaff } from '../../../../lib/hotel/staff';

export const prerender = false;

const unavailable = (e: unknown) => {
  console.error('[staff]', (e as Error).message);
  return json(503, { error: 'Base indisponible, réessayez dans un instant.' });
};

export const GET: APIRoute = async ({ locals }) => {
  const u = locals.user!;
  try {
    const all = await listStaff();
    return json(200, { staff: all.filter((s) => canManageStaff(u.role, s.role)) });
  } catch (e) { return unavailable(e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  const b = await readJson(request);
  if (!isRole(b.role)) return json(400, { error: 'Rôle inconnu.' });
  if (!canManageStaff(u.role, b.role)) return json(403, { error: 'Vous ne pouvez pas créer ce type de compte.' });
  try {
    const r = await createStaff({ login: String(b.login ?? ''), displayName: String(b.displayName ?? ''), role: b.role });
    if ('error' in r) return json(400, { error: r.error });
    let ip: string | undefined;
    try { ip = clientAddress; } catch { /* indisponible */ }
    await audit({ staffId: u.id, actor: u.backup ? 'secours' : 'staff', action: 'staff_create', entityType: 'staff', entityId: r.staff.id, diff: { login: r.staff.login, role: r.staff.role }, ip });
    // Le code n'est renvoyé qu'ici, une seule fois : il n'est stocké que haché.
    return json(201, { staff: r.staff, secret: r.secret });
  } catch (e) { return unavailable(e); }
};
