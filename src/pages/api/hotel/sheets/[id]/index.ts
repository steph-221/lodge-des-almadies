import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { canEdit } from '../../../../../lib/hotel/permissions';
import { cancelSheet, getSheet } from '../../../../../lib/hotel/sheets';

export const prerender = false;

// Détail d'une fiche. La lecture de la photo (et donc ce que le modèle a compris) n'est montrée qu'à ceux qui valident.
export const GET: APIRoute = async ({ params, locals }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Fiche inconnue.' });
  try {
    const s = await getSheet(id);
    if (!s) return json(404, { error: 'Fiche inconnue.' });
    const editor = canEdit(u.role, 'sheets');
    if (!editor && s.staffId !== u.id) return json(403, { error: 'forbidden' });
    if (!editor) return json(200, { sheet: { ...s, read: null, fileId: null, applied: {} }, canEdit: false });
    return json(200, { sheet: s, canEdit: true });
  } catch (e) { return unavailable('fiches', e); }
};

// Annule une fiche non validée (les chambres redeviennent disponibles pour une nouvelle fiche).
export const DELETE: APIRoute = async ({ params, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'sheets')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Fiche inconnue.' });
  try {
    if (!(await cancelSheet(id))) return json(409, { error: 'Cette fiche ne peut plus être annulée.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'sheet_cancel', entityType: 'hk_sheet', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('fiches', e); }
};
