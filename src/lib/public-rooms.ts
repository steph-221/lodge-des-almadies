// Tarifs des chambres pour le site public, lus dans la base (back-office Chambres).
// Si la base n'est pas configurée, ne répond pas ou n'a pas de tarif, on renvoie null : la page garde le contenu de l'admin.
import { dbConfigured, sql } from './db';

export type PublicType = {
  code: string; name: string; building: string; view: string; fcfa: number; extraBed: number | null;
  count: number; twin: boolean; suite: boolean;
};

const TTL_MS = 60_000;
let cache: { at: number; value: PublicType[] | null } | null = null;

// « Chambre Standard côté route (bâtiment A) » -> « Chambre Standard côté route »
export const cleanName = (label: string): string => label.replace(/\s*\(bâtiment [^)]*\)\s*$/i, '').trim();
// Emplacement sans le bâtiment ni ce que le nom dit déjà :
// (« Bâtiment A, côté route, sans balcon », « Chambre Standard côté route ») -> « Sans balcon »
export const cleanView = (location: string, name = ''): string => {
  const n = name.toLowerCase();
  const s = location.replace(/^bâtiment\s+\S+\s*,?\s*/i, '').split(',').map((x) => x.trim())
    .filter((x) => x && !n.includes(x.toLowerCase())).join(', ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
};

async function load(): Promise<PublicType[] | null> {
  if (!dbConfigured()) return null;
  const rows = (await Promise.race([
    sql().query(
      `select t.code, t.label, t.building, t.location, t.price_fcfa::int as fcfa, t.extra_bed_fcfa::int as "extraBed",
         (select count(*)::int from rooms r where r.room_type_id = t.id and r.active) as count,
         exists(select 1 from room_type_amenities a where a.room_type_id = t.id and a.amenity_key = 'lits_twin' and a.value = 'oui') as twin
       from room_types t where t.active and t.price_fcfa is not null order by t.price_fcfa, t.position`,
    ),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
  ])) as { code: string; label: string; building: string; location: string; fcfa: number; extraBed: number | null; count: number; twin: boolean }[];
  const out = rows.filter((r) => r.count > 0).map((r) => {
    const name = cleanName(r.label);
    return { code: r.code, name, building: r.building, view: cleanView(r.location, name), fcfa: r.fcfa, extraBed: r.extraBed, count: r.count, twin: r.twin, suite: /^suite/i.test(name) };
  });
  return out.length ? out : null;
}

export async function getPublicTypes(): Promise<PublicType[] | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: PublicType[] | null = null;
  try { value = await load(); } catch (e) { console.error('[public-rooms]', (e as Error).message); }
  cache = { at: Date.now(), value };
  return value;
}

// Prix d'une page chambre (suites, double, twin) à partir des types de la base.
export function pricesFor(slug: string, types: PublicType[]): { label: string; fcfa: number }[] | null {
  const pick = slug === 'suites' ? types.filter((t) => t.suite)
    : slug === 'twin' ? types.filter((t) => t.twin)
    : slug === 'double' ? types.filter((t) => !t.suite)
    : [];
  if (!pick.length) return null;
  return pick.map((t) => ({ label: [t.name, `bâtiment ${t.building}`, t.view].filter(Boolean).join(' · '), fcfa: t.fcfa }));
}
