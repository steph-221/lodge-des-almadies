import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, isIsoDate, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { generateTasks, listTasks, todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Tâches du jour. Une femme de chambre ne voit que les tâches qui lui sont attribuées ; jamais de nom de client.
export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user!;
  const date = url.searchParams.get('date') ?? todayDakar();
  if (!isIsoDate(date)) return json(400, { error: 'Date invalide.' });
  try {
    const mine = u.role === 'femme_chambre' ? u.id : undefined;
    return json(200, { date, tasks: await listTasks(date, mine) });
  } catch (e) { return unavailable('tasks', e); }
};

// Recalcule les tâches du jour depuis les séjours.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'rooms')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  const date = typeof b.date === 'string' ? b.date : todayDakar();
  if (!isIsoDate(date)) return json(400, { error: 'Date invalide.' });
  try {
    const r = await generateTasks(date);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'tasks_generate', entityType: 'hk_tasks', entityId: date, diff: r, ip: safeIp(() => clientAddress) });
    return json(200, { date, ...r, tasks: await listTasks(date) });
  } catch (e) { return unavailable('tasks', e); }
};
