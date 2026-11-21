// Catalogue, stocks (journal de mouvements), gabarits de préparation et linge à sortir. Serveur uniquement.
import { sql } from '../db';
import type { ItemImportRow, ItemInput, ItemKind } from './items';
import { linenNeeds, type NeedTask, type PrepCond, type PrepKind, type PrepLine } from './linen';

export const LOCATIONS = ['store', 'soiled', 'laundry', 'scrap'] as const;
export type Location = (typeof LOCATIONS)[number];
export const isLocation = (v: unknown): v is Location => typeof v === 'string' && (LOCATIONS as readonly string[]).includes(v);
export const LOCATION_LABEL: Record<Location, string> = { store: 'Réserve', soiled: 'Linge sale', laundry: 'Blanchisserie', scrap: 'Rebut' };

export const sid = (staffId: number | null | undefined): number | null => (staffId && staffId > 0 ? staffId : null);
const code23 = (e: unknown) => (e as { code?: string }).code;
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

export type Item = {
  id: number; name: string; kind: ItemKind; unit: string; minStock: number; price: number; active: boolean;
  store: number; soiled: number; laundry: number; scrap: number;
};

export async function listItems(): Promise<Item[]> {
  const rows = (await sql().query(
    `select i.id::int as id, i.name, i.kind, i.unit, i.min_stock as "minStock", i.price, i.active,
       coalesce(sum(m.qty) filter (where m.location='store'),0)::int as store,
       coalesce(sum(m.qty) filter (where m.location='soiled'),0)::int as soiled,
       coalesce(sum(m.qty) filter (where m.location='laundry'),0)::int as laundry,
       coalesce(sum(m.qty) filter (where m.location='scrap'),0)::int as scrap
     from items i left join stock_movements m on m.item_id = i.id group by i.id`,
  )) as Item[];
  return rows.sort((a, b) => natural(a.name, b.name));
}

export async function createItem(v: ItemInput): Promise<{ id: number } | { error: string }> {
  try {
    const r = (await sql().query(`insert into items (name, kind, unit, min_stock, price) values ($1,$2,$3,$4,$5) returning id::int as id`, [v.name, v.kind, v.unit, v.minStock, v.price])) as { id: number }[];
    return { id: r[0].id };
  } catch (e) {
    if (code23(e) === '23505') return { error: `L’article « ${v.name} » existe déjà.` };
    throw e;
  }
}

export async function updateItem(id: number, v: ItemInput, active: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    const r = (await sql().query(`update items set name=$2, kind=$3, unit=$4, min_stock=$5, price=$6, active=$7 where id=$1 returning id`, [id, v.name, v.kind, v.unit, v.minStock, v.price, active])) as unknown[];
    return r.length ? { ok: true } : { error: 'Article inconnu.' };
  } catch (e) {
    if (code23(e) === '23505') return { error: `L’article « ${v.name} » existe déjà.` };
    throw e;
  }
}

export async function itemExists(id: number): Promise<boolean> {
  return ((await sql().query(`select 1 from items where id=$1`, [id])) as unknown[]).length > 0;
}

type Move = { itemId: number; location: Location; qty: number; reason: string; ref?: string; note?: string; staffId?: number | null };

export async function addMovement(m: Move): Promise<void> {
  await sql().query(
    `insert into stock_movements (item_id, location, qty, reason, ref, note, staff_id) values ($1,$2,$3,$4,$5,$6,$7)`,
    [m.itemId, m.location, m.qty, m.reason, m.ref ?? '', (m.note ?? '').slice(0, 300), sid(m.staffId)],
  );
}

export async function levelOf(itemId: number, location: Location): Promise<number> {
  const r = (await sql().query(`select coalesce(sum(qty),0)::int as q from stock_movements where item_id=$1 and location=$2`, [itemId, location])) as { q: number }[];
  return r[0]?.q ?? 0;
}

// Inventaire : on saisit ce qu'on a compté, l'application enregistre l'écart.
export async function setInventory(itemId: number, location: Location, counted: number, staffId: number | null): Promise<{ delta: number }> {
  const delta = counted - (await levelOf(itemId, location));
  if (delta !== 0) await addMovement({ itemId, location, qty: delta, reason: 'inventory', staffId, note: `Inventaire : ${counted}` });
  return { delta };
}

// Mouvement manuel : réception de livraison (+), perte (−) ou consommation (−) en réserve.
export async function manualMovement(itemId: number, location: Location, qty: number, reason: 'receipt' | 'loss' | 'consumption', note: string, staffId: number | null): Promise<void> {
  await addMovement({ itemId, location, qty: reason === 'receipt' ? Math.abs(qty) : -Math.abs(qty), reason, note, staffId });
}

// Import du catalogue : création ou mise à jour par nom ; le stock du fichier devient l'inventaire de la réserve.
export async function importItems(rows: ItemImportRow[], staffId: number | null): Promise<{ created: number; updated: number; errors: { line: number; message: string }[] }> {
  let created = 0, updated = 0;
  const errors: { line: number; message: string }[] = [];
  for (const r of rows) {
    try {
      const ex = (await sql().query(`select id::int as id from items where lower(name) = lower($1)`, [r.name])) as { id: number }[];
      let id: number;
      if (ex[0]) {
        id = ex[0].id;
        await sql().query(`update items set kind=$2, unit=$3, min_stock=$4, price=$5, active=true where id=$1`, [id, r.kind, r.unit, r.minStock, r.price]);
        updated++;
      } else {
        const ins = await createItem({ name: r.name, kind: r.kind, unit: r.unit, minStock: r.minStock, price: r.price });
        if ('error' in ins) { errors.push({ line: r.line, message: ins.error }); continue; }
        id = ins.id;
        created++;
      }
      if (r.stock > 0 || ex[0]) await setInventory(id, 'store', r.stock, staffId);
    } catch (e) {
      console.error('[import-items]', (e as Error).message);
      errors.push({ line: r.line, message: 'Enregistrement impossible.' });
    }
  }
  return { created, updated, errors };
}

// ---- Gabarits de préparation ----

export type PrepRow = PrepLine & { id: number; itemName: string; roomTypeLabel: string | null };

export async function listPrepLines(): Promise<PrepRow[]> {
  return (await sql().query(
    `select p.id::int as id, p.room_type_id::int as "roomTypeId", t.label as "roomTypeLabel", p.kind, p.occupancy::int as occupancy, p.cond,
       p.item_id::int as "itemId", i.name as "itemName", p.qty
     from prep_lines p join items i on i.id = p.item_id left join room_types t on t.id = p.room_type_id
     order by p.kind, i.name, p.room_type_id nulls first, p.occupancy nulls first`,
  )) as PrepRow[];
}

export type PrepInput = { roomTypeId: number | null; kind: PrepKind; occupancy: number | null; cond: PrepCond | null; itemId: number; qty: number };

export async function savePrepLine(v: PrepInput): Promise<void> {
  // Une seule ligne par combinaison : on remplace la quantité si elle existe déjà.
  const upd = (await sql().query(
    `update prep_lines set qty=$6 where coalesce(room_type_id,0)=coalesce($1::bigint,0) and kind=$2 and coalesce(occupancy,0)=coalesce($3::smallint,0)
       and coalesce(cond,'')=coalesce($4::text,'') and item_id=$5 returning id`,
    [v.roomTypeId, v.kind, v.occupancy, v.cond, v.itemId, v.qty],
  )) as unknown[];
  if (upd.length) return;
  await sql().query(`insert into prep_lines (room_type_id, kind, occupancy, cond, item_id, qty) values ($1,$2,$3,$4,$5,$6)`, [v.roomTypeId, v.kind, v.occupancy, v.cond, v.itemId, v.qty]);
}

export async function deletePrepLine(id: number): Promise<boolean> {
  return ((await sql().query(`delete from prep_lines where id=$1 returning id`, [id])) as unknown[]).length > 0;
}

// ---- Linge à sortir ----

async function allPrepLines(): Promise<PrepLine[]> {
  return (await sql().query(
    `select room_type_id::int as "roomTypeId", kind, occupancy::int as occupancy, cond, item_id::int as "itemId", qty from prep_lines`,
  )) as PrepLine[];
}

type TaskRow = { id: number; roomTypeId: number | null; kind: PrepKind; guests: number | null; extraBed: boolean; babyCot: boolean };

export type NeedRow = { itemId: number; name: string; kind: ItemKind; unit: string; qty: number; store: number; short: number };

// Besoins du jour pour toutes les tâches non terminées (ce qu'il reste à sortir de la réserve).
export async function needsForDate(date: string): Promise<{ tasks: number; needs: NeedRow[] }> {
  const tasks = (await sql().query(
    `select k.id::int as id, r.room_type_id::int as "roomTypeId", k.kind, k.guests::int as guests, k.extra_bed as "extraBed", k.baby_cot as "babyCot"
     from hk_tasks k join rooms r on r.id = k.room_id where k.task_date = $1::date and k.status in ('todo','doing')`, [date],
  )) as TaskRow[];
  const needs = linenNeeds(tasks as NeedTask[], await allPrepLines());
  if (!needs.length) return { tasks: tasks.length, needs: [] };
  const items = new Map((await listItems()).map((i) => [i.id, i]));
  const out: NeedRow[] = [];
  for (const n of needs) {
    const it = items.get(n.itemId);
    if (!it) continue;
    out.push({ itemId: n.itemId, name: it.name, kind: it.kind, unit: it.unit, qty: n.qty, store: it.store, short: Math.max(0, n.qty - it.store) });
  }
  return { tasks: tasks.length, needs: out.sort((a, b) => natural(a.name, b.name)) };
}

// Décompte du stock quand une tâche est terminée, une seule fois (stock_posted_at). Linge : réserve → linge sale. Consommables : sortis de la réserve.
export async function postTaskStock(taskId: number, staffId: number | null): Promise<{ posted: boolean }> {
  const claim = (await sql().query(
    `update hk_tasks set stock_posted_at = now() where id = $1 and stock_posted_at is null returning room_id::int as "roomId"`, [taskId],
  )) as { roomId: number }[];
  if (!claim[0]) return { posted: false };
  try {
    const rows = (await sql().query(
      `select k.id::int as id, r.room_type_id::int as "roomTypeId", k.kind, k.guests::int as guests, k.extra_bed as "extraBed", k.baby_cot as "babyCot"
       from hk_tasks k join rooms r on r.id = k.room_id where k.id = $1`, [taskId],
    )) as TaskRow[];
    const needs = linenNeeds(rows as NeedTask[], await allPrepLines());
    if (!needs.length) return { posted: true };
    const items = new Map((await listItems()).map((i) => [i.id, i]));
    for (const n of needs) {
      const it = items.get(n.itemId);
      if (!it) continue;
      const ref = `task:${taskId}`;
      await addMovement({ itemId: n.itemId, location: 'store', qty: -n.qty, reason: it.kind === 'linen' ? 'task' : 'consumption', ref, staffId });
      if (it.kind === 'linen') await addMovement({ itemId: n.itemId, location: 'soiled', qty: n.qty, reason: 'task', ref, staffId });
    }
    return { posted: true };
  } catch (e) {
    // Le décompte n'a pas abouti : on libère la tâche pour qu'un nouvel essai soit possible.
    await sql().query(`update hk_tasks set stock_posted_at = null where id = $1`, [taskId]);
    await sql().query(`delete from stock_movements where ref = $1`, [`task:${taskId}`]);
    throw e;
  }
}
