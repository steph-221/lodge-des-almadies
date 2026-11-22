// Logique pure des cartes RFID et des objets trouvés : saisies, états, message d'alerte. Testée, sans base ni réseau.
import { parseDate } from './import';
import type { Clean } from './validate';

export const CARD_KINDS = ['client', 'passe', 'personnel'] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const KIND_LABEL: Record<CardKind, string> = { client: 'Carte client', passe: 'Passe', personnel: 'Carte du personnel' };
export const CARD_STATUSES = ['active', 'lost', 'retired'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const CARD_STATUS_LABEL: Record<CardStatus, string> = { active: 'Active', lost: 'Perdue', retired: 'Retirée' };

export const ITEM_STATUSES = ['stored', 'returned', 'discarded'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = { stored: 'Gardé', returned: 'Rendu', discarded: 'Éliminé' };

const str = (v: unknown, max: number): string | null => {
  if (v == null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s.length <= max ? s : null;
};
const posInt = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// ---------- Cartes ----------

export type CardInput = { code: string; kind: CardKind; roomId: number | null; holder: string; notes: string };

export function cleanCard(b: Record<string, unknown>): Clean<CardInput> {
  // Le code est celui imprimé sur la carte ou lu par le lecteur : lettres, chiffres, tirets et deux-points seulement.
  const code = str(b.code, 40);
  if (!code) return { ok: false, error: 'Numéro de la carte obligatoire (40 caractères maximum).' };
  if (!/^[A-Za-z0-9][A-Za-z0-9 _:.-]*$/.test(code)) return { ok: false, error: 'Numéro de carte : lettres, chiffres, espaces, tirets et deux-points seulement.' };
  const kind = b.kind === undefined || b.kind === '' ? 'client' : b.kind;
  if (typeof kind !== 'string' || !(CARD_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Type de carte inconnu.' };
  let roomId: number | null = null;
  if (b.roomId !== undefined && b.roomId !== null && b.roomId !== '') {
    roomId = posInt(b.roomId);
    if (!roomId) return { ok: false, error: 'Chambre inconnue.' };
  }
  const holder = str(b.holder, 80);
  const notes = str(b.notes, 300);
  if (holder === null || notes === null) return { ok: false, error: 'Titulaire ou remarque trop longs.' };
  if (kind === 'personnel' && !holder) return { ok: false, error: 'Indiquez le nom du titulaire d’une carte du personnel.' };
  return { ok: true, value: { code, kind: kind as CardKind, roomId, holder, notes } };
}

// Une carte active peut être déclarée perdue ou retirée ; ensuite, plus rien (jamais de réactivation).
export const canChangeCard = (from: CardStatus, to: CardStatus): boolean => from === 'active' && (to === 'lost' || to === 'retired');

export type CardStatusInput = { status: 'lost' | 'retired'; note: string };
export function cleanCardStatus(b: Record<string, unknown>): Clean<CardStatusInput> {
  if (b.status !== 'lost' && b.status !== 'retired') return { ok: false, error: 'Indiquez « perdue » ou « retirée ».' };
  const note = str(b.note, 300);
  if (note === null) return { ok: false, error: 'Remarque trop longue (300 caractères).' };
  return { ok: true, value: { status: b.status, note } };
}

// Message du cahier de liaison quand une carte est perdue : l'équipe doit faire reprogrammer la serrure.
export function lostCardNotice(c: { code: string; kind: CardKind; roomNumber: string | null; holder: string }): string {
  const who = c.roomNumber ? ` de la chambre ${c.roomNumber}` : c.holder ? ` (${c.holder})` : '';
  const act = c.kind === 'passe' ? 'Passe perdu : changer les serrures concernées sans attendre.' : 'À désactiver sur le système de serrures avant toute nouvelle remise de clé.';
  return `Carte ${c.code}${who} déclarée perdue. ${act}`;
}

// ---------- Objets trouvés ----------

export type ItemInput = { foundOn: string; roomId: number | null; place: string; description: string; storage: string };

export function cleanItem(b: Record<string, unknown>, today: string): Clean<ItemInput> {
  const description = str(b.description, 200);
  if (!description) return { ok: false, error: 'Décrivez l’objet (200 caractères maximum).' };
  let foundOn = today;
  if (typeof b.foundOn === 'string' && b.foundOn.trim() !== '') {
    const d = parseDate(b.foundOn);
    if (!d) return { ok: false, error: 'Date de la trouvaille illisible.' };
    if (d > today) return { ok: false, error: 'La date de la trouvaille ne peut pas être dans le futur.' };
    foundOn = d;
  }
  let roomId: number | null = null;
  if (b.roomId !== undefined && b.roomId !== null && b.roomId !== '') {
    roomId = posInt(b.roomId);
    if (!roomId) return { ok: false, error: 'Chambre inconnue.' };
  }
  const place = str(b.place, 120);
  const storage = str(b.storage, 80);
  if (place === null || storage === null) return { ok: false, error: 'Lieu ou lieu de rangement trop longs.' };
  return { ok: true, value: { foundOn, roomId, place, description, storage } };
}

export const canCloseItem = (from: ItemStatus): boolean => from === 'stored';

export type ItemCloseInput = { status: 'returned' | 'discarded'; returnedTo: string };
export function cleanItemClose(b: Record<string, unknown>): Clean<ItemCloseInput> {
  if (b.status !== 'returned' && b.status !== 'discarded') return { ok: false, error: 'Indiquez « rendu » ou « éliminé ».' };
  const returnedTo = str(b.returnedTo, 120);
  if (returnedTo === null) return { ok: false, error: 'Nom trop long (120 caractères).' };
  if (b.status === 'returned' && !returnedTo) return { ok: false, error: 'Indiquez à qui l’objet a été rendu.' };
  return { ok: true, value: { status: b.status, returnedTo: b.status === 'returned' ? returnedTo : '' } };
}
