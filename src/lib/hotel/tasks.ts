import { sql } from '../db';
import { planDay, type PlanStay } from './planning';
import { setRoomStatus } from './rooms';
import { postTaskStock } from './stock';

export const TASK_STATUSES = ['todo', 'doing', 'done', 'checked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const isTaskStatus = (v: unknown): v is TaskStatus => typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);
export const TASK_LABEL: Record<TaskStatus, string> = { todo: 'À faire', doing: 'En cours', done: 'Terminée', checked: 'Contrôlée' };

// Jamais de nom de client ici : ces données sont montrées au personnel d'étage.
export type Task = {
  id: number; taskDate: string; roomId: number; roomNumber: string; building: string; floor: string; typeLabel: string | null;
  kind: 'depart' | 'recouche'; guests: number | null; arrivalToday: boolean; extraBed: boolean; babyCot: boolean;
  status: TaskStatus; assignedTo: number | null; assignedName: string | null; note: string;
};

const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });
export const todayDakar = (): string => new Date().toISOString().slice(0, 10); // Dakar est en UTC toute l'année

const SELECT = `select k.id::int as id, to_char(k.task_date,'YYYY-MM-DD') as "taskDate", k.room_id::int as "roomId", r.number as "roomNumber",
  r.building, r.floor, t.label as "typeLabel", k.kind, k.guests::int as guests, k.arrival_today as "arrivalToday", k.extra_bed as "extraBed",
  k.baby_cot as "babyCot", k.status, k.assigned_to::int as "assignedTo", s.display_name as "assignedName", k.note
  from hk_tasks k join rooms r on r.id = k.room_id left join room_types t on t.id = r.room_type_id left join staff s on s.id = k.assigned_to`;

export async function listTasks(date: string, onlyAssignedTo?: number): Promise<Task[]> {
  const rows = (await sql().query(`${SELECT} where k.task_date = $1::date ${onlyAssignedTo ? 'and k.assigned_to = $2' : ''}`, onlyAssignedTo ? [date, onlyAssignedTo] : [date])) as Task[];
  return rows.sort((a, b) => natural(a.roomNumber, b.roomNumber));
}

export async function getTask(id: number): Promise<Task | null> {
  return ((await sql().query(`${SELECT} where k.id = $1`, [id])) as Task[])[0] ?? null;
}

// Recalcule les tâches du jour depuis les séjours. Les tâches déjà commencées ne sont jamais supprimées.
export async function generateTasks(date: string): Promise<{ created: number; updated: number; removed: number }> {
  const stays = (await sql().query(
    `select id::int as id, room_id::int as "roomId", to_char(arrival,'YYYY-MM-DD') as arrival, to_char(departure,'YYYY-MM-DD') as departure,
       guests::int as guests, extra_bed as "extraBed", baby_cot as "babyCot", status
     from stays s where status='booked' and arrival <= $1::date and departure >= $1::date
       and exists (select 1 from rooms r where r.id = s.room_id and r.active)`, [date],
  )) as PlanStay[];
  const plan = planDay(date, stays);
  const existing = (await sql().query(`select id::int as id, room_id::int as "roomId", status from hk_tasks where task_date = $1::date`, [date])) as { id: number; roomId: number; status: TaskStatus }[];
  const byRoom = new Map(existing.map((e) => [e.roomId, e]));
  let created = 0, updated = 0, removed = 0;
  for (const p of plan) {
    const ex = byRoom.get(p.roomId);
    if (!ex) {
      await sql().query(
        `insert into hk_tasks (task_date, room_id, kind, guests, arrival_today, extra_bed, baby_cot) values ($1,$2,$3,$4,$5,$6,$7) on conflict (task_date, room_id) do nothing`,
        [date, p.roomId, p.kind, p.guests, p.arrivalToday, p.extraBed, p.babyCot],
      );
      await setRoomStatus(p.roomId, 'dirty', null, true);
      created++;
    } else if (ex.status === 'todo') {
      await sql().query(`update hk_tasks set kind=$2, guests=$3, arrival_today=$4, extra_bed=$5, baby_cot=$6 where id=$1`, [ex.id, p.kind, p.guests, p.arrivalToday, p.extraBed, p.babyCot]);
      updated++;
    }
  }
  const wanted = new Set(plan.map((p) => p.roomId));
  for (const ex of existing) {
    if (!wanted.has(ex.roomId) && ex.status === 'todo') {
      await sql().query(`delete from hk_tasks where id = $1`, [ex.id]);
      // La chambre avait été marquée « à nettoyer » pour cette tâche : sans tâche, elle redevient prête.
      await sql().query(`update rooms set status='ready', status_at=now() where id=$1 and status='dirty'`, [ex.roomId]);
      removed++;
    }
  }
  return { created, updated, removed };
}

const ROOM_STATUS_FOR: Record<TaskStatus, 'dirty' | 'in_progress' | 'to_check' | 'ready'> = {
  todo: 'dirty', doing: 'in_progress', done: 'to_check', checked: 'ready',
};

export async function setTaskStatus(id: number, status: TaskStatus, staffId: number | null): Promise<Task | null> {
  const rows = (await sql().query(
    `update hk_tasks set status=$2,
       done_at = case when $2 in ('done','checked') then coalesce(done_at, now()) else null end,
       checked_at = case when $2 = 'checked' then now() else null end
     where id=$1 returning room_id::int as "roomId"`, [id, status],
  )) as { roomId: number }[];
  if (!rows[0]) return null;
  await setRoomStatus(rows[0].roomId, ROOM_STATUS_FOR[status], staffId, true);
  // Le stock se décompte à la première fois que la tâche est terminée (une seule fois). Un échec ne bloque pas le travail d'étage.
  if (status === 'done' || status === 'checked') {
    try { await postTaskStock(id, staffId); } catch (e) { console.error('[stock]', (e as Error).message); }
  }
  return getTask(id);
}

export async function assignTask(id: number, staffId: number | null): Promise<boolean> {
  const rows = (await sql().query(`update hk_tasks set assigned_to=$2 where id=$1 returning id`, [id, staffId])) as unknown[];
  return rows.length > 0;
}
