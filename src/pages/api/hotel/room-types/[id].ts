import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { getRoomType, listRoomTypes, setTypeAmenities, updateRoomType } from '../../../../lib/hotel/rooms';
import { cleanRoomType } from '../../../../lib/hotel/validate';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'rooms')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Type inconnu.' });
  const b = await readJson(request);
  try {
    const current = (await listRoomTypes()).find((t) => t.id === id);
    if (!current) return json(404, { error: 'Type inconnu.' });
    // Les champs absents de la requête gardent leur valeur actuelle.
    const c = cleanRoomType({ ...current, ...b });
    if (!c.ok) return json(400, { error: c.error });
    const r = await updateRoomType(id, { ...c.value, active: typeof b.active === 'boolean' ? b.active : undefined });
    if ('error' in r) return json(400, { error: r.error });
    const amenities = b.amenities && typeof b.amenities === 'object' && !Array.isArray(b.amenities) ? (b.amenities as Record<string, string>) : null;
    if (amenities) await setTypeAmenities(id, amenities);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'room_type_update', entityType: 'room_type', entityId: id, diff: { code: r.type.code, active: r.type.active, priceFcfa: r.type.priceFcfa, amenities: amenities ? Object.keys(amenities).length : 0 }, ip: safeIp(() => clientAddress) });
    return json(200, { type: amenities ? await getRoomType(id) : r.type });
  } catch (e) { return unavailable('room-types', e); }
};
