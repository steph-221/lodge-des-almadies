import { sql } from '../db';

// Limitation durable et atomique des tentatives de connexion. Chaque tentative est comptée AVANT la vérification du code
// (un seul INSERT … ON CONFLICT), donc des essais en parallèle ne peuvent pas dépasser le seuil.
const WINDOW_MIN = 15;

export type Limit = { key: string; max: number };

// 5 essais par compte, 40 par adresse (le Wi-Fi de l'hôtel partage une seule adresse), 10 pour l'accès de secours.
export const limitsFor = (account: string, ipKey: string): Limit[] => [
  { key: account, max: account === 'backup' ? 10 : 5 },
  { key: ipKey, max: 40 },
];

export async function attempt(limits: Limit[]): Promise<{ locked: boolean; fails: number }> {
  const db = sql();
  let locked = false;
  let fails = 0;
  for (const { key, max } of limits) {
    const rows = (await db`
      insert into auth_throttle (key, fails, window_start, locked_until)
      values (${key}, 1, now(), null)
      on conflict (key) do update set
        fails = case when auth_throttle.window_start < now() - make_interval(mins => ${WINDOW_MIN}::int) then 1 else auth_throttle.fails + 1 end,
        window_start = case when auth_throttle.window_start < now() - make_interval(mins => ${WINDOW_MIN}::int) then now() else auth_throttle.window_start end,
        locked_until = case
          when (case when auth_throttle.window_start < now() - make_interval(mins => ${WINDOW_MIN}::int) then 1 else auth_throttle.fails + 1 end) > ${max}::int
            then now() + make_interval(mins => ${WINDOW_MIN}::int)
          when auth_throttle.window_start < now() - make_interval(mins => ${WINDOW_MIN}::int) then null
          else auth_throttle.locked_until end
      returning fails, (locked_until is not null and locked_until > now()) as locked`) as { fails: number; locked: boolean }[];
    if (rows[0]?.locked) locked = true;
    fails = Math.max(fails, rows[0]?.fails ?? 0);
  }
  return { locked, fails };
}

// Succès : on efface le compteur du compte et de l'adresse.
export async function clearFails(keys: string[]): Promise<void> {
  await sql()`delete from auth_throttle where key = any(${keys})`;
}

// Nettoyage des lignes périmées (appelé à chaque connexion réussie, évite la croissance de la table).
export async function purgeStale(): Promise<void> {
  await sql()`delete from auth_throttle where window_start < now() - interval '1 day'`;
}
