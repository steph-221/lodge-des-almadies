import { adminConfigured, readToken } from '../auth';
import { dbConfigured } from '../db';
import type { Role } from './permissions';
import { findById } from './staff';

export type SessionUser = { id: number; name: string; role: Role; backup: boolean };

// Session complète : le jeton prouve l'identité, la base donne le rôle et l'état actuels (compte désactivé = refusé aussitôt).
export async function loadSession(cookieValue: string | undefined): Promise<SessionUser | null> {
  const claims = readToken(cookieValue);
  if (!claims) return null;
  if (claims.staffId === 0) {
    if (!adminConfigured() || claims.role !== 'direction') return null;
    return { id: 0, name: 'Accès de secours', role: 'direction', backup: true };
  }
  if (!dbConfigured()) return null;
  try {
    const s = await findById(claims.staffId);
    if (!s || !s.active || s.sessionVersion !== claims.sv || s.role !== claims.role) return null;
    return { id: s.id, name: s.displayName, role: s.role, backup: false };
  } catch (e) {
    console.error('[session] lecture du compte impossible :', (e as Error).message);
    return null;
  }
}
