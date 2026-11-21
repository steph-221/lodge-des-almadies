// Lots de blanchisserie : envoi du linge sale, retour, manquants et abîmés. Serveur uniquement.
import { sql } from '../db';
import { reconcileLaundry } from './linen';
import { addMovement, sid } from './stock';

export type Batch = {
  id: number; status: 'sent' | 'received'; sentAt: string; receivedAt: string | null; note: string; staffName: string | null;
  lines: { itemId: number; itemName: string; sent: number; received: number | null; damaged: number | null; missing: number | null }[];
};

export async function listBatches(limit = 30): Promise<Batch[]> {
  const heads = (await sql().query(
    `select b.id::int as id, b.status, to_char(b.sent_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "sentAt",
       to_char(b.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "receivedAt", b.note, s.display_name as "staffName"
     from laundry_batches b left join staff s on s.id = b.staff_id order by b.id desc limit $1`, [limit],
  )) as Omit<Batch, 'lines'>[];
  if (!heads.length) return [];
  const lines = (await sql().query(
    `select l.batch_id::int as "batchId", l.item_id::int as "itemId", i.name as "itemName", l.qty_sent as sent, l.qty_received as received, l.qty_damaged as damaged
     from laundry_lines l join items i on i.id = l.item_id where l.batch_id = any($1::bigint[]) order by i.name`, [heads.map((h) => h.id)],
  )) as { batchId: number; itemId: number; itemName: string; sent: number; received: number | null; damaged: number | null }[];
  return heads.map((h) => ({
    ...h,
    lines: lines.filter((l) => l.batchId === h.id).map((l) => ({
      itemId: l.itemId, itemName: l.itemName, sent: l.sent, received: l.received, damaged: l.damaged,
      missing: l.received === null ? null : l.sent - l.received - (l.damaged ?? 0),
    })),
  }));
}

// Envoi : le linge sale quitte « linge sale » et passe « à la blanchisserie ».
export async function sendBatch(lines: { itemId: number; qty: number }[], note: string, staffId: number | null): Promise<{ id: number } | { error: string }> {
  const merged = new Map<number, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.itemId) || !Number.isInteger(l.qty) || l.qty <= 0 || l.qty > 99999) return { error: 'Quantités invalides.' };
    merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.qty);
  }
  if (!merged.size) return { error: 'Ajoutez au moins un article.' };
  const known = (await sql().query(`select id::int as id from items where id = any($1::bigint[]) and kind = 'linen'`, [[...merged.keys()]])) as { id: number }[];
  if (known.length !== merged.size) return { error: 'Article inconnu ou qui n’est pas du linge.' };
  const b = (await sql().query(`insert into laundry_batches (note, staff_id) values ($1,$2) returning id::int as id`, [note.slice(0, 300), sid(staffId)])) as { id: number }[];
  const id = b[0].id;
  for (const [itemId, qty] of merged) {
    await sql().query(`insert into laundry_lines (batch_id, item_id, qty_sent) values ($1,$2,$3)`, [id, itemId, qty]);
    await addMovement({ itemId, location: 'soiled', qty: -qty, reason: 'laundry', ref: `batch:${id}`, staffId });
    await addMovement({ itemId, location: 'laundry', qty, reason: 'laundry', ref: `batch:${id}`, staffId });
  }
  return { id };
}

// Retour : propre → réserve, abîmé → rebut, le reste est compté comme manquant (sorti de la blanchisserie, sans destination).
export async function receiveBatch(id: number, returns: { itemId: number; received: number; damaged: number }[], staffId: number | null): Promise<{ missing: number } | { error: string }> {
  const lines = (await sql().query(`select item_id::int as "itemId", qty_sent as sent from laundry_lines where batch_id = $1`, [id])) as { itemId: number; sent: number }[];
  if (!lines.length) return { error: 'Lot inconnu.' };
  const byItem = new Map(returns.map((r) => [r.itemId, r]));
  const input = lines.map((l) => ({ itemId: l.itemId, sent: l.sent, received: byItem.get(l.itemId)?.received ?? 0, damaged: byItem.get(l.itemId)?.damaged ?? 0 }));
  const rec = reconcileLaundry(input);
  if (!rec.ok) return { error: rec.error ?? 'Quantités invalides.' };
  // Garde : un lot ne se réceptionne qu'une fois.
  const claim = (await sql().query(`update laundry_batches set status='received', received_at=now() where id=$1 and status='sent' returning id`, [id])) as unknown[];
  if (!claim.length) return { error: 'Ce lot a déjà été réceptionné.' };
  let missing = 0;
  for (const l of rec.lines) {
    await sql().query(`update laundry_lines set qty_received=$3, qty_damaged=$4 where batch_id=$1 and item_id=$2`, [id, l.itemId, l.received, l.damaged]);
    const ref = `batch:${id}`;
    await addMovement({ itemId: l.itemId, location: 'laundry', qty: -l.sent, reason: 'laundry', ref, staffId });
    if (l.received > 0) await addMovement({ itemId: l.itemId, location: 'store', qty: l.received, reason: 'laundry', ref, staffId });
    if (l.damaged > 0) await addMovement({ itemId: l.itemId, location: 'scrap', qty: l.damaged, reason: 'loss', ref, staffId, note: 'Abîmé à la blanchisserie' });
    missing += l.missing;
  }
  return { missing };
}
