import { sql } from '../db';
import { AMENITY_VALUES, isAmenityValue, type AmenityValue, type AmenityItem } from './amenities-core';
export { AMENITY_VALUES, type AmenityValue };
import type { RoomImportRow } from './import';
import type { RoomInput, RoomTypeInput } from './validate';

export const ROOM_STATUSES = ['dirty', 'in_progress', 'to_check', 'ready', 'out_of_service'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export const isRoomStatus = (v: unknown): v is RoomStatus => typeof v === 'string' && (ROOM_STATUSES as readonly string[]).includes(v);
export const STATUS_LABEL: Record<RoomStatus, string> = {
  dirty: 'À nettoyer', in_progress: 'En cours', to_check: 'À contrôler', ready: 'Prête', out_of_service: 'Hors service',
};

export type Amenity = { key: string; labelFr: string; labelEn: string; position: number };
export type TypeAmenity = { key: string; value: AmenityValue };

export type RoomType = {
  id: number; code: string; label: string; baseCapacity: number; maxCapacity: number; beds: string; active: boolean;
  labelEn: string; building: string; location: string; areaM2: number | null; priceFcfa: number | null; extraBedFcfa: number | null;
  descriptionFr: string; descriptionEn: string; position: number; roomCount: number; amenities: TypeAmenity[];
};
export type Room = {
  id: number; number: string; building: string; floor: string; roomTypeId: number | null; typeLabel: string | null;
  maxCapacity: number | null; minibar: boolean; notes: string; active: boolean; status: RoomStatus;
};

const TYPE_COLS = `id::int as id, code, label, base_capacity::int as "baseCapacity", max_capacity::int as "maxCapacity", beds, active,
  label_en as "labelEn", building, location, area_m2::float8 as "areaM2", price_fcfa::int as "priceFcfa", extra_bed_fcfa::int as "extraBedFcfa",
  description_fr as "descriptionFr", description_en as "descriptionEn", position::int as position`;
// Nombre de chambres actives et grille des équipements, lus avec le type.
const TYPE_EXTRA = `(select count(*)::int from rooms r where r.room_type_id = room_types.id and r.active) as "roomCount",
  coalesce((select json_agg(json_build_object('key', a.amenity_key, 'value', a.value) order by m.position)
    from room_type_amenities a join amenities m on m.key = a.amenity_key where a.room_type_id = room_types.id), '[]'::json) as amenities`;
const ROOM_SELECT = `select r.id::int as id, r.number, r.building, r.floor, r.room_type_id::int as "roomTypeId", t.label as "typeLabel",
  t.max_capacity::int as "maxCapacity", r.minibar, r.notes, r.active, r.status
  from rooms r left join room_types t on t.id = r.room_type_id`;

const code23 = (e: unknown) => (e as { code?: string }).code;

// Tri naturel : 2, 10, 101 et non 10, 101, 2.
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

// Descriptif vide, pour un type créé à la volée (import de chambres).
const NO_DETAILS = { labelEn: '', building: '', location: '', areaM2: null, priceFcfa: null, extraBedFcfa: null, descriptionFr: '', descriptionEn: '' };

export async function listRoomTypes(): Promise<RoomType[]> {
  return (await sql().query(`select ${TYPE_COLS}, ${TYPE_EXTRA} from room_types order by active desc, position, label`)) as RoomType[];
}

export async function getRoomType(id: number): Promise<RoomType | null> {
  return ((await sql().query(`select ${TYPE_COLS}, ${TYPE_EXTRA} from room_types where id = $1`, [id])) as RoomType[])[0] ?? null;
}

export async function listAmenities(): Promise<Amenity[]> {
  return (await sql().query(`select key, label_fr as "labelFr", label_en as "labelEn", position::int as position from amenities order by position, key`)) as Amenity[];
}

// Remplace la grille des équipements d'un type : seules les clés connues et les valeurs prévues sont gardées.
export async function setTypeAmenities(id: number, values: Record<string, string>): Promise<void> {
  const known = new Set((await listAmenities()).map((a) => a.key));
  const rows = Object.entries(values).filter(([k, v]) => known.has(k) && (AMENITY_VALUES as readonly string[]).includes(v));
  for (const [k, v] of rows) {
    await sql().query(
      `insert into room_type_amenities (room_type_id, amenity_key, value) values ($1,$2,$3)
       on conflict (room_type_id, amenity_key) do update set value = excluded.value`, [id, k, v]);
  }
}

export async function createRoomType(v: RoomTypeInput): Promise<{ type: RoomType } | { error: string }> {
  try {
    const rows = (await sql().query(
      `insert into room_types (code, label, base_capacity, max_capacity, beds, label_en, building, location, area_m2, price_fcfa, extra_bed_fcfa, description_fr, description_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id::int as id`,
      [v.code, v.label, v.baseCapacity, v.maxCapacity, v.beds, v.labelEn, v.building, v.location, v.areaM2, v.priceFcfa, v.extraBedFcfa, v.descriptionFr, v.descriptionEn],
    )) as { id: number }[];
    return { type: (await getRoomType(rows[0].id))! };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Ce code de type existe déjà.' };
    throw e;
  }
}

export async function updateRoomType(id: number, v: RoomTypeInput & { active?: boolean }): Promise<{ type: RoomType } | { error: string }> {
  try {
    const rows = (await sql().query(
      `update room_types set code=$2, label=$3, base_capacity=$4, max_capacity=$5, beds=$6, active=coalesce($7, active),
         label_en=$8, building=$9, location=$10, area_m2=$11, price_fcfa=$12, extra_bed_fcfa=$13, description_fr=$14, description_en=$15
       where id=$1 returning id::int as id`,
      [id, v.code, v.label, v.baseCapacity, v.maxCapacity, v.beds, v.active ?? null, v.labelEn, v.building, v.location, v.areaM2, v.priceFcfa, v.extraBedFcfa, v.descriptionFr, v.descriptionEn],
    )) as { id: number }[];
    return rows[0] ? { type: (await getRoomType(id))! } : { error: 'Type inconnu.' };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Ce code de type existe déjà.' };
    throw e;
  }
}

export async function listRooms(): Promise<Room[]> {
  const rows = (await sql().query(`${ROOM_SELECT}`)) as Room[];
  return rows.sort((a, b) => Number(b.active) - Number(a.active) || natural(a.number, b.number));
}

export async function getRoom(id: number): Promise<Room | null> {
  return ((await sql().query(`${ROOM_SELECT} where r.id = $1`, [id])) as Room[])[0] ?? null;
}

export async function createRoom(v: RoomInput): Promise<{ room: Room } | { error: string }> {
  try {
    const ins = (await sql().query(
      `insert into rooms (number, building, floor, room_type_id, minibar, notes) values ($1,$2,$3,$4,$5,$6) returning id::int as id`,
      [v.number, v.building, v.floor, v.roomTypeId, v.minibar, v.notes],
    )) as { id: number }[];
    return { room: (await getRoom(ins[0].id))! };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Cette chambre existe déjà.' };
    if (code23(e) === '23503') return { error: 'Type de chambre inconnu.' };
    throw e;
  }
}

export async function updateRoom(id: number, v: RoomInput & { active?: boolean }): Promise<{ room: Room } | { error: string }> {
  try {
    const rows = (await sql().query(
      `update rooms set number=$2, building=$3, floor=$4, room_type_id=$5, minibar=$6, notes=$7, active=coalesce($8, active) where id=$1 returning id::int as id`,
      [id, v.number, v.building, v.floor, v.roomTypeId, v.minibar, v.notes, v.active ?? null],
    )) as { id: number }[];
    if (!rows[0]) return { error: 'Chambre inconnue.' };
    return { room: (await getRoom(id))! };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Ce numéro de chambre existe déjà.' };
    if (code23(e) === '23503') return { error: 'Type de chambre inconnu.' };
    throw e;
  }
}

// auto : changement déduit d'une tâche de ménage, il ne sort jamais une chambre de l'état « hors service » (décision humaine).
export async function setRoomStatus(id: number, status: RoomStatus, staffId: number | null, auto = false): Promise<boolean> {
  const rows = (await sql().query(
    `update rooms set status=$2, status_at=now() where id=$1 and status <> $2 and ($3::boolean = false or status <> 'out_of_service') returning id`,
    [id, status, auto],
  )) as unknown[];
  if (rows.length) await sql().query(`insert into room_status_log (room_id, status, staff_id) values ($1,$2,$3)`, [id, status, staffId && staffId > 0 ? staffId : null]);
  return rows.length > 0;
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'type';

// Importe des chambres : crée les nouvelles, met à jour les existantes (même numéro), crée au besoin les types cités.
export async function importRooms(rows: RoomImportRow[]): Promise<{ created: number; updated: number; typesCreated: number; errors: { number: string; message: string }[] }> {
  const types = await listRoomTypes();
  const byKey = new Map<string, number>();
  for (const t of types) { byKey.set(t.code.toLowerCase(), t.id); byKey.set(t.label.toLowerCase(), t.id); }
  const existing = new Map((await listRooms()).map((r) => [r.number.toLowerCase(), r.id]));
  let created = 0, updated = 0, typesCreated = 0;
  const errors: { number: string; message: string }[] = [];
  for (const r of rows) {
    try {
      let typeId: number | null = null;
      if (r.type) {
        typeId = byKey.get(r.type.toLowerCase()) ?? null;
        if (typeId === null) {
          const label = r.type.slice(0, 80);
          let code = slug(r.type);
          for (let n = 2; byKey.has(code) ; n++) code = `${slug(r.type).slice(0, 26)}-${n}`;
          const res = await createRoomType({ code, label, baseCapacity: 2, maxCapacity: 2, beds: '', ...NO_DETAILS });
          if ('error' in res) { errors.push({ number: r.number, message: res.error }); continue; }
          typeId = res.type.id; typesCreated++;
          byKey.set(res.type.code.toLowerCase(), typeId); byKey.set(res.type.label.toLowerCase(), typeId);
        }
      }
      const input: RoomInput = { number: r.number, building: r.building, floor: r.floor, minibar: r.minibar, notes: r.notes, roomTypeId: typeId };
      const id = existing.get(r.number.toLowerCase());
      const res = id ? await updateRoom(id, input) : await createRoom(input);
      if ('error' in res) errors.push({ number: r.number, message: res.error });
      else if (id) updated++; else { created++; existing.set(r.number.toLowerCase(), res.room.id); }
    } catch (e) {
      console.error('[import chambres]', (e as Error).message);
      errors.push({ number: r.number, message: 'Erreur d’enregistrement.' });
    }
  }
  return { created, updated, typesCreated, errors };
}

// ---------- Équipements par chambre ----------
// Une chambre hérite de la grille de son type ; room_amenities ne garde que les écarts (ex. communication : 203 oui, 205 non).

export type RoomAmenity = AmenityItem & { typeValue: AmenityValue | null; own: boolean };

export async function listRoomAmenities(roomId: number): Promise<RoomAmenity[]> {
  return (await sql().query(
    `select m.key, m.label_fr as "labelFr", m.label_en as "labelEn", coalesce(ra.value, ta.value) as value, ta.value as "typeValue", (ra.value is not null) as own
     from amenities m
     join rooms r on r.id = $1
     left join room_type_amenities ta on ta.room_type_id = r.room_type_id and ta.amenity_key = m.key
     left join room_amenities ra on ra.room_id = r.id and ra.amenity_key = m.key
     order by m.position, m.key`, [roomId],
  )) as RoomAmenity[];
}

// values : clé -> valeur ; '' ou valeur identique à celle du type = retour à l'héritage. Renvoie le nombre d'écarts enregistrés.
export async function setRoomAmenities(roomId: number, values: Record<string, unknown>): Promise<number> {
  const current = new Map((await listRoomAmenities(roomId)).map((a) => [a.key, a]));
  for (const [k, v] of Object.entries(values)) {
    const a = current.get(k);
    if (!a) continue;
    if (v === '' || v === null || (isAmenityValue(v) && v === a.typeValue)) {
      await sql().query(`delete from room_amenities where room_id = $1 and amenity_key = $2`, [roomId, k]);
    } else if (isAmenityValue(v)) {
      await sql().query(
        `insert into room_amenities (room_id, amenity_key, value) values ($1,$2,$3)
         on conflict (room_id, amenity_key) do update set value = excluded.value`, [roomId, k, v]);
    }
  }
  return ((await sql().query(`select count(*)::int as n from room_amenities where room_id = $1`, [roomId])) as { n: number }[])[0].n;
}

// Toutes les chambres actives avec leurs équipements effectifs (pour le listing CSV).
export async function listAmenityMatrix(): Promise<{ number: string; building: string; typeLabel: string; values: Record<string, AmenityValue | null> }[]> {
  const rows = (await sql().query(
    `select r.number, r.building, coalesce(t.label, '') as "typeLabel", m.key, coalesce(ra.value, ta.value) as value
     from rooms r
     cross join amenities m
     left join room_types t on t.id = r.room_type_id
     left join room_type_amenities ta on ta.room_type_id = r.room_type_id and ta.amenity_key = m.key
     left join room_amenities ra on ra.room_id = r.id and ra.amenity_key = m.key
     where r.active`,
  )) as { number: string; building: string; typeLabel: string; key: string; value: AmenityValue | null }[];
  const by = new Map<string, { number: string; building: string; typeLabel: string; values: Record<string, AmenityValue | null> }>();
  for (const r of rows) {
    const e = by.get(r.number) ?? { number: r.number, building: r.building, typeLabel: r.typeLabel, values: {} };
    e.values[r.key] = r.value;
    by.set(r.number, e);
  }
  return [...by.values()].sort((a, b) => natural(a.number, b.number));
}

// Fiche d'une chambre pour le client (page du QR code) : caractéristiques du type et équipements effectifs.
export type RoomSheet = { typeLabel: string; typeLabelEn: string; building: string; areaM2: number | null; beds: string; amenities: AmenityItem[] };

export async function getRoomSheet(roomId: number): Promise<RoomSheet | null> {
  const t = (await sql().query(
    `select t.label as "typeLabel", t.label_en as "typeLabelEn", coalesce(nullif(r.building, ''), t.building) as building, t.area_m2::float8 as "areaM2", t.beds
     from rooms r join room_types t on t.id = r.room_type_id where r.id = $1`, [roomId],
  )) as Omit<RoomSheet, 'amenities'>[];
  if (!t[0]) return null;
  return { ...t[0], amenities: await listRoomAmenities(roomId) };
}
