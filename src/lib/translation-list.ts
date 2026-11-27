// Liste de travail de l'onglet « Traductions EN » : toutes les phrases françaises du site, avec leur traduction actuelle. Logique pure, testée.
import { contentStrings } from './i18n';

export type Entry = { fr: string; en: string; base: string; custom: boolean; missing: boolean; where: 'content' | 'site' };

const vars = (s: string): string => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(',');

export function buildEntries(base: Record<string, string>, overrides: Record<string, string>, content: unknown): Entry[] {
  const inContent = new Set(contentStrings(content));
  const keys = new Set<string>([...Object.keys(base), ...inContent, ...Object.keys(overrides)]);
  const rows: Entry[] = [...keys].map((fr) => {
    const custom = Boolean(overrides[fr]);
    const en = overrides[fr] || base[fr] || '';
    return { fr, en, base: base[fr] ?? '', custom, missing: !en, where: inContent.has(fr) ? 'content' : 'site' };
  });
  // Manquantes d'abord, puis les textes du contenu (modifiables dans l'admin), puis le reste du site.
  const rank = (r: Entry) => (r.missing ? 0 : r.where === 'content' ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b));
}

// Vérifie une correction saisie : la phrase doit exister et garder les mêmes variables {x}.
export function checkEdit(fr: unknown, en: unknown, allowed: Set<string>): string | null {
  if (typeof fr !== 'string' || typeof en !== 'string') return 'Requête invalide';
  if (!allowed.has(fr)) return 'Phrase inconnue';
  if (en.length > 2000) return 'Traduction trop longue (2000 caractères maximum)';
  if (en.trim() && vars(fr) !== vars(en)) return 'Gardez les mots entre accolades, par exemple {n} ou {price}, tels quels';
  return null;
}
