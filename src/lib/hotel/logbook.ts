// Cahier de liaison entre les équipes : messages, épinglage, accusé de lecture. Serveur uniquement.
import { sql } from '../db';
import { sid } from './stock';

export type Entry = {
  id: number; body: string; pinned: boolean; createdAt: string; authorName: string | null;
  read: boolean; readers: number;
};

const ISO = `to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

// Messages des 14 derniers jours, ou épinglés. « read » : lu par la personne connectée.
export async function listEntries(staffId: number): Promise<Entry[]> {
  const me = sid(staffId) ?? 0;
  return (await sql().query(
    `select e.id::int as id, e.body, e.pinned, ${ISO} as "createdAt", s.display_name as "authorName",
       exists(select 1 from logbook_reads r where r.entry_id = e.id and r.staff_id = $1) as read,
       (select count(*)::int from logbook_reads r where r.entry_id = e.id) as readers
     from logbook_entries e left join staff s on s.id = e.author_id
     where not e.removed and (e.pinned or e.created_at > now() - interval '14 days')
     order by e.pinned desc, e.id desc limit 200`, [me],
  )) as Entry[];
}

export async function unreadCount(staffId: number): Promise<number> {
  const me = sid(staffId);
  if (!me) return 0;
  const r = (await sql().query(
    `select count(*)::int as n from logbook_entries e where not e.removed and (e.pinned or e.created_at > now() - interval '14 days')
       and e.author_id is distinct from $1 and not exists(select 1 from logbook_reads r where r.entry_id = e.id and r.staff_id = $1)`, [me],
  )) as { n: number }[];
  return r[0]?.n ?? 0;
}

export async function addEntry(body: string, staffId: number): Promise<number> {
  const r = (await sql().query(`insert into logbook_entries (author_id, body) values ($1, $2) returning id::int as id`, [sid(staffId), body])) as { id: number }[];
  return r[0].id;
}

// L'auteur a lu son propre message ; l'accès de secours (sans compte) ne laisse pas d'accusé.
export async function markRead(entryId: number, staffId: number): Promise<boolean> {
  const me = sid(staffId);
  if (!me) return false;
  const r = (await sql().query(
    `insert into logbook_reads (entry_id, staff_id) select e.id, $2 from logbook_entries e where e.id = $1 and not e.removed
     on conflict do nothing returning entry_id`, [entryId, me],
  )) as unknown[];
  return r.length > 0;
}

export async function setPinned(entryId: number, pinned: boolean): Promise<boolean> {
  return ((await sql().query(`update logbook_entries set pinned = $2 where id = $1 and not removed returning id`, [entryId, pinned])) as unknown[]).length > 0;
}

export async function removeEntry(entryId: number): Promise<boolean> {
  return ((await sql().query(`update logbook_entries set removed = true, pinned = false where id = $1 and not removed returning id`, [entryId])) as unknown[]).length > 0;
}

// Qui a lu un message (direction).
export async function readersOf(entryId: number): Promise<{ name: string; at: string }[]> {
  return (await sql().query(
    `select s.display_name as name, to_char(r.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
     from logbook_reads r join staff s on s.id = r.staff_id where r.entry_id = $1 order by r.at`, [entryId],
  )) as { name: string; at: string }[];
}
