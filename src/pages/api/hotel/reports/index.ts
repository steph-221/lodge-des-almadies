import type { APIRoute } from 'astro';
import { json } from '../../../../lib/http';
import { unavailable } from '../../../../lib/hotel/api';
import { buildReport } from '../../../../lib/hotel/reports';
import { cleanPeriod } from '../../../../lib/hotel/reports-core';
import { levelFor } from '../../../../lib/hotel/permissions';
import { todayDakar } from '../../../../lib/hotel/tasks';

export const prerender = false;

// Lecture seule, réservée à ceux qui ont le module « reports » (direction, réception, gouvernante).
export const GET: APIRoute = async ({ url, locals }) => {
  if (!levelFor(locals.user!.role, 'reports')) return json(403, { error: 'forbidden' });
  const p = cleanPeriod(url.searchParams.get('from'), url.searchParams.get('to'), todayDakar());
  if (!p.ok) return json(400, { error: p.error });
  try { return json(200, { report: await buildReport(p.value.from, p.value.to) }); } catch (e) { return unavailable('rapports', e); }
};
