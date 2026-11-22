// Brief du jour : lecture des données de la base pour la page « Aujourd'hui » et l'e-mail du matin. Serveur uniquement.
import { sql } from '../db';
import { listCharges } from './minibar';
import { needsForDate, sid } from './stock';
import { listStays } from './stays';
import { parseRecipients, summarizeStays, type BriefData, type DayStay, type StaySummary } from './today';

export const RECIPIENTS_KEY = 'brief_recipients';

export async function getRecipients(): Promise<string[]> {
  const r = (await sql().query(`select value from settings where key = $1`, [RECIPIENTS_KEY])) as { value: unknown }[];
  const v = r[0]?.value;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export async function setRecipients(text: string, staffId: number | null): Promise<{ value: string[] } | { error: string }> {
  const p = parseRecipients(text);
  if (!p.ok) return { error: p.error };
  await sql().query(
    `insert into settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [RECIPIENTS_KEY, JSON.stringify(p.value), sid(staffId)],
  );
  return { value: p.value };
}

export type TaskCounts = { todo: number; doing: number; done: number; checked: number };

export type DayBrief = {
  date: string;
  stays: StaySummary;
  tasks: TaskCounts;
  outOfService: string[];
  linenShort: { name: string; short: number; unit: string }[];
  defects: { housekeeping: number; maintenance: number };
  openExtras: { count: number; total: number };
};

export async function taskCounts(date: string): Promise<TaskCounts> {
  const rows = (await sql().query(`select status, count(*)::int as n from hk_tasks where task_date = $1::date group by status`, [date])) as { status: keyof TaskCounts; n: number }[];
  const c: TaskCounts = { todo: 0, doing: 0, done: 0, checked: 0 };
  for (const r of rows) if (r.status in c) c[r.status] = r.n;
  return c;
}

export async function outOfServiceRooms(): Promise<string[]> {
  const rows = (await sql().query(`select number from rooms where active and status = 'out_of_service'`)) as { number: string }[];
  return rows.map((r) => r.number).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

export async function defectCounts(): Promise<{ housekeeping: number; maintenance: number }> {
  const rows = (await sql().query(`select service, count(*)::int as n from room_inspection_items where result = 'fix' and fixed_at is null group by service`)) as { service: 'housekeeping' | 'maintenance'; n: number }[];
  const c = { housekeeping: 0, maintenance: 0 };
  for (const r of rows) if (r.service in c) c[r.service] = r.n;
  return c;
}

export async function computeBrief(date: string): Promise<DayBrief> {
  const [stays, tasks, outOfService, needs, defects, charges] = await Promise.all([
    listStays(date, date), taskCounts(date), outOfServiceRooms(), needsForDate(date), defectCounts(), listCharges(false),
  ]);
  const dayStays: DayStay[] = stays.map((s) => ({ roomNumber: s.roomNumber, guestName: s.guestName, guests: s.guests, arrival: s.arrival, departure: s.departure }));
  return {
    date, stays: summarizeStays(date, dayStays), tasks, outOfService,
    linenShort: needs.needs.filter((n) => n.short > 0).map((n) => ({ name: n.name, short: n.short, unit: n.unit })),
    defects, openExtras: { count: charges.length, total: charges.reduce((n, c) => n + c.amount, 0) },
  };
}

// Données de l'e-mail : seulement des chiffres et des numéros de chambre, jamais de nom de client.
export function toEmailData(b: DayBrief): BriefData {
  return {
    date: b.date, arrivals: b.stays.arrivals.length, departures: b.stays.departures.length, stayovers: b.stays.stayovers.length,
    occupiedTonight: b.stays.occupiedTonight, guestsTonight: b.stays.guestsTonight, breakfasts: b.stays.breakfasts,
    tasks: b.tasks, outOfService: b.outOfService, linenShort: b.linenShort.map((l) => `${l.name} : manque ${l.short}`),
    defects: b.defects, openExtras: b.openExtras.total,
  };
}

// Détail par chambre pour les rôles qui voient les séjours (stays E ou L) ; les autres n'ont que les totaux.
export const withoutNames = (s: StaySummary): StaySummary => {
  const strip = (l: DayStay[]) => l.map((x) => ({ ...x, guestName: '' }));
  return { ...s, arrivals: strip(s.arrivals), departures: strip(s.departures), stayovers: strip(s.stayovers) };
};
