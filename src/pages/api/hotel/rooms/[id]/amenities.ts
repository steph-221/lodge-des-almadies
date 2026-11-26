import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { canEdit } from '../../../../../lib/hotel/permissions';
import { getRoom, listRoomAmenities, setRoomAmenities } from '../../../../../lib/hotel/rooms';

export const prerender = false;

// Équipements d'une chambre : valeur effective, valeur du type et indicateur d'écart.
export const GET: APIRoute = async ({ params }) => {
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Chambre inconnue.' });
  try {
    if (!(await getRoom(id))) return json(404, { error: 'Chambre inconnue.' });
    return json(200, { amenities: await listRoomAmenities(id) });
  } catch (e) { return unavailable('room-amenities', e); }
};

// Enregistre les écarts par rapport au type. Corps : { amenities: { clé: 'oui' | 'non' | 'sur_demande' | 'supplement' | 'a_verifier' | '' } }.
export const PUT: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'rooms')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Chambre inconnue.' });
  const b = await readJson(request);
  if (!b.amenities || typeof b.amenities !== 'object' || Array.isArray(b.amenities)) return json(400, { error: 'Équipements manquants.' });
  try {
    const room = await getRoom(id);
    if (!room) return json(404, { error: 'Chambre inconnue.' });
    const overrides = await setRoomAmenities(id, b.amenities as Record<string, unknown>);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'room_amenities', entityType: 'room', entityId: id, diff: { number: room.number, overrides }, ip: safeIp(() => clientAddress) });
    return json(200, { amenities: await listRoomAmenities(id), overrides });
  } catch (e) { return unavailable('room-amenities', e); }
};
