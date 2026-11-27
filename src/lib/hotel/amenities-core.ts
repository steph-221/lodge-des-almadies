// Équipements des chambres : valeurs, regroupement pour les clients, liste commune d'une page, export CSV. Logique pure, testée.

export const AMENITY_VALUES = ['oui', 'non', 'sur_demande', 'supplement', 'a_verifier'] as const;
export type AmenityValue = (typeof AMENITY_VALUES)[number];
export const isAmenityValue = (v: unknown): v is AmenityValue => typeof v === 'string' && (AMENITY_VALUES as readonly string[]).includes(v);

export const VALUE_LABEL: Record<AmenityValue, string> = { oui: 'Oui', non: 'Non', sur_demande: 'Sur demande', supplement: 'En supplément', a_verifier: 'À vérifier' };

export type AmenityItem = { key: string; labelFr: string; labelEn: string; value: AmenityValue | null };

// Ce qu'un client voit : ce qui est inclus, ce qui se demande, ce qui est payant. « Non » et « À vérifier » restent cachés (on n'affiche jamais une information incertaine).
export function groupForGuest(items: AmenityItem[]): { included: AmenityItem[]; onRequest: AmenityItem[]; extra: AmenityItem[] } {
  return {
    included: items.filter((i) => i.value === 'oui'),
    onRequest: items.filter((i) => i.value === 'sur_demande'),
    extra: items.filter((i) => i.value === 'supplement'),
  };
}

const SUFFIX: Partial<Record<AmenityValue, string>> = { oui: 'inclus', sur_demande: 'sur demande', supplement: 'en supplément' };
// « Chambres communicantes (201 et 203) » -> « Chambres communicantes » : les numéros de chambre n'ont pas leur place dans une liste de catégorie.
const noRoomNumbers = (label: string): string => label.replace(/\s*\(\d[\d\s,;et]*\)\s*$/, '');

// Équipements d'une page qui regroupe plusieurs types : ce qui est inclus partout, puis ce qui varie.
// Un équipement « À vérifier » dans un type est laissé de côté (il n'est affiché nulle part tant qu'il n'est pas confirmé).
export function commonEquipment(types: { amenities: { key: string; label: string; value: AmenityValue }[] }[]): { all: string[]; some: string[] } {
  const order: string[] = [];
  const label = new Map<string, string>();
  const byKey = new Map<string, AmenityValue[]>();
  for (const t of types) {
    for (const a of t.amenities) {
      if (!byKey.has(a.key)) { byKey.set(a.key, []); order.push(a.key); label.set(a.key, a.label); }
      byKey.get(a.key)!.push(a.value);
    }
  }
  const all: string[] = [], some: string[] = [];
  for (const k of order) {
    const vals = byKey.get(k)!;
    if (vals.includes('a_verifier')) continue;
    const complete = vals.length === types.length;
    if (complete && vals.every((v) => v === 'oui')) { all.push(noRoomNumbers(label.get(k)!)); continue; }
    const kinds = [...new Set(vals.filter((v) => v !== 'non'))];
    if (!kinds.length) continue;
    const varies = kinds.length > 1 || !complete || vals.includes('non');
    const name = noRoomNumbers(label.get(k)!);
    if (kinds.length === 1 && kinds[0] === 'oui') some.push(`${name} (dans certaines chambres)`);
    else some.push(`${name} (${kinds.map((v) => SUFFIX[v]!).join(' ou ')}${varies ? ' selon la chambre' : ''})`);
  }
  return { all, some };
}

const csvCell = (s: string): string => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// Listing chambre par chambre, ouvert tel quel par Excel en français (point-virgule, accents).
export function amenityCsv(
  rooms: { number: string; building: string; typeLabel: string; values: Record<string, AmenityValue | null> }[],
  amenities: { key: string; labelFr: string }[],
): string {
  const head = ['Chambre', 'Bâtiment', 'Type', ...amenities.map((a) => a.labelFr)];
  const lines = rooms.map((r) => [r.number, r.building, r.typeLabel, ...amenities.map((a) => (r.values[a.key] ? VALUE_LABEL[r.values[a.key]!] : ''))]);
  return '﻿' + [head, ...lines].map((l) => l.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
