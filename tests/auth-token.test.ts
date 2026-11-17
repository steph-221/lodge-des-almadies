import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  process.env.SESSION_SECRET = 'secret-de-test-0123456789abcdef';
});

const load = () => import('../src/lib/auth');

describe('jeton de session v2', () => {
  it('relit les informations d’un jeton valide', async () => {
    const { makeToken, readToken } = await load();
    const t = makeToken({ staffId: 7, role: 'gouvernante', sv: 3 });
    expect(t.startsWith('v2.')).toBe(true);
    expect(readToken(t)).toMatchObject({ staffId: 7, role: 'gouvernante', sv: 3 });
  });

  it('refuse un jeton falsifié (rôle changé)', async () => {
    const { makeToken, readToken } = await load();
    const parts = makeToken({ staffId: 7, role: 'femme_chambre', sv: 1 }).split('.');
    parts[3] = 'direction';
    expect(readToken(parts.join('.'))).toBeNull();
  });

  it('refuse un jeton expiré', async () => {
    const { makeToken, readToken } = await load();
    const t = makeToken({ staffId: 1, role: 'direction', sv: 1 }, Date.now() - 9 * 3600 * 1000);
    expect(readToken(t)).toBeNull();
  });

  it('refuse l’ancien format exp.mac et les valeurs absurdes', async () => {
    const { readToken } = await load();
    expect(readToken('1999999999.abcdef')).toBeNull();
    expect(readToken(undefined)).toBeNull();
    expect(readToken('')).toBeNull();
    expect(readToken('v2.a.b.c.d.e')).toBeNull();
  });

  it('refuse un jeton signé avec un autre secret', async () => {
    const { makeToken, readToken } = await load();
    const t = makeToken({ staffId: 2, role: 'reception', sv: 1 });
    process.env.SESSION_SECRET = 'un-autre-secret-0123456789abcdef';
    expect(readToken(t)).toBeNull();
  });

  it('isAdmin n’accepte que la direction', async () => {
    const { makeToken, isAdmin } = await load();
    expect(isAdmin(makeToken({ staffId: 0, role: 'direction', sv: 0 }))).toBe(true);
    expect(isAdmin(makeToken({ staffId: 9, role: 'reception', sv: 1 }))).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});
