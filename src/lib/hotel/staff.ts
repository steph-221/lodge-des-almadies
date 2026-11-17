import { env } from '../env';
import { sql } from '../db';
import { isRole, type Role } from './permissions';
import { generatePassword, generatePin, hashSecret } from './secret';

export type Staff = {
  id: number;
  login: string;
  displayName: string;
  role: Role;
  secretKind: 'pin' | 'password';
  active: boolean;
  sessionVersion: number;
  lang: 'fr' | 'en';
  lastLoginAt: string | null;
};
type StaffRow = Staff & { secretHash: string };

// Poivre obligatoire : sans lui, aucun code du personnel ne peut être créé ni vérifié (pas de repli sur SESSION_SECRET).
export const pepper = (): string => {
  const p = env('STAFF_PEPPER') ?? '';
  if (p.length < 16) throw new Error('STAFF_PEPPER manquant ou trop court (16 caractères minimum).');
  return p;
};

// PIN à 6 chiffres pour les rôles de terrain, mot de passe pour ceux qui voient des noms de clients.
export const secretKindFor = (role: Role): 'pin' | 'password' =>
  role === 'femme_chambre' || role === 'technique' || role === 'restaurant' ? 'pin' : 'password';

const COLS = `id::int as id, login, display_name as "displayName", role, secret_kind as "secretKind", active,
  session_version as "sessionVersion", lang,
  to_char(last_login_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastLoginAt"`;

export async function findByLogin(login: string): Promise<StaffRow | null> {
  const rows = (await sql().query(`select ${COLS}, secret_hash as "secretHash" from staff where lower(login) = lower($1)`, [login])) as StaffRow[];
  return rows[0] ?? null;
}

export async function findById(id: number): Promise<Staff | null> {
  const rows = (await sql().query(`select ${COLS} from staff where id = $1`, [id])) as Staff[];
  return rows[0] ?? null;
}

export async function listStaff(): Promise<Staff[]> {
  return (await sql().query(`select ${COLS} from staff order by active desc, role, display_name`)) as Staff[];
}

export async function touchLogin(id: number): Promise<void> {
  await sql().query('update staff set last_login_at = now() where id = $1', [id]);
}

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;

export async function createStaff(input: { login: string; displayName: string; role: string }): Promise<{ staff: Staff; secret: string } | { error: string }> {
  const login = input.login.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!LOGIN_RE.test(login)) return { error: 'Identifiant : 3 à 40 caractères (lettres, chiffres, point, tiret).' };
  if (!displayName || displayName.length > 80) return { error: 'Nom affiché obligatoire (80 caractères maximum).' };
  if (!isRole(input.role)) return { error: 'Rôle inconnu.' };
  const kind = secretKindFor(input.role);
  const secret = kind === 'pin' ? generatePin() : generatePassword();
  const hash = await hashSecret(secret, pepper());
  try {
    const rows = (await sql().query(
      `insert into staff (login, display_name, role, secret_hash, secret_kind) values ($1,$2,$3,$4,$5) returning ${COLS}`,
      [login, displayName, input.role, hash, kind],
    )) as Staff[];
    return { staff: rows[0], secret };
  } catch (e) {
    // 23505 : identifiant déjà pris (y compris par une création simultanée).
    if ((e as { code?: string }).code === '23505') return { error: 'Cet identifiant existe déjà.' };
    throw e;
  }
}

// Nouveau code : l'ancien cesse de fonctionner et toutes les sessions ouvertes sont révoquées.
export async function resetSecret(id: number): Promise<{ secret: string } | null> {
  const s = await findById(id);
  if (!s) return null;
  const secret = s.secretKind === 'pin' ? generatePin() : generatePassword();
  const hash = await hashSecret(secret, pepper());
  await sql().query('update staff set secret_hash = $1, session_version = session_version + 1 where id = $2', [hash, id]);
  return { secret };
}

export async function setActive(id: number, active: boolean): Promise<void> {
  await sql().query('update staff set active = $1, session_version = session_version + 1 where id = $2', [active, id]);
}
