import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { countFiles, MAX_FILE_BYTES, saveFile } from '../../../../../lib/hotel/files';
import { MAX_PHOTOS } from '../../../../../lib/hotel/inspections';
import { canEdit } from '../../../../../lib/hotel/permissions';
import { inspectionOwner } from '../../../../../lib/hotel/visits';

export const prerender = false;

// Une photo par appel (corps = image), quatre au plus par visite. Le navigateur réduit l'image avant l'envoi.
export const POST: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'inspections')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Visite inconnue.' });
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > MAX_FILE_BYTES + 1000) return json(413, { error: 'Photo trop lourde (2 Mo maximum).' });
  try {
    const owner = await inspectionOwner(id);
    if (!owner) return json(404, { error: 'Visite inconnue.' });
    if ((await countFiles('inspection', id)) >= MAX_PHOTOS) return json(409, { error: `${MAX_PHOTOS} photos au plus par visite.` });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const r = await saveFile({ kind: 'inspection', entityId: id, bytes, staffId: u.id, folder: ['Visites', owner.at, owner.roomNumber] });
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'inspection_photo', entityType: 'room_inspection', entityId: id, diff: { fileId: r.id }, ip: safeIp(() => clientAddress) });
    return json(201, { id: r.id });
  } catch (e) { return unavailable('inspections', e); }
};
