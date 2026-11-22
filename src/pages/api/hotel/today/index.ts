import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { isIsoDate, unavailable } from '../../../../lib/hotel/api';
import { computeBrief, withoutNames } from '../../../../lib/hotel/brief';
import { levelFor } from '../../../../lib/hotel/permissions';
import { todayDakar } from '../../../../lib/hotel/tasks';
import { unreadCount } from '../../../../lib/hotel/logbook';

export const prerender = false;

// Page « Aujourd'hui » : chaque rôle ne reçoit que ce qui relève de son périmètre.
// Les noms de clients ne sortent que pour les rôles qui ont accès aux réservations ; les extras seulement pour la réception et la direction.
export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user!;
  const q = url.searchParams.get('date');
  if (q && !isIsoDate(q)) return json(400, { error: 'Date invalide.' });
  const date = q ?? todayDakar();
  try {
    const b = await computeBrief(date);
    const names = levelFor(u.role, 'stays') !== null;
    const linen = levelFor(u.role, 'linen') !== null;
    const insp = levelFor(u.role, 'inspections');
    const defects = {
      housekeeping: insp === 'E' || u.role === 'gouvernante' ? b.defects.housekeeping : null,
      maintenance: insp === 'E' || u.role === 'technique' ? b.defects.maintenance : null,
    };
    return json(200, {
      date: b.date,
      stays: names ? b.stays : withoutNames(b.stays),
      tasks: b.tasks,
      outOfService: b.outOfService,
      linenShort: linen ? b.linenShort : null,
      defects,
      openExtras: levelFor(u.role, 'extras') === 'E' ? b.openExtras : null,
      unreadLogbook: await unreadCount(u.id),
    });
  } catch (e) { return unavailable('today', e); }
};
