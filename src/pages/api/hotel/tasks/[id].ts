import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, idParam, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { canEdit } from '../../../../lib/hotel/permissions';
import { findById } from '../../../../lib/hotel/staff';
import { assignTask, getTask, isTaskStatus, setTaskStatus } from '../../../../lib/hotel/tasks';

export const prerender = false;

// La femme de chambre fait avancer ses propres tâches (à faire → en cours → terminée). Le contrôle et l'attribution
// reviennent à ceux qui gèrent les chambres (direction, gouvernante, réception).
export const PATCH: APIRoute = async ({ params, request, locals, clientAddress }) => {
  const u = locals.user!;
  const id = idParam(params.id);
  if (!id) return json(400, { error: 'Tâche inconnue.' });
  const b = await readJson(request);
  const manager = canEdit(u.role, 'rooms');
  const ip = safeIp(() => clientAddress);
  try {
    const task = await getTask(id);
    if (!task) return json(404, { error: 'Tâche inconnue.' });

    if (b.assignedTo !== undefined) {
      if (!manager) return json(403, { error: 'forbidden' });
      let staffId: number | null = null;
      if (b.assignedTo !== null && b.assignedTo !== '') {
        const n = Number(b.assignedTo);
        const s = Number.isSafeInteger(n) ? await findById(n) : null;
        if (!s || !s.active || s.role !== 'femme_chambre') return json(400, { error: 'Choisissez une femme de chambre active.' });
        staffId = s.id;
      }
      await assignTask(id, staffId);
      await audit({ staffId: u.id, actor: actorOf(u), action: 'task_assign', entityType: 'hk_tasks', entityId: id, diff: { assignedTo: staffId }, ip });
      return json(200, { task: await getTask(id) });
    }

    if (b.status !== undefined) {
      if (!isTaskStatus(b.status)) return json(400, { error: 'État inconnu.' });
      if (!manager) {
        if (task.assignedTo !== u.id) return json(403, { error: 'Cette tâche ne vous est pas attribuée.' });
        if (b.status === 'checked' || task.status === 'checked') return json(403, { error: 'Le contrôle est fait par la gouvernante.' });
      }
      const t = await setTaskStatus(id, b.status, u.id);
      await audit({ staffId: u.id, actor: actorOf(u), action: 'task_status', entityType: 'hk_tasks', entityId: id, diff: { status: b.status }, ip });
      return json(200, { task: t });
    }
    return json(400, { error: 'Rien à modifier.' });
  } catch (e) { return unavailable('tasks', e); }
};
