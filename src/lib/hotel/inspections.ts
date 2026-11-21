// Visites de chambre : liste du matin, contrôle des saisies, droits sur les défauts. Logique pure, testée.
import type { Role } from './permissions';
import type { Clean } from './validate';

export const MAX_PHOTOS = 4;
export const SERVICES = ['housekeeping', 'maintenance'] as const;
export type Service = (typeof SERVICES)[number];
export const isService = (v: unknown): v is Service => typeof v === 'string' && (SERVICES as readonly string[]).includes(v);
export const SERVICE_LABEL: Record<Service, string> = { housekeeping: 'Ménage', maintenance: 'Technique' };
export const RESULTS = ['ok', 'fix', 'na'] as const;
export type Result = (typeof RESULTS)[number];

const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

export type QueueRoom = { roomId: number; number: string; lastVisit: string | null };

/**
 * Liste du matin : chambres libres ce jour-là, d'abord celles jamais visitées, puis de la visite la plus ancienne à la plus récente.
 * `occupied` : chambres occupées ce jour-là (elles ne sont pas visitées). `limit` : nombre de visites par matin.
 */
export function inspectionQueue(rooms: QueueRoom[], occupied: Set<number>, limit: number): QueueRoom[] {
  return rooms
    .filter((r) => !occupied.has(r.roomId))
    .sort((a, b) => {
      if (a.lastVisit === null && b.lastVisit !== null) return -1;
      if (a.lastVisit !== null && b.lastVisit === null) return 1;
      if (a.lastVisit !== b.lastVisit && a.lastVisit !== null && b.lastVisit !== null) return a.lastVisit.localeCompare(b.lastVisit);
      return natural(a.number, b.number);
    })
    .slice(0, Math.max(0, limit));
}

const str = (v: unknown, max: number): string | null => {
  if (v == null) return '';
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length <= max ? s : null;
};
const posInt = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export type InspectionItemInput = { pointId: number; result: Result; comment: string; service: Service | null };
export type InspectionInput = { roomId: number; overall: number | null; comment: string; items: InspectionItemInput[] };

export function cleanInspection(b: Record<string, unknown>): Clean<InspectionInput> {
  const roomId = posInt(b.roomId);
  if (!roomId) return { ok: false, error: 'Chambre inconnue.' };
  let overall: number | null = null;
  if (b.overall !== undefined && b.overall !== null && b.overall !== '') {
    const n = Number(b.overall);
    if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: 'Note d’ensemble : 1 à 5.' };
    overall = n;
  }
  const comment = str(b.comment, 1000);
  if (comment === null) return { ok: false, error: 'Commentaire trop long (1000 caractères maximum).' };
  const raw = b.items === undefined ? [] : b.items;
  if (!Array.isArray(raw) || raw.length > 100) return { ok: false, error: 'Points de contrôle invalides.' };
  const seen = new Set<number>();
  const items: InspectionItemInput[] = [];
  for (const x of raw) {
    const r = (x ?? {}) as Record<string, unknown>;
    const pointId = posInt(r.pointId);
    if (!pointId) return { ok: false, error: 'Point de contrôle inconnu.' };
    if (seen.has(pointId)) return { ok: false, error: 'Un point de contrôle est en double.' };
    seen.add(pointId);
    if (typeof r.result !== 'string' || !(RESULTS as readonly string[]).includes(r.result)) return { ok: false, error: 'Résultat inconnu (conforme, à corriger, sans objet).' };
    const c = str(r.comment, 500);
    if (c === null) return { ok: false, error: 'Commentaire de point trop long (500 caractères maximum).' };
    if (r.result === 'fix' && !c) return { ok: false, error: 'Décrivez chaque point à corriger.' };
    if (r.service !== undefined && r.service !== null && r.service !== '' && !isService(r.service)) return { ok: false, error: 'Service inconnu.' };
    const service: Service | null = r.result === 'fix' ? (isService(r.service) ? r.service : 'housekeeping') : null;
    items.push({ pointId, result: r.result as Result, comment: c, service });
  }
  return { ok: true, value: { roomId, overall, comment, items } };
}

export type PointInput = { label: string; zone: string; service: Service };

export function cleanPoint(b: Record<string, unknown>): Clean<PointInput> {
  const label = str(b.label, 80);
  const zone = str(b.zone, 40);
  if (!label) return { ok: false, error: 'Libellé du point obligatoire (80 caractères maximum).' };
  if (zone === null) return { ok: false, error: 'Zone trop longue (40 caractères maximum).' };
  if (!isService(b.service)) return { ok: false, error: 'Service inconnu (ménage ou technique).' };
  return { ok: true, value: { label, zone, service: b.service } };
}

// Qui peut marquer un défaut comme corrigé : la direction pour tous, la gouvernante pour le ménage, la technique pour le technique.
export function canFixDefect(role: Role, service: Service): boolean {
  if (role === 'direction') return true;
  if (role === 'gouvernante') return service === 'housekeeping';
  if (role === 'technique') return service === 'maintenance';
  return false;
}
