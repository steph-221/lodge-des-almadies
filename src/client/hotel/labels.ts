// Libellés partagés côté navigateur (les modules serveur importent la base et ne doivent pas être chargés ici).
export const STATUS_LABEL: Record<string, string> = {
  dirty: 'À nettoyer', in_progress: 'En cours', to_check: 'À contrôler', ready: 'Prête', out_of_service: 'Hors service',
};
export const TASK_LABEL: Record<string, string> = { todo: 'À faire', doing: 'En cours', done: 'Terminée', checked: 'Contrôlée' };
export const KIND_LABEL: Record<string, string> = { depart: 'Départ', recouche: 'Recouche' };

export const fmtDate = (iso: string): string => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
export const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;
