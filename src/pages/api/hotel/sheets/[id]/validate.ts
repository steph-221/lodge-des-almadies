import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import { canEdit } from '../../../../../lib/hotel/permissions';
import { applySheet, getSheet } from '../../../../../lib/hotel/sheets';
import { cleanValidation } from '../../../../../lib/hotel/sheets-core';
import { todayDakar } from '../../../../../lib/hotel/tasks';

export const prerender = false;

// Validation par la direction ou la gouvernante : applique l'état des chambres et les relevés de minibar, comme si la saisie venait du téléphone.
export const POST: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'sheets')) return json(403, { error: 'forbidden' });
  const id = idParam(params.id);
  if (!id) return json(404, { error: 'Fiche inconnue.' });
  const b = await readJson(request);
  try {
    const s = await getSheet(id);
    if (!s) return json(404, { error: 'Fiche inconnue.' });
    if (s.status === 'validated') return json(409, { error: 'Cette fiche est déjà validée.' });
    if (s.status === 'cancelled') return json(409, { error: 'Cette fiche est annulée.' });
    const read = s.read && s.read.status === 'read' ? s.read.parsed : null;
    const c = cleanValidation(b, s.rows, read);
    if (!c.ok) return json(400, { error: c.error });
    const report = await applySheet(s, c.value.rows, u.id, todayDakar());
    await audit({
      staffId: u.id, actor: actorOf(u), action: 'sheet_validate', entityType: 'hk_sheet', entityId: id,
      diff: { applied: report.applied, failures: report.failures.length, withPhoto: Boolean(read), reviewed: c.value.reviewed.length }, ip: safeIp(() => clientAddress),
    });
    return json(report.validated ? 200 : 207, report);
  } catch (e) { return unavailable('fiches', e); }
};
