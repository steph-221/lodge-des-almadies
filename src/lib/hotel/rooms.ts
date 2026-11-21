import { sql } from '../db';
import type { RoomImportRow } from './import';
import type { RoomInput, RoomTypeInput } from './validate';

export const ROOM_STATUSES = ['dirty', 'in_progress', 'to_check', 'ready', 'out_of_service'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export const isRoomStatus = (v: unknown): v is RoomStatus => typeof v === 'string' && (ROOM_STATUSES as readonly string[]).includes(v);
export const STATUS_LABEL: Record<RoomStatus, string> = {
  dirty: 'À nettoyer', in_progress: 'En cours', to_check: 'À contrôler', ready: 'Prête', out_of_service: 'Hors service',
};

export type RoomType = { id: number; code: string; label: string; baseCapacity: number; maxCapacity: number; beds: string; active: boolean };
export type Room = {
  id: number; number: string; building: string; floor: string; roomTypeId: number | null; typeLabel: string | null;
  maxCapacity: number | null; minibar: boolean; notes: string; active: boolean; status: RoomStatus;
};

const TYPE_COLS = `id::int as id, code, label, base_capacity::int as "baseCapacity", max_capacity::int as "maxCapacity", beds, active`;
const ROOM_SELECT = `select r.id::int as id, r.number, r.building, r.floor, r.room_type_id::int as "roomTypeId", t.label as "typeLabel",
  t.max_capacity::int as "maxCapacity", r.minibar, r.notes, r.active, r.status
  from rooms r left join room_types t on t.id = r.room_type_id`;

const code23 = (e: unknown) => (e as { code?: string }).code;

// Tri naturel : 2, 10, 101 et non 10, 101, 2.
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

export async function listRoomTypes(): Promise<RoomType[]> {
  return (await sql().query(`select ${TYPE_COLS} from room_types order by active desc, label`)) as RoomType[];
}

export async function createRoomType(v: RoomTypeInput): Promise<{ type: RoomType } | { error: string }> {
  try {
    const rows = (await sql().query(
      `insert into room_types (code, label, base_capacity, max_capacity, beds) values ($1,$2,$3,$4,$5) returning ${TYPE_COLS}`,
      [v.code, v.label, v.baseCapacity, v.maxCapacity, v.beds],
    )) as RoomType[];
    return { type: rows[0] };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Ce code de type existe déjà.' };
    throw e;
  }
}

export async function updateRoomType(id: number, v: RoomTypeInput & { active?: boolean }): Promise<{ type: RoomType } | { error: string }> {
  try {
    const rows = (await sql().query(
      `update room_types set code=$2, label=$3, base_capacity=$4, max_capacity=$5, beds=$6, active=coalesce($7, active) where id=$1 returning ${TYPE_COLS}`,
      [id, v.code, v.label, v.baseCapacity, v.maxCapacity, v.beds, v.active ?? null],
    )) as RoomType[];
    return rows[0] ? { type: rows[0] } : { error: 'Type inconnu.' };
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
          const res = await createRoomType({ code, label, baseCapacity: 2, maxCapacity: 2, beds: '' });
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
