// Pannes signalées par le personnel (maintenance). Serveur uniquement.
import { sql } from '../db';
import { setRoomStatus } from './rooms';
import { byPriority, type IssueInput, type IssueStatus, type Priority } from './requests-core';
import { sid } from './stock';

const ISO = (c: string) => `to_char(${c} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export type Issue = {
  id: number; roomId: number | null; roomNumber: string | null; place: string; title: string; detail: string; priority: Priority; status: IssueStatus;
  blocksRoom: boolean; reportedByName: string | null; createdAt: string; doingAt: string | null; doneAt: string | null;
};

const SELECT = `select i.id::int as id, i.room_id::int as "roomId", r.number as "roomNumber", i.place, i.title, i.detail, i.priority, i.status,
  i.blocks_room as "blocksRoom", s.display_name as "reportedByName", ${ISO('i.created_at')} as "createdAt", ${ISO('i.doing_at')} as "doingAt", ${ISO('i.done_at')} as "doneAt"
  from issues i left join rooms r on r.id = i.room_id left join staff s on s.id = i.reported_by`;

// Pannes ouvertes, plus celles résolues depuis moins de 7 jours.
export async function listIssues(): Promise<Issue[]> {
  const rows = (await sql().query(`${SELECT} where i.status <> 'done' or i.done_at > now() - interval '7 days'`)) as Issue[];
  const open = rows.filter((x) => x.status !== 'done').sort(byPriority);
  const done = rows.filter((x) => x.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return [...open, ...done];
}

// Chambres actives, ordre naturel : liste de choix pour les écrans qui n'ont pas accès à l'onglet Chambres.
export async function activeRoomList(): Promise<{ id: number; number: string }[]> {
  const rows = (await sql().query(`select id::int as id, number from rooms where active`)) as { id: number; number: string }[];
  return rows.sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }));
}

export async function getIssue(id: number): Promise<Issue | null> {
  return ((await sql().query(`${SELECT} where i.id = $1`, [id])) as Issue[])[0] ?? null;
}

export async function openIssuesCount(): Promise<number> {
  return ((await sql().query(`select count(*)::int as n from issues where status <> 'done'`)) as { n: number }[])[0]?.n ?? 0;
}

export async function createIssue(v: IssueInput, staffId: number | null): Promise<{ id: number; roomNumber: string | null } | { error: string }> {
  let roomNumber: string | null = null;
  if (v.roomId !== null) {
    const r = ((await sql().query(`select number from rooms where id = $1 and active`, [v.roomId])) as { number: string }[])[0];
    if (!r) return { error: 'Chambre inconnue.' };
    roomNumber = r.number;
  }
  const ins = (await sql().query(
    `insert into issues (room_id, place, title, detail, priority, blocks_room, reported_by) values ($1,$2,$3,$4,$5,$6,$7) returning id::int as id`,
    [v.roomId, v.place, v.title, v.detail, v.priority, v.blocksRoom, sid(staffId)],
  )) as { id: number }[];
  // Chambre bloquée : elle sort du parc jusqu'à la réparation.
  if (v.blocksRoom && v.roomId !== null) await setRoomStatus(v.roomId, 'out_of_service', staffId);
  return { id: ins[0].id, roomNumber };
}

// Fait avancer la panne. À la résolution, une chambre bloquée repasse « sale » (à nettoyer et contrôler) si plus aucune panne bloquante n'est ouverte.
export async function setIssueStatus(id: number, to: IssueStatus, staffId: number | null): Promise<{ ok: true; roomReleased: boolean } | { error: 'unknown' | 'conflict' }> {
  const cur = await getIssue(id);
  if (!cur) return { error: 'unknown' };
  const upd = (await sql().query(
    `update issues set status = $2, doing_at = case when $2 = 'doing' then coalesce(doing_at, now()) else doing_at end,
       done_at = case when $2 = 'done' then now() else done_at end, done_by = case when $2 = 'done' then $3::bigint else done_by end
     where id = $1 and status = $4 returning id`,
    [id, to, sid(staffId), cur.status],
  )) as unknown[];
  if (!upd.length) return { error: 'conflict' };
  let roomReleased = false;
  if (to === 'done' && cur.blocksRoom && cur.roomId !== null) {
    const still = (await sql().query(`select 1 from issues where room_id = $1 and blocks_room and status <> 'done'`, [cur.roomId])) as unknown[];
    if (!still.length) roomReleased = await setRoomStatus(cur.roomId, 'dirty', staffId);
  }
  return { ok: true, roomReleased };
}
