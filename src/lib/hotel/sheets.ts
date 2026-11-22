// Fiches de ménage papier : création, photo, lecture par IA, validation. Accès base, serveur uniquement.
import { sql } from '../db';
import { driveDelete, driveConfigured } from '../drive';
import { saveFile, sniffMime } from './files';
import { minibarRooms, recordReading } from './minibar';
import {
  appendNote, buildSheetRows, parseRead, shouldMarkDone, sheetCode, type FinalRow, type ReadResult, type SheetRow,
} from './sheets-core';
import { setTaskStatus, type TaskStatus } from './tasks';
import { readSheetPhoto, sheetModel, visionConfigured } from './vision';

export type SheetStatus = 'printed' | 'read' | 'validated' | 'cancelled';
export type SheetSummary = { id: number; code: string; date: string; staffId: number | null; staffName: string | null; status: SheetStatus; rooms: number; hasPhoto: boolean };

const SUMMARY = `select s.id::int as id, to_char(s.sheet_date,'YYYY-MM-DD') as date, s.staff_id::int as "staffId", st.display_name as "staffName", s.status,
    jsonb_array_length(s.rows)::int as rooms,
    exists(select 1 from sheet_reads r where r.sheet_id = s.id and r.file_id is not null) as "hasPhoto"
  from hk_sheets s left join staff st on st.id = s.staff_id`;

export async function listSheets(date: string, onlyStaffId?: number): Promise<SheetSummary[]> {
  const rows = (await sql().query(
    `${SUMMARY} where s.sheet_date = $1::date ${onlyStaffId ? 'and s.staff_id = $2' : ''} order by s.id desc`, onlyStaffId ? [date, onlyStaffId] : [date],
  )) as Omit<SheetSummary, 'code'>[];
  return rows.map((r) => ({ ...r, code: sheetCode(r.id) }));
}

export type SheetDetail = SheetSummary & { rows: SheetRow[]; applied: Record<string, { done?: boolean; minibar?: boolean }>; read: SheetReadView | null; fileId: number | null };
export type SheetReadView = { id: number; status: 'read' | 'failed'; error: string; model: string; at: string; parsed: ReadResult | null };

export async function getSheet(id: number): Promise<SheetDetail | null> {
  const base = (await sql().query(
    `select s.id::int as id, to_char(s.sheet_date,'YYYY-MM-DD') as date, s.staff_id::int as "staffId", st.display_name as "staffName", s.status,
       s.rows, s.applied, jsonb_array_length(s.rows)::int as rooms
     from hk_sheets s left join staff st on st.id = s.staff_id where s.id = $1`, [id],
  )) as (Omit<SheetSummary, 'code' | 'hasPhoto'> & { rows: SheetRow[]; applied: SheetDetail['applied'] })[];
  const s = base[0];
  if (!s) return null;
  const rd = (await sql().query(
    `select id::int as id, status, error, model, to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as at, file_id::int as "fileId", result
     from sheet_reads where sheet_id = $1 order by id desc limit 1`, [id],
  )) as { id: number; status: 'read' | 'failed'; error: string; model: string; at: string; fileId: number | null; result: { parsed?: ReadResult } | null }[];
  const last = rd[0];
  const hasPhoto = ((await sql().query(`select exists(select 1 from sheet_reads where sheet_id=$1 and file_id is not null) as e`, [id])) as { e: boolean }[])[0].e;
  return {
    ...s, code: sheetCode(s.id), hasPhoto,
    fileId: last?.fileId ?? null,
    read: last ? { id: last.id, status: last.status, error: last.error, model: last.model, at: last.at, parsed: last.result?.parsed ?? null } : null,
  };
}

// Crée la fiche d'une personne (ou des chambres non attribuées) pour un jour : seulement les tâches encore à faire.
export async function createSheet(date: string, staffId: number | null, createdBy: number | null): Promise<{ id: number } | { error: string }> {
  const tasks = (await sql().query(
    `select k.id::int as id, k.room_id::int as "roomId", r.number as "roomNumber", k.kind, k.guests::int as guests
     from hk_tasks k join rooms r on r.id = k.room_id
     where k.task_date = $1::date and k.status in ('todo','doing') and ${staffId ? 'k.assigned_to = $2' : 'k.assigned_to is null'}`,
    staffId ? [date, staffId] : [date],
  )) as { id: number; roomId: number; roomNumber: string; kind: 'depart' | 'recouche'; guests: number | null }[];
  if (!tasks.length) return { error: staffId ? 'Aucune chambre à faire attribuée à cette personne ce jour-là.' : 'Aucune chambre à faire sans attribution ce jour-là.' };
  // Une tâche ne figure que sur une fiche active : évite deux feuilles pour la même chambre.
  const taken = (await sql().query(
    `select distinct (x->>'taskId')::bigint::int as id from hk_sheets s, jsonb_array_elements(s.rows) x
     where s.sheet_date = $1::date and s.status in ('printed','read')`, [date],
  )) as { id: number }[];
  const takenIds = new Set(taken.map((t) => t.id));
  const free = tasks.filter((t) => !takenIds.has(t.id));
  if (!free.length) return { error: 'Toutes ces chambres figurent déjà sur une fiche en cours. Annulez-la pour en refaire une.' };
  const mb = (await minibarRooms()).map((m) => ({ roomId: m.roomId, lines: m.lines }));
  const rows = buildSheetRows(free, mb);
  const r = (await sql().query(
    `insert into hk_sheets (sheet_date, staff_id, rows, created_by) values ($1::date, $2, $3::jsonb, $4) returning id::int as id`,
    [date, staffId, JSON.stringify(rows), createdBy && createdBy > 0 ? createdBy : null],
  )) as { id: number }[];
  return { id: r[0].id };
}

export async function cancelSheet(id: number): Promise<boolean> {
  const r = (await sql().query(`update hk_sheets set status='cancelled' where id=$1 and status in ('printed','read') returning id`, [id])) as unknown[];
  return r.length > 0;
}

// Range la photo puis la fait lire. Si la lecture échoue, la photo reste et la gouvernante saisit la fiche à la main.
export async function addPhoto(sheet: SheetDetail, bytes: Uint8Array, staffId: number | null): Promise<{ readId: number; status: 'read' | 'failed'; notice?: string } | { error: string }> {
  if (sheet.status !== 'printed' && sheet.status !== 'read') return { error: 'Cette fiche n’accepte plus de photo.' };
  const saved = await saveFile({ kind: 'sheet', entityId: sheet.id, bytes, staffId, folder: ['Fiches', sheet.date] });
  if ('error' in saved) return { error: saved.error };
  const mime = sniffMime(bytes)!;
  const by = staffId && staffId > 0 ? staffId : null;
  if (!visionConfigured()) {
    const x = (await sql().query(
      `insert into sheet_reads (sheet_id, file_id, status, error, created_by) values ($1,$2,'failed',$3,$4) returning id::int as id`,
      [sheet.id, saved.id, 'Lecture par IA non configurée : saisissez la fiche à la main.', by],
    )) as { id: number }[];
    return { readId: x[0].id, status: 'failed', notice: 'Lecture par IA non configurée : saisissez la fiche à la main.' };
  }
  try {
    const v = await readSheetPhoto({ bytes, mime, rows: sheet.rows, code: sheet.code });
    const parsed = parseRead(v.raw, sheet.rows, sheet.code);
    const x = (await sql().query(
      `insert into sheet_reads (sheet_id, file_id, model, status, result, input_tokens, output_tokens, created_by)
       values ($1,$2,$3,'read',$4::jsonb,$5,$6,$7) returning id::int as id`,
      [sheet.id, saved.id, v.model.slice(0, 80), JSON.stringify({ raw: v.raw, parsed }), v.inputTokens, v.outputTokens, by],
    )) as { id: number }[];
    await sql().query(`update hk_sheets set status='read' where id=$1 and status='printed'`, [sheet.id]);
    return { readId: x[0].id, status: 'read' };
  } catch (e) {
    const error = ((e as Error).message || 'Lecture impossible.').slice(0, 300);
    console.error('[fiches] lecture :', error);
    const x = (await sql().query(
      `insert into sheet_reads (sheet_id, file_id, model, status, error, created_by) values ($1,$2,$3,'failed',$4,$5) returning id::int as id`,
      [sheet.id, saved.id, sheetModel().slice(0, 80), error, by],
    )) as { id: number }[];
    return { readId: x[0].id, status: 'failed', notice: 'La lecture a échoué : saisissez la fiche à la main.' };
  }
}

export type ApplyReport = { applied: number; failures: { roomNumber: string; error: string }[]; validated: boolean };

// Applique la fiche validée, ligne par ligne. Chaque ligne appliquée est mémorisée : relancer ne refait jamais ce qui est fait.
export async function applySheet(sheet: SheetDetail, rows: FinalRow[], staffId: number | null, today: string): Promise<ApplyReport> {
  const failures: ApplyReport['failures'] = [];
  const applied: SheetDetail['applied'] = { ...sheet.applied };
  const byTask = new Map(sheet.rows.map((r) => [r.taskId, r]));
  let count = 0;
  for (const f of rows) {
    const row = byTask.get(f.taskId)!;
    const key = String(f.taskId);
    const mark = applied[key] ?? {};
    try {
      if (f.done && !mark.done) {
        const cur = (await sql().query(`select status, note from hk_tasks where id = $1`, [f.taskId])) as { status: TaskStatus; note: string }[];
        if (!cur[0]) throw new Error('tâche supprimée');
        if (shouldMarkDone(cur[0].status, true)) await setTaskStatus(f.taskId, 'done', staffId);
        const note = appendNote(cur[0].note, f.note);
        if (note !== cur[0].note) await sql().query(`update hk_tasks set note = $2 where id = $1`, [f.taskId, note]);
        mark.done = true;
      } else if (!f.done && f.note && !mark.done) {
        const cur = (await sql().query(`select note from hk_tasks where id = $1`, [f.taskId])) as { note: string }[];
        if (cur[0]) {
          const note = appendNote(cur[0].note, f.note);
          if (note !== cur[0].note) await sql().query(`update hk_tasks set note = $2 where id = $1`, [f.taskId, note]);
        }
      }
      if (f.minibar.length && !mark.minibar) {
        const r = await recordReading(row.roomId, f.minibar, staffId, today);
        if ('error' in r) throw new Error(r.error);
        mark.minibar = true;
      }
      applied[key] = mark;
      await sql().query(`update hk_sheets set applied = $2::jsonb where id = $1`, [sheet.id, JSON.stringify(applied)]);
      count++;
    } catch (e) {
      applied[key] = mark;
      await sql().query(`update hk_sheets set applied = $2::jsonb where id = $1`, [sheet.id, JSON.stringify(applied)]).catch(() => undefined);
      failures.push({ roomNumber: row.roomNumber, error: (e as Error).message.slice(0, 200) });
    }
  }
  const validated = failures.length === 0;
  if (validated) {
    await sql().query(
      `update hk_sheets set status='validated', validated_by=$2, validated_at=now() where id=$1 and status in ('printed','read')`, [sheet.id, staffId && staffId > 0 ? staffId : null],
    );
  }
  return { applied: count, failures, validated };
}

// Les photos de fiche ne se gardent que 30 jours (elles servent à la vérification, pas à l'archive).
export async function purgeOldSheetPhotos(days = 30): Promise<{ deleted: number }> {
  const old = (await sql().query(
    `select id::int as id, storage, remote_id as "remoteId" from files where kind = 'sheet' and created_at < now() - ($1::int * interval '1 day')`, [days],
  )) as { id: number; storage: 'drive' | 'local'; remoteId: string }[];
  let deleted = 0;
  for (const f of old) {
    try {
      if (f.storage === 'drive') { if (driveConfigured()) await driveDelete(f.remoteId); else continue; }
      else if (/^[a-z]+-\d+-\d+\.(jpg|png|webp)$/.test(f.remoteId)) {
        const { rm } = await import('node:fs/promises');
        const { join } = await import('node:path');
        await rm(join(process.cwd(), '.data', 'files', f.remoteId), { force: true });
      }
      await sql().query(`update sheet_reads set file_id = null where file_id = $1`, [f.id]);
      await sql().query(`delete from files where id = $1`, [f.id]);
      deleted++;
    } catch (e) { console.error('[fiches] purge :', (e as Error).message); }
  }
  return { deleted };
}
