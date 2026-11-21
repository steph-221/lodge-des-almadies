// Fichiers rattachés à une entité (photos de visite). Google Drive quand il est configuré ; en développement, dossier local .data/files.
// En production sans Drive : l'envoi est refusé (jamais d'écriture sur le disque du serveur). Serveur uniquement.
import { sql } from '../db';
import { driveConfigured, driveDownload, driveUpload } from '../drive';

export const MAX_FILE_BYTES = 2_000_000;
export type FileKind = 'inspection';
export type Mime = 'image/jpeg' | 'image/png' | 'image/webp';

export type StorageMode = 'drive' | 'local' | null;
export const storageMode = (): StorageMode => (driveConfigured() ? 'drive' : import.meta.env.PROD ? null : 'local');

// Le type annoncé doit correspondre au contenu réel (signature des premiers octets).
export function sniffMime(b: Uint8Array): Mime | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
const EXT: Record<Mime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type StoredFile = { id: number; mime: Mime; size: number; createdAt: string };

export async function listFiles(kind: FileKind, entityIds: number[]): Promise<(StoredFile & { entityId: number })[]> {
  if (!entityIds.length) return [];
  return (await sql().query(
    `select id::int as id, entity_id::int as "entityId", mime, size, to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
     from files where kind = $1 and entity_id = any($2::bigint[]) order by id`, [kind, entityIds],
  )) as (StoredFile & { entityId: number })[];
}

export async function countFiles(kind: FileKind, entityId: number): Promise<number> {
  return ((await sql().query(`select count(*)::int as n from files where kind=$1 and entity_id=$2`, [kind, entityId])) as { n: number }[])[0].n;
}

export async function saveFile(o: { kind: FileKind; entityId: number; bytes: Uint8Array; staffId: number | null; folder: string[] }): Promise<{ id: number } | { error: string }> {
  const mode = storageMode();
  if (!mode) return { error: 'Le stockage des photos n’est pas configuré (Google Drive).' };
  if (o.bytes.length === 0 || o.bytes.length > MAX_FILE_BYTES) return { error: 'Photo vide ou trop lourde (2 Mo maximum).' };
  const mime = sniffMime(o.bytes);
  if (!mime) return { error: 'Format non reconnu (JPEG, PNG ou WebP).' };
  const name = `${o.kind}-${o.entityId}-${Date.now()}.${EXT[mime]}`;
  let remoteId: string;
  if (mode === 'drive') remoteId = await driveUpload(o.folder, name, mime, o.bytes);
  else {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), '.data', 'files');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), o.bytes);
    remoteId = name;
  }
  const r = (await sql().query(
    `insert into files (storage, remote_id, kind, entity_id, mime, size, staff_id) values ($1,$2,$3,$4,$5,$6,$7) returning id::int as id`,
    [mode, remoteId, o.kind, o.entityId, mime, o.bytes.length, o.staffId && o.staffId > 0 ? o.staffId : null],
  )) as { id: number }[];
  return { id: r[0].id };
}

export async function readFile(id: number): Promise<{ mime: Mime; bytes: Uint8Array } | null> {
  const r = (await sql().query(`select storage, remote_id as "remoteId", mime from files where id = $1`, [id])) as { storage: 'drive' | 'local'; remoteId: string; mime: Mime }[];
  const f = r[0];
  if (!f) return null;
  if (f.storage === 'drive') return { mime: f.mime, bytes: await driveDownload(f.remoteId) };
  if (!/^[a-z]+-\d+-\d+\.(jpg|png|webp)$/.test(f.remoteId)) return null; // jamais de chemin libre
  const { readFile: rf } = await import('node:fs/promises');
  const { join } = await import('node:path');
  return { mime: f.mime, bytes: new Uint8Array(await rf(join(process.cwd(), '.data', 'files', f.remoteId))) };
}
