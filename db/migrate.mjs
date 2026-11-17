// Applique les migrations SQL de db/migrations/ dans l'ordre. Sans effet si aucune base n'est configurée
// (le site public ne dépend jamais de la base). Utilisation : node db/migrate.mjs [--status]
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log('[migrate] Aucune base configurée (DATABASE_URL absent) : migrations ignorées.');
  process.exit(0);
}

// Aperçus Vercel : on ne migre que si MIGRATE_PREVIEW=1 (à activer seulement si chaque aperçu a sa propre branche Neon).
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' && process.env.MIGRATE_PREVIEW !== '1') {
  console.log(`[migrate] Environnement ${process.env.VERCEL_ENV} : migrations ignorées (MIGRATE_PREVIEW=1 pour les appliquer).`);
  process.exit(0);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const statusOnly = process.argv.includes('--status');

const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query('select pg_advisory_lock(727001)');
  await client.query(`create table if not exists schema_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
  const done = new Map((await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum]));
  let applied = 0;
  for (const f of files) {
    // Fins de ligne normalisées : la même migration donne la même empreinte sous Windows (CRLF) et sur Vercel (LF).
    const sql = (await readFile(path.join(dir, f), 'utf8')).replace(/\r\n/g, '\n');
    const sum = createHash('sha256').update(sql).digest('hex');
    if (done.has(f)) {
      if (done.get(f) !== sum) throw new Error(`Migration déjà appliquée puis modifiée : ${f}. Créez une nouvelle migration.`);
      continue;
    }
    if (statusOnly) { console.log(`[migrate] en attente : ${f}`); continue; }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [f, sum]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw new Error(`Échec de ${f} : ${e.message}`);
    }
    applied++;
    console.log(`[migrate] appliquée : ${f}`);
  }
  console.log(`[migrate] ${statusOnly ? 'état affiché' : applied + ' migration(s) appliquée(s)'}, ${done.size} déjà en place.`);
} finally {
  await client.query('select pg_advisory_unlock(727001)').catch(() => {});
  await client.end();
}
