import { json } from '../http';
import type { SessionUser } from './session';

export const unavailable = (tag: string, e: unknown) => {
  console.error(`[${tag}]`, (e as Error).message);
  return json(503, { error: 'Base indisponible, réessayez dans un instant.' });
};

export const actorOf = (u: SessionUser): 'secours' | 'staff' => (u.backup ? 'secours' : 'staff');

export const idParam = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export const safeIp = (get: () => string): string | undefined => {
  try { return get(); } catch { return undefined; }
};

export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Entier dans une plage, sinon null (nombres ou chaînes numériques acceptés).
export const toInt = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
