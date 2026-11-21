import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { canFixDefect } from '../../../../../lib/hotel/inspections';
import { getDefectService, setDefectFixed } from '../../../../../lib/hotel/visits';

export const prerender = false;

// Marquer un défaut corrigé (ou le rouvrir) : seulement par le service concerné, ou la direction.
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Défaut inconnu.' });
  const b = await readJson(request);
  if (typeof b.fixed !== 'boolean') return json(400, { error: 'État manquant.' });
  try {
    const service = await getDefectService(id);
    if (!service) return json(404, { error: 'Défaut inconnu.' });
    if (!canFixDefect(u.role, service)) return json(403, { error: 'Ce défaut relève d’un autre service.' });
    await setDefectFixed(id, b.fixed, u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: b.fixed ? 'defect_fixed' : 'defect_reopened', entityType: 'room_inspection_item', entityId: id, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('inspections', e); }
};
