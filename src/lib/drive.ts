// Google Drive : envoi et lecture de fichiers par l'API REST (aucune dépendance). Serveur uniquement.
// Connexion : autorisation unique du compte Google de l'hôtel, jeton de renouvellement en variable d'environnement.
// Portée limitée aux fichiers créés par l'application (drive.file). Aucun lien public : les fichiers ne sortent que par une route protégée.
import { env } from './env';

export const driveConfigured = (): boolean =>
  Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REFRESH_TOKEN') && env('GOOGLE_DRIVE_ROOT_FOLDER_ID'));

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID') ?? '', client_secret: env('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: env('GOOGLE_REFRESH_TOKEN') ?? '', grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Google : jeton refusé (${r.status}).`);
  const d = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return d.access_token;
}

const api = async (url: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken()}` } });
  if (!r.ok) throw new Error(`Google Drive : ${r.status}.`);
  return r;
};

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureFolder(parentId: string, name: string): Promise<string> {
  const q = `name='${esc(name)}' and '${esc(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = (await (await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const created = (await (await api('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })).json()) as { id: string };
  return created.id;
}

// Envoie un fichier dans « racine / dossier1 / dossier2 … » (dossiers créés au besoin) et rend son identifiant Drive.
export async function driveUpload(path: string[], name: string, mime: string, bytes: Uint8Array): Promise<string> {
  let parent = env('GOOGLE_DRIVE_ROOT_FOLDER_ID') ?? '';
  for (const p of path) parent = await ensureFolder(parent, p);
  const boundary = `lodge${crypto.randomUUID().replace(/-/g, '')}`;
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const enc = new TextEncoder();
  const body = new Uint8Array([...enc.encode(head), ...bytes, ...enc.encode(tail)]);
  const r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body,
  });
  return ((await r.json()) as { id: string }).id;
}

export async function driveDownload(id: string): Promise<Uint8Array> {
  const r = await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
  return new Uint8Array(await r.arrayBuffer());
}

// Supprime un fichier (déjà absent = réussi). Sert à purger les photos de fiche après 30 jours.
export async function driveDelete(id: string): Promise<void> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${await accessToken()}` } });
  if (!r.ok && r.status !== 404) throw new Error(`Google Drive : ${r.status}.`);
}
