import { describe, expect, it } from 'vitest';
import { normalizePhone, parsePhones, templateBody, templateParam } from '../src/lib/hotel/whatsapp-core';
import { alertText } from '../src/lib/hotel/requests-core';

describe('WhatsApp : numéros', () => {
  it('normalise un numéro international', () => {
    expect(normalizePhone('+221 77 123 45 67')).toBe('221771234567');
    expect(normalizePhone('00221 77.123.45.67')).toBe('221771234567');
    expect(normalizePhone('+33 (0)6 12 34 56 78')).toBe('3306123456 78'.replace(' ', ''));
  });
  it('refuse sans indicatif, trop court, ou avec des lettres', () => {
    expect(normalizePhone('77 123 45 67')).toBeNull();
    expect(normalizePhone('+22177')).toBeNull();
    expect(normalizePhone('+221 77 abc 45 67')).toBeNull();
    expect(normalizePhone('+0221771234567')).toBeNull();
  });
  it('lit une liste, retire les doublons, borne à 10', () => {
    const p = parsePhones('+221 77 123 45 67\n00221771234567; +33 6 12 34 56 78');
    expect(p).toEqual({ ok: true, value: ['221771234567', '33612345678'] });
    expect(parsePhones('').ok).toBe(true);
    expect(parsePhones('12345').ok).toBe(false);
    const many = Array.from({ length: 11 }, (_, i) => `+22177000${String(i).padStart(4, '0')}`).join('\n');
    expect(parsePhones(many).ok).toBe(false);
  });
});

describe('WhatsApp : message', () => {
  it('aplatit le texte de l’alerte pour le paramètre du modèle', () => {
    const a = alertText('request', { room: '12', title: 'Oreiller', note: 'ferme' }, 'https://exemple.test');
    const t = templateParam(a.text);
    expect(t).not.toMatch(/[\r\n\t]/);
    expect(t).not.toMatch(/ {2,}/);
    expect(t).toContain('chambre 12');
    expect(t).toContain('/admin/hotel/demandes/');
  });
  it('tronque un texte trop long', () => {
    const t = templateParam('x'.repeat(2000), 600);
    expect(t.length).toBe(600);
    expect(t.endsWith('…')).toBe(true);
  });
  it('construit le corps attendu par l’API Meta', () => {
    expect(templateBody('221771234567', 'alerte', 'fr', 'Bonjour')).toEqual({
      messaging_product: 'whatsapp', to: '221771234567', type: 'template',
      template: { name: 'alerte', language: { code: 'fr' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Bonjour' }] }] },
    });
  });
});
