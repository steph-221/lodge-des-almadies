// Minibar (dotation, relevé) et extras par chambre. Serveur uniquement.
import { sql } from '../db';
import { minibarConsumption } from './linen';
import { addMovement, sid } from './stock';

const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

export type DotationRow = { roomTypeId: number; roomTypeLabel: string; itemId: number; itemName: string; qty: number; price: number };

export async function listDotation(): Promise<DotationRow[]> {
  return (await sql().query(
    `select d.room_type_id::int as "roomTypeId", t.label as "roomTypeLabel", d.item_id::int as "itemId", i.name as "itemName", d.qty, i.price
     from minibar_dotation d join room_types t on t.id = d.room_type_id join items i on i.id = d.item_id order by t.label, i.name`,
  )) as DotationRow[];
}

export async function saveDotation(roomTypeId: number, itemId: number, qty: number): Promise<{ ok: true } | { error: string }> {
  const ok = (await sql().query(`select (select kind from items where id=$2) as kind, exists(select 1 from room_types where id=$1) as t`, [roomTypeId, itemId])) as { kind: string | null; t: boolean }[];
  if (!ok[0]?.t) return { error: 'Type de chambre inconnu.' };
  if (ok[0].kind !== 'minibar') return { error: 'Choisissez un article de nature « minibar ».' };
  await sql().query(
    `insert into minibar_dotation (room_type_id, item_id, qty) values ($1,$2,$3) on conflict (room_type_id, item_id) do update set qty = excluded.qty`, [roomTypeId, itemId, qty],
  );
  return { ok: true };
}

export async function deleteDotation(roomTypeId: number, itemId: number): Promise<boolean> {
  return ((await sql().query(`delete from minibar_dotation where room_type_id=$1 and item_id=$2 returning item_id`, [roomTypeId, itemId])) as unknown[]).length > 0;
}

export type MinibarRoom = {
  roomId: number; number: string; building: string; typeLabel: string | null; lastReading: string | null;
  lines: { itemId: number; itemName: string; dotation: number; price: number }[];
};

// Chambres équipées d'un minibar, avec ce qui doit s'y trouver.
export async function minibarRooms(): Promise<MinibarRoom[]> {
  const rooms = (await sql().query(
    `select r.id::int as "roomId", r.number, r.building, t.label as "typeLabel", r.room_type_id::int as "typeId",
       to_char((select max(at) from minibar_readings m where m.room_id = r.id) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastReading"
     from rooms r left join room_types t on t.id = r.room_type_id where r.active and r.minibar`,
  )) as (Omit<MinibarRoom, 'lines'> & { typeId: number | null })[];
  const dot = (await sql().query(
    `select d.room_type_id::int as "typeId", d.item_id::int as "itemId", i.name as "itemName", d.qty as dotation, i.price
     from minibar_dotation d join items i on i.id = d.item_id where i.active order by i.name`,
  )) as { typeId: number; itemId: number; itemName: string; dotation: number; price: number }[];
  return rooms
    .map(({ typeId, ...r }) => ({ ...r, lines: dot.filter((d) => d.typeId === typeId).map(({ typeId: _t, ...d }) => d) }))
    .sort((a, b) => natural(a.number, b.number));
}

export type ReadingResult = { readingId: number; consumed: { itemId: number; itemName: string; qty: number; amount: number }[]; total: number };

// Relevé : l'agent compte ce qui reste, l'application déduit la consommation, sort le stock de la réserve et crée l'extra (si l'article a un prix).
export async function recordReading(roomId: number, counts: { itemId: number; counted: number }[], staffId: number | null, today: string): Promise<ReadingResult | { error: string }> {
  const room = (await sql().query(`select r.id::int as id, r.room_type_id::int as "typeId", r.minibar, r.active from rooms r where r.id = $1`, [roomId])) as { id: number; typeId: number | null; minibar: boolean; active: boolean }[];
  if (!room[0] || !room[0].active) return { error: 'Chambre inconnue.' };
  if (!room[0].minibar) return { error: 'Cette chambre n’a pas de minibar.' };
  const dot = (await sql().query(
    `select d.item_id::int as "itemId", i.name as "itemName", d.qty as dotation, i.price from minibar_dotation d join items i on i.id = d.item_id where d.room_type_id = $1`, [room[0].typeId],
  )) as { itemId: number; itemName: string; dotation: number; price: number }[];
  if (!dot.length) return { error: 'Aucune dotation de minibar définie pour ce type de chambre.' };
  const given = new Map(counts.map((c) => [c.itemId, c.counted]));
  for (const c of counts) {
    if (!dot.some((d) => d.itemId === c.itemId)) return { error: 'Article hors dotation.' };
    if (!Number.isInteger(c.counted) || c.counted < 0 || c.counted > 99) return { error: 'Quantité comptée invalide.' };
  }
  const stay = (await sql().query(
    `select id::int as id from stays where room_id = $1 and status = 'booked' and arrival <= $2::date and departure >= $2::date order by arrival asc limit 1`, [roomId, today],
  )) as { id: number }[];
  const rd = (await sql().query(`insert into minibar_readings (room_id, staff_id) values ($1,$2) returning id::int as id`, [roomId, sid(staffId)])) as { id: number }[];
  const readingId = rd[0].id;
  const consumedOut: ReadingResult['consumed'] = [];
  let total = 0;
  for (const d of dot) {
    // Un article non compté est considéré comme intact (consommation 0).
    const counted = given.get(d.itemId) ?? d.dotation;
    const { consumed } = minibarConsumption(d.dotation, counted);
    await sql().query(
      `insert into minibar_reading_lines (reading_id, item_id, dotation, counted, consumed, unit_price) values ($1,$2,$3,$4,$5,$6)`, [readingId, d.itemId, d.dotation, counted, consumed, d.price],
    );
    if (consumed <= 0) continue;
    await addMovement({ itemId: d.itemId, location: 'store', qty: -consumed, reason: 'minibar', ref: `minibar:${readingId}`, staffId });
    if (d.price > 0) {
      await sql().query(
        `insert into charges (room_id, stay_id, source, label, qty, unit_price, ref, staff_id) values ($1,$2,'minibar',$3,$4,$5,$6,$7)`,
        [roomId, stay[0]?.id ?? null, d.itemName, consumed, d.price, `minibar:${readingId}`, sid(staffId)],
      );
      total += consumed * d.price;
    }
    consumedOut.push({ itemId: d.itemId, itemName: d.itemName, qty: consumed, amount: consumed * d.price });
  }
  return { readingId, consumed: consumedOut, total };
}

// ---- Extras ----

export type Charge = {
  id: number; roomId: number; roomNumber: string; source: 'minibar' | 'room_service' | 'laundry' | 'other'; label: string;
  qty: number; unitPrice: number; amount: number; carried: boolean; voided: boolean; createdAt: string; staffName: string | null;
};
export const CHARGE_SOURCES = ['minibar', 'room_service', 'laundry', 'other'] as const;
export type ChargeSource = (typeof CHARGE_SOURCES)[number];
export const isChargeSource = (v: unknown): v is ChargeSource => typeof v === 'string' && (CHARGE_SOURCES as readonly string[]).includes(v);
export const SOURCE_LABEL: Record<ChargeSource, string> = { minibar: 'Minibar', room_service: 'Room service', laundry: 'Blanchisserie', other: 'Divers' };

export async function listCharges(showAll: boolean): Promise<Charge[]> {
  const rows = (await sql().query(
    `select c.id::int as id, c.room_id::int as "roomId", r.number as "roomNumber", c.source, c.label, c.qty, c.unit_price as "unitPrice", c.amount::int as amount,
       c.carried, c.voided, to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt", s.display_name as "staffName"
     from charges c join rooms r on r.id = c.room_id left join staff s on s.id = c.staff_id
     ${showAll ? `where c.created_at > now() - interval '60 days'` : 'where not c.carried and not c.voided'} order by c.id desc limit 500`,
  )) as Charge[];
  return rows;
}

export type ChargeInput = { roomId: number; source: ChargeSource; label: string; qty: number; unitPrice: number };

export async function addCharge(v: ChargeInput, staffId: number | null, today: string): Promise<{ id: number } | { error: string }> {
  const room = (await sql().query(`select 1 from rooms where id = $1 and active`, [v.roomId])) as unknown[];
  if (!room.length) return { error: 'Chambre inconnue.' };
  const stay = (await sql().query(
    `select id::int as id from stays where room_id = $1 and status = 'booked' and arrival <= $2::date and departure >= $2::date order by arrival asc limit 1`, [v.roomId, today],
  )) as { id: number }[];
  const r = (await sql().query(
    `insert into charges (room_id, stay_id, source, label, qty, unit_price, staff_id) values ($1,$2,$3,$4,$5,$6,$7) returning id::int as id`,
    [v.roomId, stay[0]?.id ?? null, v.source, v.label, v.qty, v.unitPrice, sid(staffId)],
  )) as { id: number }[];
  return { id: r[0].id };
}

export async function markCarried(ids: number[], carried: boolean): Promise<number> {
  const r = (await sql().query(
    `update charges set carried = $2, carried_at = case when $2 then now() else null end where id = any($1::bigint[]) and not voided returning id`, [ids, carried],
  )) as unknown[];
  return r.length;
}

export async function voidCharge(id: number): Promise<boolean> {
  return ((await sql().query(`update charges set voided = true where id = $1 and not carried returning id`, [id])) as unknown[]).length > 0;
}
