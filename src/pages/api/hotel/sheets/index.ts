import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, isIsoDate, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { storageMode } from '../../../../lib/hotel/files';
import { canEdit } from '../../../../lib/hotel/permissions';
import { createSheet, listSheets } from '../../../../lib/hotel/sheets';
import { listStaff } from '../../../../lib/hotel/staff';
import { todayDakar } from '../../../../lib/hotel/tasks';
import { visionConfigured } from '../../../../lib/hotel/vision';

export const prerender = false;

// Fiches du jour. Une femme de chambre ne voit que les siennes ; direction et gouvernante voient tout et peuvent en créer.
export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user!;
  const date = url.searchParams.get('date') ?? todayDakar();
  if (!isIsoDate(date)) return json(400, { error: 'Date invalide.' });
  const editor = canEdit(u.role, 'sheets');
  if (!editor && u.id <= 0) return json(403, { error: 'forbidden' });
  try {
    const sheets = await listSheets(date, editor ? undefined : u.id);
    const staff = editor ? (await listStaff()).filter((s) => s.active && s.role === 'femme_chambre').map((s) => ({ id: s.id, name: s.displayName })) : [];
    return json(200, { date, sheets, staff, canEdit: editor, vision: visionConfigured(), storage: storageMode() });
  } catch (e) { return unavailable('fiches', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'sheets')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const date = typeof b.date === 'string' ? b.date : todayDakar();
  if (!isIsoDate(date)) return json(400, { error: 'Date invalide.' });
  const staffId = b.staffId === null || b.staffId === undefined || b.staffId === '' ? null : Number(b.staffId);
  if (staffId !== null && (!Number.isSafeInteger(staffId) || staffId <= 0)) return json(400, { error: 'Personne inconnue.' });
  try {
    const r = await createSheet(date, staffId, u.id);
    if ('error' in r) return json(409, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'sheet_create', entityType: 'hk_sheet', entityId: r.id, diff: { date, staffId }, ip: safeIp(() => clientAddress) });
    return json(201, { id: r.id });
  } catch (e) { return unavailable('fiches', e); }
};
