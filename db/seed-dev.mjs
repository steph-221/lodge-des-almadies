// Jeu de démonstration pour une branche Neon de DÉVELOPPEMENT : un compte de test par rôle.
// Refuse de tourner en production. Utilisation : npm run db:seed:dev -- --branche-dev
// Les codes ci-dessous sont des valeurs de test pour la base de développement uniquement.
import pg from 'pg';
import { hashSecret } from '../src/lib/hotel/secret.ts';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error('[seed] DATABASE_URL absent.'); process.exit(1); }
if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
  console.error('[seed] Refusé : environnement de production.'); process.exit(1);
}
if (!process.argv.includes('--branche-dev')) {
  console.error('[seed] Ajoutez --branche-dev pour confirmer que DATABASE_URL pointe vers une branche Neon de développement.'); process.exit(1);
}

const pepper = process.env.STAFF_PEPPER || '';
if (pepper.length < 16) { console.error('[seed] STAFF_PEPPER (16 caractères minimum) requis.'); process.exit(1); }
const ACCOUNTS = [
  ['test.direction', 'Test Direction', 'direction', 'Dir-test-2026-xK9'],
  ['test.reception', 'Test Réception', 'reception', 'Rec-test-2026-mQ4'],
  ['test.gouvernante', 'Test Gouvernante', 'gouvernante', 'Gou-test-2026-pW7'],
  ['test.menage', 'Test Femme de chambre', 'femme_chambre', '482910'],
  ['test.technique', 'Test Technique', 'technique', '739251'],
  ['test.restaurant', 'Test Restaurant', 'restaurant', '264803'],
];

const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true } });
await client.connect();
try {
  // Garde-fou : une base qui contient de vrais comptes n'est pas une base de démonstration.
  const real = await client.query("select count(*)::int as n from staff where login not like 'test.%'");
  if (real.rows[0].n > 0) { console.error('[seed] Refusé : la base contient des comptes réels (hors test.*).'); process.exit(1); }
  for (const [login, name, role, secret] of ACCOUNTS) {
    const kind = /^\d{6}$/.test(secret) ? 'pin' : 'password';
    const hash = await hashSecret(secret, pepper);
    await client.query(
      `insert into staff (login, display_name, role, secret_hash, secret_kind) values ($1,$2,$3,$4,$5)
       on conflict (lower(login)) do update set secret_hash = excluded.secret_hash, role = excluded.role, active = true, session_version = staff.session_version + 1`,
      [login, name, role, hash, kind],
    );
  }
  console.log(`[seed] ${ACCOUNTS.length} comptes de test créés ou réinitialisés (identifiants test.*).`);
} finally {
  await client.end();
}
