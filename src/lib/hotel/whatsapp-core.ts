// Logique pure des alertes WhatsApp : numéros et texte du modèle (testable, sans réseau).
import type { Clean } from './validate';

// Numéro international : « +221 77 123 45 67 » ou « 00221… » → « 221771234567 » (chiffres seuls, 8 à 15).
export function normalizePhone(raw: string): string | null {
  const s = raw.trim();
  if (!/^(\+|00)/.test(s)) return null; // format international obligatoire : aucun indicatif supposé
  if (!/^[+\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '').replace(/^00/, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

// Un numéro par ligne ou séparés par « ; ». La virgule reste dans les numéros écrits « +221 77, … » : on ne la sépare pas.
export function parsePhones(text: string): Clean<string[]> {
  const parts = text.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const n = normalizePhone(p);
    if (!n) return { ok: false, error: `Numéro invalide (format international, ex. +221 77 000 00 00) : ${p.slice(0, 40)}` };
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > 10) return { ok: false, error: '10 numéros au maximum.' };
  return { ok: true, value: out };
}

// Meta refuse les retours à la ligne, tabulations et plus de 4 espaces d'affilée dans un paramètre de modèle.
export function templateParam(text: string, max = 600): string {
  const flat = text.replace(/[\r\n\t]+/g, ' · ').replace(/ {2,}/g, ' ').replace(/(?: · )+/g, ' · ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function templateBody(to: string, name: string, lang: string, param: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: param }] }] },
  };
}
