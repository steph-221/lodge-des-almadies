import defaults from '../data/content.default.json';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { head, put } from '@vercel/blob';
import { fmtNumber, makeT, translateTree, type Lang } from './i18n';

export type Content = typeof defaults;

const BLOB_PATH = 'content/content.json';
const LOCAL_FILE = '.data/content.json';
const CACHE_MS = 30_000;

const env = (k: string): string | undefined => (import.meta.env as any)[k] ?? process.env[k];
const useBlob = () => Boolean(env('BLOB_READ_WRITE_TOKEN'));

let cache: { at: number; value: Content } | null = null;
const cacheEn = new WeakMap<Content, Content>();

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Fusionne le contenu enregistré par-dessus les valeurs par défaut (les nouveaux champs gardent leur défaut).
function merge(base: any, over: any): any {
  if (Array.isArray(base) || Array.isArray(over)) return over ?? base;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const out: any = { ...base };
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

async function readStored(): Promise<any | null> {
  try {
    if (useBlob()) {
      const meta = await head(BLOB_PATH).catch(() => null);
      if (!meta) return null;
      const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    }
    return JSON.parse(await readFile(LOCAL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Contenu du site (valeurs par défaut + modifications de /admin). En anglais, chaque texte est traduit par le dictionnaire (src/i18n/en.json) ;
// une phrase absente du dictionnaire (par exemple un texte tout juste modifié dans /admin) reste en français.
export async function getContent(lang: Lang = 'fr'): Promise<Content> {
  let fr: Content;
  if (cache && Date.now() - cache.at < CACHE_MS) fr = cache.value;
  else {
    const stored = await readStored();
    fr = stored ? (merge(clone(defaults), stored) as Content) : clone(defaults);
    cache = { at: Date.now(), value: fr };
  }
  if (lang === 'fr') return fr;
  let en = cacheEn.get(fr);
  if (!en) { en = translateTree(fr, makeT('en')); cacheEn.set(fr, en); }
  return en;
}

export async function saveContent(next: Content): Promise<void> {
  const body = JSON.stringify(next, null, 2);
  if (useBlob()) {
    await put(BLOB_PATH, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 0,
    });
  } else {
    await mkdir('.data', { recursive: true });
    await writeFile(LOCAL_FILE, body, 'utf8');
  }
  cache = { at: Date.now(), value: next };
}

export const getDefaults = (): Content => clone(defaults);

// "hotel" -> /img/hotel.jpg ; une URL ou un chemin absolu est conservé tel quel.
export const imgSrc = (s: string): string => (/^(https?:)?\/\//.test(s) || s.startsWith('/') ? s : `/img/${s}.jpg`);

export const fmtFcfa = (n: number, lang: Lang = 'fr'): string => `${fmtNumber(n, lang)} FCFA`;
export const fmtEur = (n: number, rate: number, lang: Lang = 'fr'): string => (lang === 'en' ? `≈ €${fmtNumber(n / rate, lang)}` : `≈ ${fmtNumber(n / rate, lang)} €`);
