// Import de chambres et de séjours depuis un tableau : reconnaissance des colonnes, lecture des dates, contrôle ligne par ligne.
// Logique pure, partagée par le navigateur (aperçu) et le serveur (revalidation).

export type FieldDef = { key: string; label: string; required?: boolean; aliases: string[] };
export type Mapping = Record<string, number>;
export type LineError = { line: number; message: string };

export const ROOM_FIELDS: FieldDef[] = [
  { key: 'number', label: 'Numéro de chambre', required: true, aliases: ['numero', 'num', 'chambre', 'room', 'nchambre', 'roomnumber', 'nomchambre', 'no'] },
  { key: 'building', label: 'Bâtiment', aliases: ['batiment', 'bat', 'building', 'bloc', 'aile'] },
  { key: 'floor', label: 'Étage', aliases: ['etage', 'floor', 'niveau'] },
  { key: 'type', label: 'Type de chambre', aliases: ['type', 'typedechambre', 'typechambre', 'categorie', 'category', 'roomtype'] },
  { key: 'minibar', label: 'Minibar (oui/non)', aliases: ['minibar', 'frigo'] },
  { key: 'notes', label: 'Remarques', aliases: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires', 'observations'] },
];

export const STAY_FIELDS: FieldDef[] = [
  { key: 'room', label: 'Chambre', required: true, aliases: ['chambre', 'numerochambre', 'room', 'nchambre', 'numchambre', 'roomnumber'] },
  { key: 'guest', label: 'Nom du client', required: true, aliases: ['nom', 'client', 'nomduclient', 'nomclient', 'guest', 'guestname', 'hote', 'titulaire', 'nomreservation', 'name'] },
  { key: 'guests', label: 'Nombre de personnes', aliases: ['pers', 'personnes', 'nbpers', 'nbpersonnes', 'nombredepersonnes', 'pax', 'adultes', 'guests', 'occupants'] },
  { key: 'arrival', label: 'Arrivée', required: true, aliases: ['arrivee', 'datearrivee', 'datedarrivee', 'arrival', 'checkin', 'du', 'debut', 'datedebut'] },
  { key: 'departure', label: 'Départ', required: true, aliases: ['depart', 'datedepart', 'departure', 'checkout', 'au', 'fin', 'datefin'] },
  { key: 'time', label: 'Heure d’arrivée', aliases: ['heure', 'heurearrivee', 'heuredarrivee', 'arrivaltime', 'eta'] },
  { key: 'extra_bed', label: 'Lit d’appoint (oui/non)', aliases: ['litappoint', 'litsupplementaire', 'extrabed', 'appoint'] },
  { key: 'baby_cot', label: 'Lit bébé (oui/non)', aliases: ['litbebe', 'babycot', 'bebe', 'crib'] },
  { key: 'notes', label: 'Remarques', aliases: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires', 'observations'] },
  { key: 'external_id', label: 'Référence de réservation', aliases: ['ref', 'reference', 'id', 'numreservation', 'numerodereservation', 'reservation', 'resa', 'bookingid', 'confirmation', 'numresa'] },
];

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Associe chaque champ à la colonne de même nom (exact d'abord, partiel ensuite). -1 si rien ne correspond. Une colonne sert une seule fois.
export function guessMapping(headers: string[], fields: FieldDef[]): Mapping {
  const normalized = headers.map(norm);
  const used = new Set<number>();
  const out: Mapping = {};
  for (const f of fields) {
    const i = normalized.findIndex((h, idx) => !used.has(idx) && f.aliases.includes(h));
    out[f.key] = i;
    if (i >= 0) used.add(i);
  }
  for (const f of fields) {
    if (out[f.key] >= 0) continue;
    const i = normalized.findIndex((h, idx) => !used.has(idx) && h !== '' && f.aliases.some((a) => a.length >= 4 && h.includes(a)));
    out[f.key] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

export function parseDate(input: string | undefined): string | null {
  const s = (input ?? '').trim().split(/[\sT]/)[0];
  if (!s) return null;
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    d = +mt[1]; m = +mt[2]; y = mt[3].length === 2 ? 2000 + +mt[3] : +mt[3];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseBool(input: string | undefined | null): boolean {
  return ['oui', 'o', 'x', '1', 'yes', 'y', 'true', 'vrai'].includes((input ?? '').trim().toLowerCase());
}

export function parseTime(input: string | undefined | null): string | null {
  const s = (input ?? '').trim();
  const mt = /^(\d{1,2})[:hH](\d{2})?(?::\d{2})?$/.exec(s);
  if (!mt) return null;
  const h = +mt[1];
  const m = mt[2] === undefined ? 0 : +mt[2];
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const cell = (row: string[], i: number | undefined): string => (i !== undefined && i >= 0 ? (row[i] ?? '').trim() : '');

export type RoomImportRow = { number: string; building: string; floor: string; type: string; minibar: boolean; notes: string };

export function mapRooms(rows: string[][], m: Mapping): { rows: RoomImportRow[]; errors: LineError[] } {
  const out: RoomImportRow[] = [];
  const errors: LineError[] = [];
  const seen = new Set<string>();
  rows.forEach((r, idx) => {
    const line = idx + 2; // la ligne 1 est l'en-tête
    const number = cell(r, m.number);
    if (!number) { errors.push({ line, message: 'Numéro de chambre manquant.' }); return; }
    if (seen.has(number.toLowerCase())) { errors.push({ line, message: `Chambre ${number} en double dans le fichier.` }); return; }
    seen.add(number.toLowerCase());
    out.push({ number, building: cell(r, m.building), floor: cell(r, m.floor), type: cell(r, m.type), minibar: parseBool(cell(r, m.minibar)), notes: cell(r, m.notes) });
  });
  return { rows: out, errors };
}

export type StayImportRow = {
  line: number; room: string; guest: string; guests: number; arrival: string; departure: string;
  time: string | null; extraBed: boolean; babyCot: boolean; notes: string; externalId: string;
};

export function mapStays(rows: string[][], m: Mapping): { rows: StayImportRow[]; errors: LineError[] } {
  const out: StayImportRow[] = [];
  const errors: LineError[] = [];
  rows.forEach((r, idx) => {
    const line = idx + 2;
    const fail = (message: string) => errors.push({ line, message });
    const room = cell(r, m.room);
    if (!room) return fail('Numéro de chambre manquant.');
    const guest = cell(r, m.guest);
    if (!guest) return fail('Nom du client manquant.');
    const arrival = parseDate(cell(r, m.arrival));
    if (!arrival) return fail('Date d’arrivée illisible.');
    const departure = parseDate(cell(r, m.departure));
    if (!departure) return fail('Date de départ illisible.');
    if (departure <= arrival) return fail('La date de départ doit suivre la date d’arrivée.');
    const g = cell(r, m.guests);
    const guests = g === '' ? 1 : parseInt(g, 10);
    if (!Number.isInteger(guests) || guests < 1 || guests > 8) return fail('Nombre de personnes invalide (1 à 8).');
    const t = cell(r, m.time);
    out.push({
      line, room, guest, guests, arrival, departure,
      time: t ? parseTime(t) : null,
      extraBed: parseBool(cell(r, m.extra_bed)), babyCot: parseBool(cell(r, m.baby_cot)),
      notes: cell(r, m.notes), externalId: cell(r, m.external_id),
    });
  });
  return { rows: out, errors };
}
