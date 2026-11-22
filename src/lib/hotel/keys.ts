// Cartes RFID et objets trouvés : accès à la base. Serveur uniquement. La logique pure est dans keys-core.ts.
import { sql } from '../db';
import type { CardInput, CardKind, CardStatus, ItemInput, ItemStatus } from './keys-core';
import { lostCardNotice } from './keys-core';
import { addEntry } from './logbook';

const code23 = (e: unknown) => (e as { code?: string }).code;

export type Card = {
  id: number; code: string; kind: CardKind; roomId: number | null; roomNumber: string | null; holder: string; notes: string;
  status: CardStatus; statusNote: string; statusAt: string | null; createdAt: string;
};

const CARD_SELECT = `select c.id::int as id, c.code, c.kind, c.room_id::int as "roomId", r.number as "roomNumber", c.holder, c.notes,
  c.status, c.status_note as "statusNote", c.status_at as "statusAt", c.created_at as "createdAt"
  from key_cards c left join rooms r on r.id = c.room_id`;

export async function listCards(status: CardStatus | 'all'): Promise<Card[]> {
  const where = status === 'all' ? '' : 'where c.status = $1';
  return (await sql().query(`${CARD_SELECT} ${where} order by (c.status = 'active') desc, lower(c.code) limit 500`, status === 'all' ? [] : [status])) as Card[];
}

async function getCard(id: number): Promise<Card | null> {
  const r = (await sql().query(`${CARD_SELECT} where c.id = $1`, [id])) as Card[];
  return r[0] ?? null;
}

export async function createCard(v: CardInput, staffId: number | null): Promise<{ card: Card } | { error: string }> {
  try {
    const r = (await sql().query(
      `insert into key_cards (code, kind, room_id, holder, notes, created_by) values ($1,$2,$3,$4,$5,$6) returning id::int as id`,
      [v.code, v.kind, v.roomId, v.holder, v.notes, staffId && staffId > 0 ? staffId : null],
    )) as { id: number }[];
    return { card: (await getCard(r[0].id))! };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Une carte porte déjà ce numéro.' };
    if (code23(e) === '23503') return { error: 'Chambre inconnue.' };
    throw e;
  }
}

// Perdue ou retirée : une seule fois, jamais de retour à « active ». La mise à jour est conditionnelle, donc sûre en cas de double clic.
export async function setCardStatus(id: number, status: 'lost' | 'retired', note: string, staffId: number | null): Promise<{ card: Card; alerted: boolean } | { error: string; code: 404 | 409 }> {
  const upd = (await sql().query(
    `update key_cards set status=$2, status_note=$3, status_at=now(), status_by=$4 where id=$1 and status='active' returning id`,
    [id, status, note, staffId && staffId > 0 ? staffId : null],
  )) as unknown[];
  const card = await getCard(id);
  if (!card) return { error: 'Carte inconnue.', code: 404 };
  if (upd.length === 0) return { error: `Cette carte est déjà ${card.status === 'lost' ? 'déclarée perdue' : 'retirée'} : elle ne peut plus changer d’état.`, code: 409 };
  let alerted = false;
  if (status === 'lost' && staffId && staffId > 0) {
    // Le cahier de liaison prévient l'équipe ; si l'accès de secours (sans compte) agit, le journal d'audit suffit.
    try { await addEntry(lostCardNotice({ code: card.code, kind: card.kind, roomNumber: card.roomNumber, holder: card.holder }), staffId); alerted = true; } catch (e) { console.error('[cartes] cahier', (e as Error).message); }
  }
  return { card, alerted };
}

export type LostItem = {
  id: number; foundOn: string; roomId: number | null; roomNumber: string | null; place: string; description: string; storage: string;
  status: ItemStatus; returnedTo: string; closedAt: string | null; foundBy: string | null;
};

const ITEM_SELECT = `select i.id::int as id, to_char(i.found_on,'YYYY-MM-DD') as "foundOn", i.room_id::int as "roomId", r.number as "roomNumber",
  i.place, i.description, i.storage, i.status, i.returned_to as "returnedTo", i.closed_at as "closedAt", s.display_name as "foundBy"
  from lost_items i left join rooms r on r.id = i.room_id left join staff s on s.id = i.found_by`;

export async function listItems(status: ItemStatus | 'all'): Promise<LostItem[]> {
  const where = status === 'all' ? '' : 'where i.status = $1';
  return (await sql().query(`${ITEM_SELECT} ${where} order by (i.status = 'stored') desc, i.found_on desc, i.id desc limit 500`, status === 'all' ? [] : [status])) as LostItem[];
}

async function getItem(id: number): Promise<LostItem | null> {
  const r = (await sql().query(`${ITEM_SELECT} where i.id = $1`, [id])) as LostItem[];
  return r[0] ?? null;
}

export async function createItem(v: ItemInput, staffId: number | null): Promise<{ item: LostItem } | { error: string }> {
  try {
    const r = (await sql().query(
      `insert into lost_items (found_on, room_id, place, description, storage, found_by) values ($1,$2,$3,$4,$5,$6) returning id::int as id`,
      [v.foundOn, v.roomId, v.place, v.description, v.storage, staffId && staffId > 0 ? staffId : null],
    )) as { id: number }[];
    return { item: (await getItem(r[0].id))! };
  } catch (e) {
    if (code23(e) === '23503') return { error: 'Chambre inconnue.' };
    throw e;
  }
}

export async function closeItem(id: number, status: 'returned' | 'discarded', returnedTo: string, staffId: number | null): Promise<{ item: LostItem } | { error: string; code: 404 | 409 }> {
  const upd = (await sql().query(
    `update lost_items set status=$2, returned_to=$3, closed_at=now(), closed_by=$4 where id=$1 and status='stored' returning id`,
    [id, status, returnedTo, staffId && staffId > 0 ? staffId : null],
  )) as unknown[];
  const item = await getItem(id);
  if (!item) return { error: 'Objet inconnu.', code: 404 };
  if (upd.length === 0) return { error: 'Cet objet est déjà clos (rendu ou éliminé).', code: 409 };
  return { item };
}
