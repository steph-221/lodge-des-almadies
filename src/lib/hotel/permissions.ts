// Rôles, modules et règles d'accès de l'espace « Services hôtel ». Logique pure, testée.

export const ROLES = ['direction', 'reception', 'gouvernante', 'femme_chambre', 'technique', 'restaurant'] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export const ROLE_LABEL: Record<Role, string> = {
  direction: 'Direction',
  reception: 'Réception',
  gouvernante: 'Gouvernante',
  femme_chambre: 'Femme de chambre',
  technique: 'Technique',
  restaurant: 'Restaurant',
};

// E = lecture et écriture, L = lecture, P = périmètre limité (détaillé dans chaque module).
export type Level = 'E' | 'L' | 'P';

export const MODULES = [
  'site', 'today', 'logbook', 'stays', 'rooms', 'inspections', 'linen', 'minibar',
  'requests', 'maintenance', 'events', 'extras', 'sheets', 'team', 'settings',
] as const;
export type Module = (typeof MODULES)[number];

//                                  direction  reception  gouvernante  femme_chambre  technique  restaurant
const ROWS: Record<Module, (Level | null)[]> = {
  site:        ['E', null, null, null, null, null],
  today:       ['L', 'L', 'L', 'P', 'P', 'P'],
  logbook:     ['E', 'E', 'E', 'P', 'P', 'P'],
  stays:       ['E', 'E', 'L', null, null, 'L'],
  rooms:       ['E', 'E', 'E', 'P', 'P', null],
  inspections: ['E', null, 'P', null, 'P', null],
  linen:       ['E', 'L', 'E', null, null, null],
  minibar:     ['L', 'L', 'E', 'E', null, null],
  requests:    ['E', 'E', 'P', 'P', 'P', 'P'],
  maintenance: ['E', 'E', 'E', 'P', 'E', 'P'],
  events:      ['E', 'E', 'L', null, 'L', 'L'],
  extras:      ['E', 'E', null, null, null, 'P'],
  sheets:      ['E', null, 'E', 'P', null, null],
  team:        ['E', null, 'P', null, null, null],
  settings:    ['E', 'P', null, null, null, null],
};

export const levelFor = (role: Role, module: Module): Level | null => ROLES.indexOf(role) >= 0 ? ROWS[module][ROLES.indexOf(role)] ?? null : null;

// Qui peut créer, réinitialiser ou désactiver le compte de qui.
export function canManageStaff(actor: Role, target: Role): boolean {
  if (actor === 'direction') return true;
  if (actor === 'gouvernante') return target === 'femme_chambre';
  return false;
}

// Pages de l'espace hôtel (premier segment après /admin/hotel/) → module.
export const PAGE_MODULE: Record<string, Module> = { equipe: 'team' };
// API (premier segment après /api/hotel/) → module. 'me' est ouvert à tout le personnel.
export const API_MODULE: Record<string, Module> = { staff: 'team' };

export const PROTECTED_PREFIXES = ['/api/hotel', '/api/admin', '/api/cron'] as const;
// Tout /admin/* est protégé, sauf la page de connexion (/admin et /admin/) : une future page ajoutée est fermée par défaut.
export const isProtectedPath = (pathname: string): boolean => {
  const p = pathname.toLowerCase();
  if (p === '/admin' || p === '/admin/') return false;
  if (p.startsWith('/admin/')) return true;
  return PROTECTED_PREFIXES.some((x) => p === x || p.startsWith(x + '/'));
};

const isWrite = (method: string) => !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

/**
 * Décision d'accès pour une route. « deny » par défaut : une route non déclarée est fermée, même à la direction.
 * Les chemins non canoniques (//, .., majuscules) sont refusés. Les routes /api/cron sont réservées au secret du cron.
 */
export function routePolicy(pathname: string, method: string, role: Role | null): 'allow' | 'deny' {
  if (!isProtectedPath(pathname)) return 'allow';
  if (pathname === '/api/admin/login') return 'allow';
  if (pathname !== pathname.toLowerCase() || pathname.includes('//') || pathname.includes('..') || pathname.includes('%')) return 'deny';
  if (!role) return 'deny';
  const seg = pathname.split('/').filter(Boolean); // ['admin','hotel','equipe']
  const moduleOk = (m: Module): boolean => {
    const lvl = levelFor(role, m);
    if (!lvl) return false;
    return isWrite(method) ? lvl === 'E' || lvl === 'P' : true;
  };

  if (seg[0] === 'api' && seg[1] === 'admin') return moduleOk('site') ? 'allow' : 'deny';
  if (seg[0] === 'admin' && seg[1] === 'hotel') {
    if (seg.length === 2) return 'allow';
    const m = PAGE_MODULE[seg[2]];
    return m && moduleOk(m) ? 'allow' : 'deny';
  }
  if (seg[0] === 'api' && seg[1] === 'hotel') {
    if (seg[2] === 'me' && seg.length === 3) return 'allow';
    const m = API_MODULE[seg[2]];
    return m && moduleOk(m) ? 'allow' : 'deny';
  }
  return 'deny';
}
