// Linge à sortir, rapprochement de blanchisserie et consommation du minibar. Logique pure, testée.

export type PrepKind = 'depart' | 'recouche';
export type PrepCond = 'extra_bed' | 'baby_cot';

// Une ligne de gabarit : « pour ce type de chambre (ou tous), cette nature, cette occupation (ou toutes), tant d'exemplaires de cet article ».
export type PrepLine = { roomTypeId: number | null; kind: PrepKind; occupancy: number | null; cond: PrepCond | null; itemId: number; qty: number };
export type NeedTask = { roomTypeId: number | null; kind: PrepKind; guests: number | null; extraBed: boolean; babyCot: boolean };

/**
 * Besoins cumulés pour un ensemble de tâches.
 * Par article, la ligne la plus précise l'emporte (type de chambre : 2 points, occupation : 1 point) ; une quantité 0 annule donc la ligne générale.
 * Les lignes « lit d'appoint » et « lit bébé » s'ajoutent seulement si le séjour les demande.
 * Sans nombre de personnes connu, seules les lignes sans occupation servent.
 */
export function linenNeeds(tasks: NeedTask[], lines: PrepLine[]): { itemId: number; qty: number }[] {
  const totals = new Map<number, number>();
  for (const t of tasks) {
    const best = new Map<string, { score: number; itemId: number; qty: number }>();
    for (const l of lines) {
      if (l.kind !== t.kind) continue;
      if (l.roomTypeId !== null && l.roomTypeId !== t.roomTypeId) continue;
      if (l.occupancy !== null && l.occupancy !== t.guests) continue;
      if (l.cond === 'extra_bed' && !t.extraBed) continue;
      if (l.cond === 'baby_cot' && !t.babyCot) continue;
      const score = (l.roomTypeId !== null ? 2 : 0) + (l.occupancy !== null ? 1 : 0);
      const key = `${l.itemId}|${l.cond ?? ''}`;
      const cur = best.get(key);
      if (!cur || score > cur.score || (score === cur.score && l.qty > cur.qty)) best.set(key, { score, itemId: l.itemId, qty: l.qty });
    }
    for (const b of best.values()) totals.set(b.itemId, (totals.get(b.itemId) ?? 0) + b.qty);
  }
  return [...totals.entries()].filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty })).sort((a, b) => a.itemId - b.itemId);
}

export type LaundryInput = { itemId: number; sent: number; received: number; damaged: number };
export type LaundryResult = { ok: boolean; error?: string; lines: (LaundryInput & { missing: number })[] };

// Manquants = envoyé − revenu − abîmé. Un retour supérieur à l'envoi est une erreur de saisie.
export function reconcileLaundry(input: LaundryInput[]): LaundryResult {
  const lines = input.map((l) => ({ ...l, missing: l.sent - l.received - l.damaged }));
  for (const l of lines) {
    if (![l.sent, l.received, l.damaged].every((n) => Number.isInteger(n) && n >= 0)) return { ok: false, error: 'Quantités invalides (entiers positifs ou nuls).', lines };
    if (l.missing < 0) return { ok: false, error: 'Le retour (revenu + abîmé) dépasse la quantité envoyée.', lines };
  }
  return { ok: true, lines };
}

// Consommation d'un minibar : ce qui manque par rapport à la dotation. Un comptage supérieur à la dotation ne donne pas de consommation négative.
export function minibarConsumption(dotation: number, counted: number): { consumed: number; restock: number } {
  const consumed = Math.max(0, dotation - counted);
  return { consumed, restock: consumed };
}
