import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { MAX_FILE_BYTES } from '../../../../../lib/hotel/files';
import { canEdit } from '../../../../../lib/hotel/permissions';
import { addPhoto, getSheet } from '../../../../../lib/hotel/sheets';

export const prerender = false;

// Une photo par appel (corps = image réduite par le navigateur). La femme de chambre peut envoyer celle de sa fiche ; elle ne voit pas la lecture.
export const POST: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Fiche inconnue.' });
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > MAX_FILE_BYTES + 1000) return json(413, { error: 'Photo trop lourde (2 Mo maximum).' });
  try {
    const s = await getSheet(id);
    if (!s) return json(404, { error: 'Fiche inconnue.' });
    const editor = canEdit(u.role, 'sheets');
    if (!editor && (u.id <= 0 || s.staffId !== u.id)) return json(403, { error: 'forbidden' });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const r = await addPhoto(s, bytes, u.id);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'sheet_photo', entityType: 'hk_sheet', entityId: id, diff: { readId: r.readId, status: r.status }, ip: safeIp(() => clientAddress) });
    return json(201, editor ? r : { received: true });
  } catch (e) { return unavailable('fiches', e); }
};
