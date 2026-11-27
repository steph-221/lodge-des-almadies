// Site public multilingue : français (langue source, à la racine) et anglais (sous /en/).
//
// Principe : le texte français sert de clé. t('Réserver') renvoie « Book now » en anglais.
// Si une phrase n'a pas (encore) de traduction, on affiche le français : jamais de page vide ni de clé technique à l'écran.
// Cela vaut aussi pour les textes modifiés dans /admin : tant que la nouvelle phrase n'est pas ajoutée à src/i18n/en.json, la page anglaise l'affiche en français.
import en from '../i18n/en.json';

export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

const DICT: Record<Lang, Record<string, string>> = { fr: {}, en: en as Record<string, string> };

export const langOf = (url: URL | string): Lang => {
  const p = typeof url === 'string' ? url : url.pathname;
  return /^\/en(\/|$)/.test(p) ? 'en' : 'fr';
};

// « /tarifs/ » -> « /en/tarifs/ » ; un lien déjà préfixé, externe ou technique est laissé tel quel.
export function localePath(lang: Lang, href: string): string {
  if (lang === 'fr' || !href.startsWith('/') || href.startsWith('//')) return href;
  if (/^\/(en(\/|$)|img\/|api\/|admin|c\/|_)/.test(href)) return href;
  return href === '/' ? '/en/' : `/en${href}`;
}

// Chemin équivalent dans l'autre langue (pour le sélecteur FR | EN et les balises hreflang).
export function switchPath(lang: Lang, pathname: string): string {
  if (lang === 'en') {
    const p = pathname.replace(/^\/en(?=\/|$)/, '');
    return p || '/';
  }
  return pathname === '/' ? '/en/' : `/en${pathname}`;
}

export type T = ((fr: string, vars?: Record<string, string | number>) => string) & { lang: Lang; has: (fr: string) => boolean };

export function makeT(lang: Lang): T {
  const d = DICT[lang];
  const f = ((fr: string, vars?: Record<string, string | number>) => {
    let s = d[fr] ?? fr;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  }) as T;
  f.lang = lang;
  f.has = (fr: string) => lang === 'fr' || fr in d;
  return f;
}

// Champs qui ne sont pas du texte à traduire (adresses, identifiants, images).
const SKIP_KEYS = new Set(['href', 'img', 'src', 'slug', 'images', 'carousel', 'heroImage', 'seminaireHeroImage', 'phone', 'phoneHref', 'email', 'maps', 'tripadvisor', 'url', 'menuImages', 'restaurantPhone', 'pageHeroes', 'building']);

// Traduit toutes les chaînes d'un arbre de contenu (celui de /admin) et préfixe ses liens internes. Chiffres, prix et images sont conservés.
export function translateTree<X>(tree: X, t: T): X {
  const walk = (v: any, key = ''): any => {
    if (typeof v === 'string') {
      if (key === 'href') return localePath(t.lang, v);
      return SKIP_KEYS.has(key) ? v : t(v);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k !== 'href' && SKIP_KEYS.has(k) ? x : walk(x, k)]));
    return v;
  };
  return walk(tree);
}

export const fmtNumber = (n: number, lang: Lang): string =>
  Math.round(n).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR').replace(/[\u202f\u00a0]/g, '\u00a0');
export const ogLocale = (lang: Lang): string => (lang === 'en' ? 'en_GB' : 'fr_FR');
