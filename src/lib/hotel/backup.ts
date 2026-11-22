// Sauvegarde quotidienne : export JSON de toutes les tables de l'espace hôtel vers Google Drive. Serveur uniquement.
// Jamais de secret : les empreintes de codes et de mots de passe du personnel ne sont pas exportées.
import { sql } from '../db';
import { driveUpload } from '../drive';

const EXCLUDED = new Set(['auth_throttle', 'schema_migrations', 'job_runs']);
const STAFF_SAFE = 'id, login, display_name, role, active, lang, last_login_at, created_at';

export async function exportAll(): Promise<{ tables: Record<string, unknown[]>; counts: Record<string, number> }> {
  const names = ((await sql().query(`select table_name as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)) as { n: string }[])
    .map((r) => r.n).filter((n) => !EXCLUDED.has(n));
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const n of names) {
    // Les noms viennent du catalogue de la base, jamais d'une saisie : guillemets par prudence.
    const cols = n === 'staff' ? STAFF_SAFE : '*';
    const rows = (await sql().query(`select ${cols} from "${n.replace(/"/g, '')}"`)) as unknown[];
    tables[n] = rows;
    counts[n] = rows.length;
  }
  return { tables, counts };
}

// Envoie « Sauvegardes / <année> / sauvegarde-<date>.json » sur Drive et rend l'identifiant du fichier.
export async function backupToDrive(date: string): Promise<{ fileId: string; bytes: number; tables: number }> {
  const { tables, counts } = await exportAll();
  const bytes = new TextEncoder().encode(JSON.stringify({ date, exportedAt: new Date().toISOString(), counts, tables }));
  const fileId = await driveUpload(['Sauvegardes', date.slice(0, 4)], `sauvegarde-${date}.json`, 'application/json', bytes);
  return { fileId, bytes: bytes.length, tables: Object.keys(counts).length };
}
