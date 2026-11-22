import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { idParam, unavailable } from '../../../../lib/hotel/api';
import { fileKind, readFile } from '../../../../lib/hotel/files';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Lecture protégée : aucun lien public vers Drive. Photos de visite : direction ; photos de fiche : direction et gouvernante.
export const GET: APIRoute = async ({ params, locals }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Fichier inconnu.' });
  try {
    const kind = await fileKind(id);
    if (!kind) return json(404, { error: 'Fichier inconnu.' });
    if (!canEdit(u.role, kind === 'sheet' ? 'sheets' : 'inspections')) return json(403, { error: 'forbidden' });
    const f = await readFile(id);
    if (!f) return json(404, { error: 'Fichier inconnu.' });
    return new Response(f.bytes as unknown as BodyInit, { status: 200, headers: { 'content-type': f.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' } });
  } catch (e) { return unavailable('files', e); }
};
