// Nettoyage et contrôle des données saisies ou importées (chambres, types, séjours). Logique pure, testée.
import { parseDate, parseTime } from './import';

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max: number): string | null => {
  if (v == null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s.length <= max ? s : null;
};
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

export type RoomInput = { number: string; building: string; floor: string; minibar: boolean; notes: string; roomTypeId: number | null };

export function cleanRoom(b: Record<string, unknown>): Clean<RoomInput> {
  const number = str(b.number, 20);
  if (!number) return { ok: false, error: 'Numéro de chambre obligatoire (20 caractères maximum).' };
  const building = str(b.building, 40);
  const floor = str(b.floor, 40);
  const notes = str(b.notes, 500);
  if (building === null || floor === null || notes === null) return { ok: false, error: 'Bâtiment, étage ou remarques trop longs.' };
  let roomTypeId: number | null = null;
  if (b.roomTypeId !== undefined && b.roomTypeId !== null && b.roomTypeId !== '') {
    roomTypeId = int(b.roomTypeId);
    if (roomTypeId === null || roomTypeId <= 0) return { ok: false, error: 'Type de chambre inconnu.' };
  }
  return { ok: true, value: { number, building, floor, minibar: bool(b.minibar), notes, roomTypeId } };
}

export type RoomTypeInput = {
  code: string; label: string; baseCapacity: number; maxCapacity: number; beds: string;
  labelEn: string; building: string; location: string; areaM2: number | null; priceFcfa: number | null; extraBedFcfa: number | null;
  descriptionFr: string; descriptionEn: string;
};

// Montant en FCFA ou surface : vide = non renseigné ; sinon un nombre positif dans les bornes.
const optNum = (v: unknown, max: number, decimals = false): number | null | undefined => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[\s\u202f\u00a0]/g, '').replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max || (!decimals && !Number.isInteger(n))) return undefined;
  return decimals ? Math.round(n * 10) / 10 : n;
};

export function cleanRoomType(b: Record<string, unknown>): Clean<RoomTypeInput> {
  const code = (str(b.code, 30) ?? '').toLowerCase();
  if (!/^[a-z0-9_-]{1,30}$/.test(code)) return { ok: false, error: 'Code : 1 à 30 caractères (lettres, chiffres, tiret).' };
  const label = str(b.label, 80);
  if (!label) return { ok: false, error: 'Libellé obligatoire (80 caractères maximum).' };
  const base = b.baseCapacity === undefined || b.baseCapacity === '' ? 2 : int(b.baseCapacity);
  const max = b.maxCapacity === undefined || b.maxCapacity === '' ? base : int(b.maxCapacity);
  if (base === null || max === null || base < 1 || max > 8 || max < base) return { ok: false, error: 'Capacités invalides (1 à 8, maximum au moins égal à la base).' };
  const beds = str(b.beds, 80);
  if (beds === null) return { ok: false, error: 'Description des lits trop longue.' };
  const labelEn = str(b.labelEn, 80), building = str(b.building, 40), location = str(b.location, 120);
  if (labelEn === null || building === null || location === null) return { ok: false, error: 'Nom anglais, bâtiment ou emplacement trop long.' };
  const descriptionFr = str(b.descriptionFr, 1000), descriptionEn = str(b.descriptionEn, 1000);
  if (descriptionFr === null || descriptionEn === null) return { ok: false, error: 'Description trop longue (1 000 caractères maximum).' };
  const priceFcfa = optNum(b.priceFcfa, 10_000_000), extraBedFcfa = optNum(b.extraBedFcfa, 10_000_000);
  if (priceFcfa === undefined || extraBedFcfa === undefined) return { ok: false, error: 'Tarif invalide (montant entier en FCFA).' };
  const areaM2 = optNum(b.areaM2, 500, true);
  if (areaM2 === undefined || (areaM2 !== null && areaM2 < 5)) return { ok: false, error: 'Superficie invalide (5 à 500 m²).' };
  return { ok: true, value: { code, label, baseCapacity: base, maxCapacity: max, beds, labelEn, building, location, areaM2, priceFcfa, extraBedFcfa, descriptionFr, descriptionEn } };
}

export type StayInput = {
  roomId: number; guestName: string; guests: number; arrival: string; departure: string;
  arrivalTime: string | null; extraBed: boolean; babyCot: boolean; notes: string; externalId: string;
};

export function cleanStay(b: Record<string, unknown>): Clean<StayInput> {
  const roomId = int(b.roomId);
  if (roomId === null || roomId <= 0) return { ok: false, error: 'Chambre inconnue.' };
  const guestName = str(b.guestName, 120);
  if (!guestName) return { ok: false, error: 'Nom du client obligatoire (120 caractères maximum).' };
  const guests = b.guests === undefined || b.guests === '' ? 1 : int(b.guests);
  if (guests === null || guests < 1 || guests > 8) return { ok: false, error: 'Nombre de personnes : 1 à 8.' };
  const arrival = parseDate(typeof b.arrival === 'string' ? b.arrival : '');
  const departure = parseDate(typeof b.departure === 'string' ? b.departure : '');
  if (!arrival || !departure) return { ok: false, error: 'Dates d’arrivée et de départ obligatoires.' };
  if (departure <= arrival) return { ok: false, error: 'Le départ doit être après l’arrivée.' };
  let arrivalTime: string | null = null;
  if (typeof b.arrivalTime === 'string' && b.arrivalTime.trim() !== '') {
    arrivalTime = parseTime(b.arrivalTime);
    if (!arrivalTime) return { ok: false, error: 'Heure d’arrivée illisible (format 14:30).' };
  }
  const notes = str(b.notes, 500);
  const externalId = str(b.externalId, 80);
  if (notes === null || externalId === null) return { ok: false, error: 'Remarques ou référence trop longues.' };
  return { ok: true, value: { roomId, guestName, guests, arrival, departure, arrivalTime, extraBed: bool(b.extraBed), babyCot: bool(b.babyCot), notes, externalId } };
}
