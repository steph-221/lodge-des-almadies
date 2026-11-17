import { describe, expect, it } from 'vitest';
import { generatePin, generatePassword, hashSecret, verifySecret } from '../src/lib/hotel/secret';

describe('codes du personnel', () => {
  it('vérifie un code correct et refuse un code faux', async () => {
    const h = await hashSecret('483920', 'poivre');
    expect(await verifySecret('483920', h, 'poivre')).toBe(true);
    expect(await verifySecret('483921', h, 'poivre')).toBe(false);
  });

  it('refuse si le poivre diffère', async () => {
    const h = await hashSecret('483920', 'poivre');
    expect(await verifySecret('483920', h, 'autre')).toBe(false);
  });

  it('produit un hachage salé différent à chaque fois, sans le code en clair', async () => {
    const a = await hashSecret('111111', 'p');
    const b = await hashSecret('111111', 'p');
    expect(a).not.toBe(b);
    expect(a).not.toContain('111111');
  });

  it('refuse un hachage mal formé sans lever d’erreur', async () => {
    expect(await verifySecret('x', 'n-importe-quoi', 'p')).toBe(false);
    expect(await verifySecret('x', '', 'p')).toBe(false);
  });

  it('génère un PIN à 6 chiffres et un mot de passe d’au moins 12 caractères', () => {
    for (let i = 0; i < 50; i++) expect(generatePin()).toMatch(/^\d{6}$/);
    const p = generatePassword();
    expect(p.length).toBeGreaterThanOrEqual(12);
    expect(generatePassword()).not.toBe(p);
  });
});
