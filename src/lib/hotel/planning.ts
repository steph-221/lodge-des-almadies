// Tâches de ménage d'une journée, déduites des séjours. Logique pure, testée.
export type PlanStay = {
  id: number; roomId: number; arrival: string; departure: string; guests: number;
  extraBed: boolean; babyCot: boolean; status: string;
};
export type PlannedTask = {
  roomId: number;
  kind: 'depart' | 'recouche';
  guests: number | null;     // personnes attendues (arrivée du jour pour un départ, séjour en cours pour une recouche)
  arrivalToday: boolean;
  extraBed: boolean;
  babyCot: boolean;
};

/**
 * Départ : la chambre se libère ce jour (avec l'arrivée du jour, s'il y en a une, pour préparer le bon nombre de lits).
 * Recouche : le client reste cette nuit. Arrivée seule dans une chambre déjà prête : aucune tâche.
 * Les dates sont des jours hôteliers (aaaa-mm-jj) ; le jour de départ n'est pas une nuit.
 */
export function planDay(date: string, stays: PlanStay[]): PlannedTask[] {
  const byRoom = new Map<number, PlanStay[]>();
  for (const s of stays) {
    if (s.status !== 'booked') continue;
    if (!(s.arrival <= date && date <= s.departure)) continue;
    (byRoom.get(s.roomId) ?? byRoom.set(s.roomId, []).get(s.roomId)!).push(s);
  }
  const tasks: PlannedTask[] = [];
  for (const [roomId, list] of byRoom) {
    const departing = list.find((s) => s.departure === date);
    const arriving = list.find((s) => s.arrival === date);
    const staying = list.find((s) => s.arrival < date && s.departure > date);
    if (departing) {
      tasks.push({
        roomId, kind: 'depart', guests: arriving?.guests ?? null, arrivalToday: Boolean(arriving),
        extraBed: arriving?.extraBed ?? false, babyCot: arriving?.babyCot ?? false,
      });
    } else if (staying) {
      tasks.push({ roomId, kind: 'recouche', guests: staying.guests, arrivalToday: false, extraBed: staying.extraBed, babyCot: staying.babyCot });
    }
  }
  return tasks.sort((a, b) => a.roomId - b.roomId);
}
