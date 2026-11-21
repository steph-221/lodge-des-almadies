import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createRoomType, listRoomTypes } from '../../../../lib/hotel/rooms';
import { cleanRoomType } from '../../../../lib/hotel/validate';

export const prerender = false;

export const GET: APIRoute = async () => {
  try { return json(200, { types: await listRoomTypes() }); } catch (e) { return unavailable('room-types', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'rooms')) return json(403, { error: 'forbidden' });
  const c = cleanRoomType(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createRoomType(c.value);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'room_type_create', entityType: 'room_type', entityId: r.type.id, diff: { code: r.type.code }, ip: safeIp(() => clientAddress) });
    return json(201, { type: r.type });
  } catch (e) { return unavailable('room-types', e); }
};
