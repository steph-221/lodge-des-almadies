import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { getRoom, isRoomStatus, setRoomStatus, updateRoom } from '../../../../lib/hotel/rooms';
import { cleanRoom } from '../../../../lib/hotel/validate';

export const prerender = false;

// Modifier une chambre : fiche complète, activation ou état. Réservé aux rôles qui gèrent les chambres.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'rooms')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Chambre inconnue.' });
  const b = await readJson(request);
  const ip = safeIp(() => clientAddress);
  try {
    const current = await getRoom(id);
    if (!current) return json(404, { error: 'Chambre inconnue.' });

    if (b.status !== undefined) {
      if (!isRoomStatus(b.status)) return json(400, { error: 'État inconnu.' });
      await setRoomStatus(id, b.status, u.id);
      await audit({ staffId: u.id, actor: actorOf(u), action: 'room_status', entityType: 'room', entityId: id, diff: { status: b.status }, ip });
      return json(200, { room: await getRoom(id) });
    }

    // Fiche : champs absents = valeurs actuelles (modification partielle possible).
    const merged = {
      number: current.number, building: current.building, floor: current.floor, minibar: current.minibar,
      notes: current.notes, roomTypeId: current.roomTypeId, baseCapacity: current.ownBaseCapacity, maxCapacity: current.ownMaxCapacity, ...b,
    };
    const c = cleanRoom(merged);
    if (!c.ok) return json(400, { error: c.error });
    const active = typeof b.active === 'boolean' ? b.active : undefined;
    const r = await updateRoom(id, { ...c.value, active });
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'room_update', entityType: 'room', entityId: id, diff: { number: r.room.number, active: r.room.active }, ip });
    return json(200, { room: r.room });
  } catch (e) { return unavailable('rooms', e); }
};
