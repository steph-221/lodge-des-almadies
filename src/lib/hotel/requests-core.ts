// Demandes des clients et pannes : règles pures, testées. Aucun accès à la base ici.
import type { Role } from './permissions';

export const SERVICES = ['reception', 'housekeeping', 'technique', 'restaurant'] as const;
export type Service = (typeof SERVICES)[number];
export const isService = (v: unknown): v is Service => typeof v === 'string' && (SERVICES as readonly string[]).includes(v);
export const SERVICE_LABEL: Record<Service, string> = { reception: 'Réception', housekeeping: 'Ménage', technique: 'Technique', restaurant: 'Restaurant' };

export const REQUEST_STATUSES = ['new', 'doing', 'done', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const isRequestStatus = (v: unknown): v is RequestStatus => typeof v === 'string' && (REQUEST_STATUSES as readonly string[]).includes(v);

// Services dont un rôle voit et traite les demandes. Direction et réception : tous ; les autres : leur périmètre.
export function servicesFor(role: Role): Service[] {
  switch (role) {
    case 'direction':
    case 'reception': return [...SERVICES];
    case 'gouvernante':
    case 'femme_chambre': return ['housekeeping'];
    case 'technique': return ['technique'];
    case 'restaurant': return ['restaurant'];
    default: return [];
  }
}

// Une demande avance de « nouvelle » à « en cours » puis « faite » ; elle peut être annulée tant qu'elle est ouverte.
const NEXT: Record<RequestStatus, RequestStatus[]> = { new: ['doing', 'done', 'cancelled'], doing: ['done', 'cancelled'], done: [], cancelled: [] };
export const canTransition = (from: RequestStatus, to: RequestStatus): boolean => NEXT[from].includes(to);
export const isOpen = (s: RequestStatus): boolean => s === 'new' || s === 'doing';

export type Lang = 'fr' | 'en';
// Langue de la page client : paramètre explicite d'abord, sinon l'en-tête du navigateur, sinon le français.
export function pickLang(query: string | null, acceptLanguage: string | null): Lang {
  if (query === 'fr' || query === 'en') return query;
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'fr';
}

// Une chambre est ouverte aux demandes du client si elle a un séjour en cours (arrivée et départ inclus : le jour du départ,
// le client peut encore demander un taxi). `today` : jour hôtelier aaaa-mm-jj.
export type StayRange = { arrival: string; departure: string };
export const roomOpenForGuest = (stays: StayRange[], today: string): boolean => stays.some((s) => s.arrival <= today && today <= s.departure);

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };

export type GuestRequestInput = { catalogId: number; qty: number; note: string };

export function cleanGuestRequest(b: Record<string, unknown>, lang: Lang = 'fr'): Clean<GuestRequestInput> {
  const m = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const catalogId = typeof b.catalogId === 'number' ? b.catalogId : typeof b.catalogId === 'string' ? Number(b.catalogId) : NaN;
  if (!Number.isSafeInteger(catalogId) || catalogId < 1) return { ok: false, error: m('Choisissez une demande.', 'Please choose a request.') };
  const qtyRaw = b.qty === undefined || b.qty === '' ? 1 : typeof b.qty === 'number' ? b.qty : Number(b.qty);
  if (!Number.isInteger(qtyRaw) || qtyRaw < 1 || qtyRaw > 20) return { ok: false, error: m('Quantité invalide (1 à 20).', 'Invalid quantity (1 to 20).') };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > 300) return { ok: false, error: m('Précision trop longue (300 caractères maximum).', 'Note too long (300 characters maximum).') };
  return { ok: true, value: { catalogId, qty: qtyRaw, note } };
}

export type CatalogInput = { labelFr: string; labelEn: string; kind: 'service' | 'room_service'; service: Service; price: number | null; askNote: boolean; sort: number };

export function cleanCatalog(b: Record<string, unknown>): Clean<CatalogInput> {
  const labelFr = typeof b.labelFr === 'string' ? b.labelFr.trim() : '';
  const labelEn = typeof b.labelEn === 'string' ? b.labelEn.trim() : '';
  if (!labelFr || labelFr.length > 80) return { ok: false, error: 'Libellé français obligatoire (80 caractères maximum).' };
  if (labelEn.length > 80) return { ok: false, error: 'Libellé anglais trop long (80 caractères maximum).' };
  if (!isService(b.service)) return { ok: false, error: 'Choisissez le service qui reçoit la demande.' };
  const kind = b.kind === 'room_service' ? 'room_service' : 'service';
  let price: number | null = null;
  if (b.price !== undefined && b.price !== null && b.price !== '') {
    const n = typeof b.price === 'number' ? b.price : Number(b.price);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) return { ok: false, error: 'Prix invalide (entier en FCFA).' };
    price = n;
  }
  if (kind === 'service') price = null; // seul le room service est chiffré
  const sortN = b.sort === undefined || b.sort === '' ? 0 : Number(b.sort);
  if (!Number.isInteger(sortN) || sortN < -1000 || sortN > 1000) return { ok: false, error: 'Ordre invalide.' };
  return { ok: true, value: { labelFr, labelEn, kind, service: b.service, price, askNote: b.askNote === true, sort: sortN } };
}

export type GuideInput = { titleFr: string; titleEn: string; bodyFr: string; bodyEn: string; occupiedOnly: boolean; sort: number };

export function cleanGuide(b: Record<string, unknown>): Clean<GuideInput> {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const titleFr = s(b.titleFr), titleEn = s(b.titleEn), bodyFr = s(b.bodyFr), bodyEn = s(b.bodyEn);
  if (!titleFr || titleFr.length > 80) return { ok: false, error: 'Titre français obligatoire (80 caractères maximum).' };
  if (titleEn.length > 80) return { ok: false, error: 'Titre anglais trop long (80 caractères maximum).' };
  if (bodyFr.length > 2000 || bodyEn.length > 2000) return { ok: false, error: 'Texte trop long (2000 caractères maximum).' };
  const sortN = b.sort === undefined || b.sort === '' ? 0 : Number(b.sort);
  if (!Number.isInteger(sortN) || sortN < -1000 || sortN > 1000) return { ok: false, error: 'Ordre invalide.' };
  return { ok: true, value: { titleFr, titleEn, bodyFr, bodyEn, occupiedOnly: b.occupiedOnly !== false, sort: sortN } };
}

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const isPriority = (v: unknown): v is Priority => typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v);
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' };
const RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
// Tri de la liste des pannes : urgentes d'abord, puis les plus anciennes.
export const byPriority = (a: { priority: Priority; createdAt: string }, b: { priority: Priority; createdAt: string }): number =>
  RANK[a.priority] - RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);

export type IssueStatus = 'open' | 'doing' | 'done';
export const isIssueStatus = (v: unknown): v is IssueStatus => v === 'open' || v === 'doing' || v === 'done';
// Une panne résolue ne se rouvre pas : on en signale une nouvelle.
export const canIssueTransition = (from: IssueStatus, to: IssueStatus): boolean =>
  (from === 'open' && (to === 'doing' || to === 'done')) || (from === 'doing' && to === 'done');

export type IssueInput = { roomId: number | null; place: string; title: string; detail: string; priority: Priority; blocksRoom: boolean };

// `canBlock` : seuls les rôles en écriture complète peuvent bloquer une chambre.
export function cleanIssue(b: Record<string, unknown>, canBlock: boolean): Clean<IssueInput> {
  const roomId = b.roomId === undefined || b.roomId === null || b.roomId === '' ? null : Number(b.roomId);
  if (roomId !== null && (!Number.isSafeInteger(roomId) || roomId < 1)) return { ok: false, error: 'Chambre inconnue.' };
  const place = typeof b.place === 'string' ? b.place.trim() : '';
  if (place.length > 80) return { ok: false, error: 'Lieu trop long (80 caractères maximum).' };
  if (roomId === null && !place) return { ok: false, error: 'Indiquez une chambre ou un lieu.' };
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 120) return { ok: false, error: 'Titre obligatoire (120 caractères maximum).' };
  const detail = typeof b.detail === 'string' ? b.detail.trim() : '';
  if (detail.length > 1000) return { ok: false, error: 'Détail trop long (1000 caractères maximum).' };
  const priority = b.priority === undefined || b.priority === '' ? 'normal' : b.priority;
  if (!isPriority(priority)) return { ok: false, error: 'Priorité inconnue.' };
  const blocksRoom = b.blocksRoom === true;
  if (blocksRoom && roomId === null) return { ok: false, error: 'Seule une chambre peut être bloquée.' };
  if (blocksRoom && !canBlock) return { ok: false, error: 'Vous ne pouvez pas bloquer une chambre.' };
  return { ok: true, value: { roomId, place, title, detail, priority, blocksRoom } };
}

// Jeton du QR code : adresse complète à imprimer.
export const guestUrl = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}/c/${token}`;
export const isTokenShape = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{22}$/.test(t);

// Texte d'alerte envoyé au service : numéro de chambre et libellé, jamais de nom de client.
export function alertText(kind: 'request' | 'issue', p: { room: string | null; title: string; qty?: number; note?: string; priority?: Priority }, origin: string): { subject: string; text: string } {
  const where = p.room ? `chambre ${p.room}` : 'hors chambre';
  if (kind === 'request') {
    const q = p.qty && p.qty > 1 ? ` ×${p.qty}` : '';
    return {
      subject: `Demande client, ${where}`,
      text: `Nouvelle demande (${where}) : ${p.title}${q}.${p.note ? `\nPrécision : ${p.note}` : ''}\n\nTableau des demandes : ${origin.replace(/\/+$/, '')}/admin/hotel/demandes/`,
    };
  }
  const urgent = p.priority === 'urgent' || p.priority === 'high' ? ` (priorité ${p.priority === 'urgent' ? 'urgente' : 'haute'})` : '';
  return {
    subject: `Panne signalée, ${where}${urgent}`,
    text: `Panne signalée (${where})${urgent} : ${p.title}.\n\nPannes : ${origin.replace(/\/+$/, '')}/admin/hotel/pannes/`,
  };
}
