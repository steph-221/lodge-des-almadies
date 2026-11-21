import { sql } from '../db';
import type { StayImportRow } from './import';
import type { StayInput } from './validate';

export type Stay = {
  id: number; roomId: number; roomNumber: string; guestName: string; guests: number; arrival: string; departure: string;
  arrivalTime: string | null; extraBed: boolean; babyCot: boolean; notes: string; source: string; externalId: string | null; status: 'booked' | 'cancelled';
};

const SELECT = `select s.id::int as id, s.room_id::int as "roomId", r.number as "roomNumber", s.guest_name as "guestName", s.guests::int as guests,
  to_char(s.arrival,'YYYY-MM-DD') as arrival, to_char(s.departure,'YYYY-MM-DD') as departure, s.arrival_time as "arrivalTime",
  s.extra_bed as "extraBed", s.baby_cot as "babyCot", s.notes, s.source, s.external_id as "externalId", s.status
  from stays s join rooms r on r.id = s.room_id`;

const code23 = (e: unknown) => (e as { code?: string }).code;
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

// Séjours qui touchent la période [from, to] (jours hôteliers aaaa-mm-jj), annulés exclus.
export async function listStays(from: string, to: string): Promise<Stay[]> {
  const rows = (await sql().query(
    `${SELECT} where s.status = 'booked' and s.arrival <= $2::date and s.departure >= $1::date order by s.arrival, s.id`,
    [from, to],
  )) as Stay[];
  return rows.sort((a, b) => a.arrival.localeCompare(b.arrival) || natural(a.roomNumber, b.roomNumber));
}

export async function getStay(id: number): Promise<Stay | null> {
  return ((await sql().query(`${SELECT} where s.id = $1`, [id])) as Stay[])[0] ?? null;
}

// Capacité : un type de chambre peut limiter le nombre de personnes (la capacité maximale compte lit d'appoint et lit bébé).
async function capacityError(roomId: number, guests: number): Promise<string | null> {
  const rows = (await sql().query(
    `select r.number, r.active, t.max_capacity::int as max from rooms r left join room_types t on t.id = r.room_type_id where r.id = $1`, [roomId],
  )) as { number: string; active: boolean; max: number | null }[];
  const r = rows[0];
  if (!r) return 'Chambre inconnue.';
  if (!r.active) return `La chambre ${r.number} est désactivée.`;
  if (r.max !== null && guests > r.max) return `La chambre ${r.number} accepte ${r.max} personne(s) au maximum.`;
  return null;
}

const overlapMsg = 'Cette chambre est déjà occupée sur tout ou partie de ces dates.';

export async function createStay(v: StayInput, staffId: number | null, source: 'manual' | 'import' = 'manual'): Promise<{ stay: Stay } | { error: string }> {
  const cap = await capacityError(v.roomId, v.guests);
  if (cap) return { error: cap };
  try {
    const ins = (await sql().query(
      `insert into stays (room_id, guest_name, guests, arrival, departure, arrival_time, extra_bed, baby_cot, notes, source, external_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id::int as id`,
      [v.roomId, v.guestName, v.guests, v.arrival, v.departure, v.arrivalTime, v.extraBed, v.babyCot, v.notes, source, v.externalId || null, staffId && staffId > 0 ? staffId : null],
    )) as { id: number }[];
    return { stay: (await getStay(ins[0].id))! };
  } catch (e) {
    if (code23(e) === '23P01') return { error: overlapMsg };
    if (code23(e) === '23505') return { error: 'Cette référence de réservation existe déjà.' };
    throw e;
  }
}

export async function updateStay(id: number, v: StayInput): Promise<{ stay: Stay } | { error: string }> {
  const cap = await capacityError(v.roomId, v.guests);
  if (cap) return { error: cap };
  try {
    const rows = (await sql().query(
      `update stays set room_id=$2, guest_name=$3, guests=$4, arrival=$5, departure=$6, arrival_time=$7, extra_bed=$8, baby_cot=$9, notes=$10,
         external_id=$11 where id=$1 and status='booked' returning id::int as id`,
      [id, v.roomId, v.guestName, v.guests, v.arrival, v.departure, v.arrivalTime, v.extraBed, v.babyCot, v.notes, v.externalId || null],
    )) as { id: number }[];
    if (!rows[0]) return { error: 'Séjour inconnu ou annulé.' };
    return { stay: (await getStay(id))! };
  } catch (e) {
    if (code23(e) === '23P01') return { error: overlapMsg };
    if (code23(e) === '23505') return { error: 'Cette référence de réservation existe déjà.' };
    throw e;
  }
}

export async function cancelStay(id: number): Promise<boolean> {
  const rows = (await sql().query(`update stays set status='cancelled' where id=$1 and status='booked' returning id`, [id])) as unknown[];
  return rows.length > 0;
}

export type StayImportResult = { created: number; updated: number; skipped: number; errors: { line: number; message: string }[] };

// Importe des séjours. Avec une référence : mise à jour si elle existe déjà. Sans référence : on ignore un séjour identique déjà présent.
export async function importStays(rows: StayImportRow[], staffId: number | null): Promise<StayImportResult> {
  const rooms = (await sql().query(`select id::int as id, lower(number) as n from rooms where active`)) as { id: number; n: string }[];
  const byNumber = new Map(rooms.map((r) => [r.n, r.id]));
  const out: StayImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = r.line;
    const roomId = byNumber.get(r.room.toLowerCase());
    if (!roomId) { out.errors.push({ line, message: `Chambre ${r.room} inconnue : créez ou importez d’abord les chambres.` }); continue; }
    const input: StayInput = {
      roomId, guestName: r.guest, guests: r.guests, arrival: r.arrival, departure: r.departure, arrivalTime: r.time,
      extraBed: r.extraBed, babyCot: r.babyCot, notes: r.notes, externalId: r.externalId,
    };
    try {
      if (r.externalId) {
        const ex = (await sql().query(`select id::int as id from stays where source='import' and external_id=$1`, [r.externalId])) as { id: number }[];
        if (ex[0]) {
          const res = await updateStay(ex[0].id, input);
          if ('error' in res) out.errors.push({ line, message: res.error }); else out.updated++;
          continue;
        }
      } else {
        const same = (await sql().query(
          `select 1 from stays where status='booked' and room_id=$1 and arrival=$2 and departure=$3 and lower(guest_name)=lower($4)`,
          [roomId, r.arrival, r.departure, r.guest],
        )) as unknown[];
        if (same.length) { out.skipped++; continue; }
      }
      const res = await createStay(input, staffId, 'import');
      if ('error' in res) out.errors.push({ line, message: res.error }); else out.created++;
    } catch (e) {
      console.error('[import séjours]', (e as Error).message);
      out.errors.push({ line, message: 'Erreur d’enregistrement.' });
    }
  }
  return out;
}
