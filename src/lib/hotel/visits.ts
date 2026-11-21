// Visites de chambre (direction) : liste du matin, grille de contrôle, défauts à corriger, historique. Serveur uniquement.
import { sql } from '../db';
import { inspectionQueue, type InspectionInput, type PointInput, type QueueRoom, type Service } from './inspections';
import { listFiles } from './files';

const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });
const sid = (staffId: number | null | undefined): number | null => (staffId && staffId > 0 ? staffId : null);

// ---- Réglage : nombre de visites par matin ----
export const DEFAULT_PER_MORNING = 3;

export async function getPerMorning(): Promise<number> {
  const r = (await sql().query(`select value from settings where key = 'inspections_per_morning'`)) as { value: unknown }[];
  const n = Number(r[0]?.value);
  return Number.isInteger(n) && n >= 0 && n <= 36 ? n : DEFAULT_PER_MORNING;
}

export async function setPerMorning(n: number, staffId: number | null): Promise<void> {
  await sql().query(
    `insert into settings (key, value, updated_by) values ('inspections_per_morning', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`, [JSON.stringify(n), sid(staffId)],
  );
}

// ---- Grille de contrôle ----
export type Point = { id: number; label: string; zone: string; service: Service; active: boolean; sortOrder: number };

export async function listPoints(): Promise<Point[]> {
  return (await sql().query(`select id::int as id, label, zone, service, active, sort_order as "sortOrder" from inspection_points order by sort_order, id`)) as Point[];
}

export async function createPoints(list: PointInput[]): Promise<number> {
  const max = ((await sql().query(`select coalesce(max(sort_order),0)::int as m from inspection_points`)) as { m: number }[])[0].m;
  let i = max;
  for (const p of list) await sql().query(`insert into inspection_points (label, zone, service, sort_order) values ($1,$2,$3,$4)`, [p.label, p.zone, p.service, ++i]);
  return list.length;
}

export async function updatePoint(id: number, v: PointInput, active: boolean): Promise<boolean> {
  return ((await sql().query(`update inspection_points set label=$2, zone=$3, service=$4, active=$5 where id=$1 returning id`, [id, v.label, v.zone, v.service, active])) as unknown[]).length > 0;
}

// ---- Liste du matin ----
export type QueueItem = QueueRoom & { building: string; typeLabel: string | null };

export async function morningQueue(date: string): Promise<{ queue: QueueItem[]; perMorning: number; doneToday: number; free: number }> {
  const rooms = (await sql().query(
    `select r.id::int as "roomId", r.number, r.building, t.label as "typeLabel",
       to_char((select max(i.at) from room_inspections i where i.room_id = r.id) at time zone 'UTC','YYYY-MM-DD') as "lastVisit"
     from rooms r left join room_types t on t.id = r.room_type_id where r.active`,
  )) as QueueItem[];
  const occ = (await sql().query(
    `select distinct room_id::int as id from stays where status = 'booked' and arrival <= $1::date and departure > $1::date`, [date],
  )) as { id: number }[];
  const occupied = new Set(occ.map((o) => o.id));
  const perMorning = await getPerMorning();
  const doneToday = rooms.filter((r) => r.lastVisit === date).length;
  // Une chambre déjà visitée aujourd'hui sort de la liste ; les visites du jour comptent dans le quota.
  const candidates = rooms.filter((r) => r.lastVisit !== date);
  const free = candidates.filter((r) => !occupied.has(r.roomId)).length;
  const byId = new Map(rooms.map((r) => [r.roomId, r]));
  const queue = inspectionQueue(candidates, occupied, Math.max(0, perMorning - doneToday)).map((q) => byId.get(q.roomId)!);
  return { queue, perMorning, doneToday, free };
}

// ---- Visites ----
export async function createInspection(v: InspectionInput, staffId: number | null): Promise<{ id: number } | { error: string }> {
  const room = (await sql().query(`select 1 from rooms where id = $1 and active`, [v.roomId])) as unknown[];
  if (!room.length) return { error: 'Chambre inconnue.' };
  const ids = v.items.map((i) => i.pointId);
  const pts = ids.length
    ? ((await sql().query(`select id::int as id, label, zone from inspection_points where id = any($1::bigint[])`, [ids])) as { id: number; label: string; zone: string }[])
    : [];
  const byId = new Map(pts.map((p) => [p.id, p]));
  if (v.items.some((i) => !byId.has(i.pointId))) return { error: 'Point de contrôle inconnu.' };
  const ins = (await sql().query(`insert into room_inspections (room_id, staff_id, overall, comment) values ($1,$2,$3,$4) returning id::int as id`, [v.roomId, sid(staffId), v.overall, v.comment])) as { id: number }[];
  const id = ins[0].id;
  for (const i of v.items) {
    const p = byId.get(i.pointId)!;
    await sql().query(
      `insert into room_inspection_items (inspection_id, point_id, label, zone, result, comment, service) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, i.pointId, p.label, p.zone, i.result, i.comment, i.service],
    );
  }
  return { id };
}

export async function inspectionOwner(id: number): Promise<{ roomNumber: string; at: string } | null> {
  const r = (await sql().query(
    `select r.number as "roomNumber", to_char(i.at at time zone 'UTC','YYYY') as at from room_inspections i join rooms r on r.id = i.room_id where i.id = $1`, [id],
  )) as { roomNumber: string; at: string }[];
  return r[0] ?? null;
}

// ---- Défauts à corriger ----
export type Defect = { id: number; inspectionId: number; roomNumber: string; label: string; zone: string; comment: string; service: Service; visitedAt: string; fixedAt: string | null; fixedByName: string | null };

const DEFECT_SELECT = `select it.id::int as id, it.inspection_id::int as "inspectionId", r.number as "roomNumber", it.label, it.zone, it.comment, it.service,
    to_char(i.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "visitedAt", to_char(it.fixed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "fixedAt", s.display_name as "fixedByName"
  from room_inspection_items it join room_inspections i on i.id = it.inspection_id join rooms r on r.id = i.room_id left join staff s on s.id = it.fixed_by`;

export async function listDefects(service: Service | null, includeFixed = false): Promise<Defect[]> {
  const where = [`it.result = 'fix'`];
  const params: unknown[] = [];
  if (!includeFixed) where.push('it.fixed_at is null');
  if (service) { params.push(service); where.push(`it.service = $${params.length}`); }
  const rows = (await sql().query(`${DEFECT_SELECT} where ${where.join(' and ')} order by it.fixed_at is not null, i.at desc limit 300`, params)) as Defect[];
  return rows.sort((a, b) => Number(!!a.fixedAt) - Number(!!b.fixedAt) || natural(a.roomNumber, b.roomNumber));
}

export async function getDefectService(id: number): Promise<Service | null> {
  const r = (await sql().query(`select service from room_inspection_items where id = $1 and result = 'fix'`, [id])) as { service: Service }[];
  return r[0]?.service ?? null;
}

export async function setDefectFixed(id: number, fixed: boolean, staffId: number | null): Promise<boolean> {
  const r = (await sql().query(
    `update room_inspection_items set fixed_at = case when $2 then now() else null end, fixed_by = case when $2 then $3::bigint else null end where id = $1 and result = 'fix' returning id`,
    [id, fixed, sid(staffId)],
  )) as unknown[];
  return r.length > 0;
}

// ---- Historique ----
export type VisitRow = {
  id: number; roomId: number; roomNumber: string; at: string; staffName: string | null; overall: number | null; comment: string;
  items: { id: number; label: string; zone: string; result: string; comment: string; service: Service | null; fixedAt: string | null }[];
  photos: number[];
};

export async function history(roomId: number | null, limit = 30): Promise<VisitRow[]> {
  const heads = (await sql().query(
    `select i.id::int as id, i.room_id::int as "roomId", r.number as "roomNumber", to_char(i.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
       s.display_name as "staffName", i.overall::int as overall, i.comment
     from room_inspections i join rooms r on r.id = i.room_id left join staff s on s.id = i.staff_id
     ${roomId ? 'where i.room_id = $2' : ''} order by i.id desc limit $1`, roomId ? [limit, roomId] : [limit],
  )) as Omit<VisitRow, 'items' | 'photos'>[];
  if (!heads.length) return [];
  const ids = heads.map((h) => h.id);
  const items = (await sql().query(
    `select id::int as id, inspection_id::int as "inspectionId", label, zone, result, comment, service, to_char(fixed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "fixedAt"
     from room_inspection_items where inspection_id = any($1::bigint[]) order by id`, [ids],
  )) as (VisitRow['items'][number] & { inspectionId: number })[];
  const photos = await listFiles('inspection', ids);
  return heads.map((h) => ({
    ...h,
    items: items.filter((x) => x.inspectionId === h.id).map(({ inspectionId: _i, ...x }) => x),
    photos: photos.filter((p) => p.entityId === h.id).map((p) => p.id),
  }));
}
