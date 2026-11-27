// Corrections de la version anglaise saisies dans l'admin : { phrase française : traduction }.
// Stockées comme le contenu (Vercel Blob en production, fichier local sinon) ; elles passent avant le dictionnaire du dépôt (src/i18n/en.json).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { head, put } from '@vercel/blob';
import { setOverrides } from './i18n';

const BLOB_PATH = 'content/translations-en.json';
const LOCAL_FILE = '.data/translations-en.json';
const CACHE_MS = 30_000;

const env = (k: string): string | undefined => (import.meta.env as any)[k] ?? process.env[k];
const useBlob = () => Boolean(env('BLOB_READ_WRITE_TOKEN'));

let loadedAt = 0;
let current: Record<string, string> = {};

const clean = (v: any): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && x.trim()) out[k] = x;
  return out;
};

async function read(): Promise<Record<string, string>> {
  try {
    if (useBlob()) {
      const meta = await head(BLOB_PATH).catch(() => null);
      if (!meta) return {};
      const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' });
      return res.ok ? clean(await res.json()) : {};
    }
    return clean(JSON.parse(await readFile(LOCAL_FILE, 'utf8')));
  } catch {
    return {};
  }
}

// Recharge les corrections (au plus toutes les 30 s) et les rend disponibles à t().
export async function loadTranslations(force = false): Promise<Record<string, string>> {
  if (!force && loadedAt && Date.now() - loadedAt < CACHE_MS) return current;
  current = await read();
  loadedAt = Date.now();
  setOverrides(current);
  return current;
}

export async function saveTranslations(next: Record<string, string>): Promise<void> {
  const body = JSON.stringify(clean(next), null, 2);
  if (useBlob()) {
    await put(BLOB_PATH, body, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0 });
  } else {
    await mkdir('.data', { recursive: true });
    await writeFile(LOCAL_FILE, body, 'utf8');
  }
  current = clean(next);
  loadedAt = Date.now();
  setOverrides(current);
}
