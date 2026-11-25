import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createRoom, listAmenities, listRoomTypes, listRooms } from '../../../../lib/hotel/rooms';
import { cleanRoom } from '../../../../lib/hotel/validate';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const [rooms, types, amenities] = await Promise.all([listRooms(), listRoomTypes(), listAmenities()]);
    return json(200, { rooms, types, amenities });
  } catch (e) { return unavailable('rooms', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'rooms')) return json(403, { error: 'forbidden' });
  const c = cleanRoom(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const r = await createRoom(c.value);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'room_create', entityType: 'room', entityId: r.room.id, diff: { number: r.room.number }, ip: safeIp(() => clientAddress) });
    return json(201, { room: r.room });
  } catch (e) { return unavailable('rooms', e); }
};
