// Demandes des clients, catalogue, guide de la chambre, jetons des QR codes. Serveur uniquement.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from '../db';
import { addCharge } from './minibar';
import { sid } from './stock';
import {
  roomOpenForGuest, type CatalogInput, type GuideInput, type Lang, type RequestStatus, type Service,
} from './requests-core';

const ISO = (c: string) => `to_char(${c} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

// ---------- Jetons des QR codes ----------

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export type RoomToken = { roomId: number; number: string; hasToken: boolean; since: string | null };

export async function listTokenStatus(): Promise<RoomToken[]> {
  const rows = (await sql().query(
    `select r.id::int as "roomId", r.number, (t.id is not null) as "hasToken", ${ISO('t.created_at')} as since
     from rooms r left join room_tokens t on t.room_id = r.id and t.revoked_at is null where r.active`,
  )) as RoomToken[];
  return rows.sort((a, b) => natural(a.number, b.number));
}

// Génère un nouveau jeton pour chaque chambre demandée et révoque l'ancien. Le jeton n'est rendu qu'ici : seule son empreinte reste en base.
export async function regenerateTokens(roomIds: number[] | 'all', staffId: number | null): Promise<{ roomId: number; number: string; token: string }[]> {
  const rooms = (await sql().query(
    roomIds === 'all' ? `select id::int as id, number from rooms where active` : `select id::int as id, number from rooms where active and id = any($1::bigint[])`,
    roomIds === 'all' ? [] : [roomIds],
  )) as { id: number; number: string }[];
  const out: { roomId: number; number: string; token: string }[] = [];
  for (const r of rooms) {
    const token = randomBytes(16).toString('base64url'); // 22 caractères, 128 bits
    await sql().query(`update room_tokens set revoked_at = now() where room_id = $1 and revoked_at is null`, [r.id]);
    await sql().query(`insert into room_tokens (room_id, token_hash, created_by) values ($1, $2, $3)`, [r.id, hashToken(token), sid(staffId)]);
    out.push({ roomId: r.id, number: r.number, token });
  }
  return out.sort((a, b) => natural(a.number, b.number));
}

export async function roomForToken(token: string): Promise<{ id: number; number: string } | null> {
  const r = (await sql().query(
    `select r.id::int as id, r.number from room_tokens t join rooms r on r.id = t.room_id
     where t.token_hash = $1 and t.revoked_at is null and r.active`, [hashToken(token)],
  )) as { id: number; number: string }[];
  return r[0] ?? null;
}

export async function roomIsOpen(roomId: number, today: string): Promise<boolean> {
  const st = (await sql().query(
    `select to_char(arrival,'YYYY-MM-DD') as arrival, to_char(departure,'YYYY-MM-DD') as departure from stays
     where room_id = $1 and status = 'booked' and arrival <= $2::date and departure >= $2::date`, [roomId, today],
  )) as { arrival: string; departure: string }[];
  return roomOpenForGuest(st, today);
}

// ---------- Catalogue ----------

export type CatalogItem = { id: number; labelFr: string; labelEn: string; kind: 'service' | 'room_service'; service: Service; price: number | null; askNote: boolean; active: boolean; sort: number };
const CAT = `select id::int as id, label_fr as "labelFr", label_en as "labelEn", kind, service, price, ask_note as "askNote", active, sort from request_catalog`;

export async function listCatalog(onlyActive: boolean): Promise<CatalogItem[]> {
  return (await sql().query(`${CAT} ${onlyActive ? 'where active' : ''} order by active desc, sort, id`)) as CatalogItem[];
}

export async function createCatalog(v: CatalogInput): Promise<number> {
  const r = (await sql().query(
    `insert into request_catalog (label_fr, label_en, kind, service, price, ask_note, sort) values ($1,$2,$3,$4,$5,$6,$7) returning id::int as id`,
    [v.labelFr, v.labelEn, v.kind, v.service, v.price, v.askNote, v.sort],
  )) as { id: number }[];
  return r[0].id;
}

export async function updateCatalog(id: number, v: CatalogInput, active: boolean): Promise<boolean> {
  const r = (await sql().query(
    `update request_catalog set label_fr=$2, label_en=$3, kind=$4, service=$5, price=$6, ask_note=$7, sort=$8, active=$9 where id=$1 returning id`,
    [id, v.labelFr, v.labelEn, v.kind, v.service, v.price, v.askNote, v.sort, active],
  )) as unknown[];
  return r.length > 0;
}

// ---------- Guide de la chambre ----------

export type GuideSection = { id: number; titleFr: string; titleEn: string; bodyFr: string; bodyEn: string; occupiedOnly: boolean; active: boolean; sort: number };
const GUIDE = `select id::int as id, title_fr as "titleFr", title_en as "titleEn", body_fr as "bodyFr", body_en as "bodyEn", occupied_only as "occupiedOnly", active, sort from guide_sections`;

export async function listGuide(onlyActive: boolean): Promise<GuideSection[]> {
  return (await sql().query(`${GUIDE} ${onlyActive ? 'where active' : ''} order by active desc, sort, id`)) as GuideSection[];
}

export async function createGuide(v: GuideInput): Promise<number> {
  const r = (await sql().query(
    `insert into guide_sections (title_fr, title_en, body_fr, body_en, occupied_only, sort) values ($1,$2,$3,$4,$5,$6) returning id::int as id`,
    [v.titleFr, v.titleEn, v.bodyFr, v.bodyEn, v.occupiedOnly, v.sort],
  )) as { id: number }[];
  return r[0].id;
}

export async function updateGuide(id: number, v: GuideInput, active: boolean): Promise<boolean> {
  const r = (await sql().query(
    `update guide_sections set title_fr=$2, title_en=$3, body_fr=$4, body_en=$5, occupied_only=$6, sort=$7, active=$8 where id=$1 returning id`,
    [id, v.titleFr, v.titleEn, v.bodyFr, v.bodyEn, v.occupiedOnly, v.sort, active],
  )) as unknown[];
  return r.length > 0;
}

// ---------- Demandes ----------

export type RequestRow = {
  id: number; roomId: number; roomNumber: string; label: string; qty: number; note: string; service: Service; status: RequestStatus;
  source: 'guest' | 'staff'; lang: Lang; price: number | null; createdAt: string; doingAt: string | null; doneAt: string | null; handledByName: string | null; charged: boolean;
};

const REQ = `select q.id::int as id, q.room_id::int as "roomId", r.number as "roomNumber", q.label, q.qty::int as qty, q.note, q.service, q.status, q.source, q.lang,
  c.price as price, ${ISO('q.created_at')} as "createdAt", ${ISO('q.doing_at')} as "doingAt", ${ISO('q.done_at')} as "doneAt",
  s.display_name as "handledByName", (q.charge_id is not null) as charged
  from requests q join rooms r on r.id = q.room_id left join request_catalog c on c.id = q.catalog_id left join staff s on s.id = q.handled_by`;

// Demandes ouvertes (et celles closes depuis moins de `sinceHours` heures) des services donnés.
export async function listRequests(services: Service[], sinceHours = 24): Promise<RequestRow[]> {
  if (!services.length) return [];
  const rows = (await sql().query(
    `${REQ} where q.service = any($1::text[]) and (q.status in ('new','doing') or q.created_at > now() - make_interval(hours => $2::int)) order by q.created_at`,
    [services, sinceHours],
  )) as RequestRow[];
  return rows;
}

export async function getRequest(id: number): Promise<RequestRow | null> {
  return ((await sql().query(`${REQ} where q.id = $1`, [id])) as RequestRow[])[0] ?? null;
}

// Les demandes récentes d'une chambre, vues par le client (sans nom ni note du personnel).
export async function roomRequests(roomId: number): Promise<{ label: string; qty: number; status: RequestStatus; createdAt: string }[]> {
  return (await sql().query(
    `select label, qty::int as qty, status, ${ISO('created_at')} as "createdAt" from requests
     where room_id = $1 and created_at > now() - interval '24 hours' order by created_at desc limit 20`, [roomId],
  )) as { label: string; qty: number; status: RequestStatus; createdAt: string }[];
}

export type NewRequest = { roomId: number; catalogId: number; qty: number; note: string; source: 'guest' | 'staff'; lang: Lang };

export async function createRequest(v: NewRequest, staffId: number | null, today: string): Promise<{ id: number; label: string; service: Service; roomNumber: string } | { error: string }> {
  const c = ((await sql().query(`${CAT} where id = $1 and active`, [v.catalogId])) as CatalogItem[])[0];
  if (!c) return { error: 'unknown_catalog' };
  if (c.askNote && !v.note) return { error: 'note_required' };
  const room = ((await sql().query(`select number from rooms where id = $1 and active`, [v.roomId])) as { number: string }[])[0];
  if (!room) return { error: 'unknown_room' };
  const stay = (await sql().query(
    `select id::int as id from stays where room_id = $1 and status = 'booked' and arrival <= $2::date and departure >= $2::date order by arrival limit 1`, [v.roomId, today],
  )) as { id: number }[];
  const label = c.labelFr;
  const r = (await sql().query(
    `insert into requests (room_id, stay_id, catalog_id, label, qty, note, service, source, lang, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id::int as id`,
    [v.roomId, stay[0]?.id ?? null, c.id, label, v.qty, v.note, c.service, v.source, v.lang, sid(staffId)],
  )) as { id: number }[];
  return { id: r[0].id, label, service: c.service, roomNumber: room.number };
}

// Change l'état. Un room service chiffré, une fois « fait », crée l'extra correspondant (une seule fois).
export async function setRequestStatus(id: number, to: RequestStatus, staffId: number | null, today: string): Promise<{ ok: true; chargeId: number | null } | { error: string }> {
  const cur = ((await sql().query(`select status, room_id::int as "roomId", label, qty::int as qty, catalog_id::int as "catalogId", charge_id from requests where id = $1`, [id])) as
    { status: RequestStatus; roomId: number; label: string; qty: number; catalogId: number | null; charge_id: number | null }[])[0];
  if (!cur) return { error: 'unknown' };
  // La transition est contrôlée en SQL : deux appuis simultanés ne passent pas tous les deux.
  const upd = (await sql().query(
    `update requests set status = $2, handled_by = coalesce($3::bigint, handled_by),
       doing_at = case when $2 = 'doing' then coalesce(doing_at, now()) else doing_at end,
       done_at = case when $2 = 'done' then now() else done_at end
     where id = $1 and status = $4 returning id`,
    [id, to, sid(staffId), cur.status],
  )) as unknown[];
  if (!upd.length) return { error: 'conflict' };
  let chargeId: number | null = null;
  if (to === 'done' && cur.catalogId && !cur.charge_id) {
    const c = ((await sql().query(`select kind, price from request_catalog where id = $1`, [cur.catalogId])) as { kind: string; price: number | null }[])[0];
    if (c && c.kind === 'room_service' && c.price !== null) {
      const ch = await addCharge({ roomId: cur.roomId, source: 'room_service', label: cur.label, qty: cur.qty, unitPrice: c.price }, staffId, today);
      if ('id' in ch) {
        chargeId = ch.id;
        await sql().query(`update requests set charge_id = $2 where id = $1`, [id, ch.id]);
      }
    }
  }
  return { ok: true, chargeId };
}

export async function summary(services: Service[]): Promise<{ newRequests: number; openRequests: number }> {
  if (!services.length) return { newRequests: 0, openRequests: 0 };
  const r = (await sql().query(
    `select count(*) filter (where status = 'new')::int as "newRequests", count(*)::int as "openRequests" from requests where service = any($1::text[]) and status in ('new','doing')`,
    [services],
  )) as { newRequests: number; openRequests: number }[];
  return r[0] ?? { newRequests: 0, openRequests: 0 };
}
