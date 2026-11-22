// Logique pure des fiches de ménage papier : fiche imprimée, lecture du modèle, contrôles avant validation. Testée, sans base ni réseau.
// Principe : le modèle propose, jamais il n'applique. Tout ce qui est douteux est signalé et doit être confirmé par la gouvernante.

export type SheetItem = { itemId: number; name: string; dotation: number };
export type SheetRow = {
  taskId: number; roomId: number; roomNumber: string; kind: 'depart' | 'recouche'; guests: number | null;
  minibar: SheetItem[]; // articles du minibar de la chambre (vide si pas de minibar)
};

export const sheetCode = (id: number): string => `FM-${String(id).padStart(5, '0')}`;
export const MAX_COUNT = 99;

// ---------- Fiche imprimée ----------

type TaskLike = { id: number; roomId: number; roomNumber: string; kind: 'depart' | 'recouche'; guests: number | null };
type RoomMinibar = { roomId: number; lines: { itemId: number; itemName: string; dotation: number }[] };

// Une ligne par chambre à faire, dans l'ordre des numéros de chambre ; le minibar suit la dotation du type de chambre.
export function buildSheetRows(tasks: TaskLike[], minibar: RoomMinibar[]): SheetRow[] {
  const mb = new Map(minibar.map((m) => [m.roomId, m.lines]));
  return [...tasks]
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'fr', { numeric: true }))
    .map((t) => ({
      taskId: t.id, roomId: t.roomId, roomNumber: t.roomNumber, kind: t.kind, guests: t.guests,
      minibar: (mb.get(t.roomId) ?? []).map((l) => ({ itemId: l.itemId, name: l.itemName, dotation: l.dotation })),
    }));
}

// ---------- Lecture du modèle ----------

// Schéma imposé au modèle (sortie structurée). Une case incertaine doit être déclarée « unclear », jamais devinée.
export const READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'rows'],
  properties: {
    code: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['room', 'done', 'minibar', 'note', 'note_sure'],
        properties: {
          room: { type: 'string' },
          done: { type: 'string', enum: ['checked', 'empty', 'unclear'] },
          minibar: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['item', 'count', 'sure'],
              properties: { item: { type: 'string' }, count: { anyOf: [{ type: 'integer' }, { type: 'null' }] }, sure: { type: 'boolean' } },
            },
          },
          note: { type: 'string' },
          note_sure: { type: 'boolean' },
        },
      },
    },
  },
} as const;

export type ReadCell = { value: number | null; sure: boolean };
export type ReadRow = {
  taskId: number; roomNumber: string;
  done: boolean | null; // null = case illisible ou ambiguë
  minibar: { itemId: number; name: string; count: number | null; sure: boolean }[];
  note: string; noteSure: boolean;
  flags: string[]; // raisons pour lesquelles la ligne demande une vérification
};
export type ReadResult = { codeRead: string; codeMatches: boolean; rows: ReadRow[]; problems: string[] };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Rapproche la réponse du modèle de la fiche imprimée. Tout écart devient un « flag » : rien n'est jamais déduit en silence.
export function parseRead(raw: unknown, rows: SheetRow[], code: string): ReadResult {
  const problems: string[] = [];
  const src = isObj(raw) && Array.isArray(raw.rows) ? (raw.rows as unknown[]) : [];
  if (!isObj(raw) || !Array.isArray(raw.rows)) problems.push('Réponse du modèle illisible.');
  const codeRead = isObj(raw) && typeof raw.code === 'string' ? raw.code.trim() : '';
  const codeMatches = norm(codeRead).replace(/ /g, '') === norm(code).replace(/ /g, '');
  if (!codeMatches) problems.push(`Le code lu sur la photo (« ${codeRead || 'aucun'} ») ne correspond pas à la fiche ${code} : vérifiez que c’est la bonne feuille.`);

  const byRoom = new Map<string, Record<string, unknown>[]>();
  for (const r of src) {
    if (!isObj(r) || typeof r.room !== 'string') continue;
    const k = norm(r.room);
    byRoom.set(k, [...(byRoom.get(k) ?? []), r]);
  }
  const expected = new Set(rows.map((r) => norm(r.roomNumber)));
  for (const k of byRoom.keys()) if (!expected.has(k)) problems.push(`Une ligne lue (« ${k} ») n’existe pas sur la fiche : elle est ignorée.`);

  const out: ReadRow[] = rows.map((row) => {
    const flags: string[] = [];
    const hits = byRoom.get(norm(row.roomNumber)) ?? [];
    if (hits.length === 0) flags.push('ligne non lue');
    if (hits.length > 1) flags.push('ligne lue plusieurs fois');
    const hit = hits.length === 1 ? hits[0] : null;

    let done: boolean | null = null;
    if (hit) {
      if (hit.done === 'checked') done = true;
      else if (hit.done === 'empty') done = false;
      else flags.push('case « faite » illisible');
    }

    const mbSrc = hit && Array.isArray(hit.minibar) ? (hit.minibar as unknown[]) : [];
    const minibar = row.minibar.map((it) => {
      const m = mbSrc.filter(isObj).filter((x) => typeof x.item === 'string' && norm(x.item as string) === norm(it.name));
      if (!hit) return { itemId: it.itemId, name: it.name, count: null, sure: false };
      if (m.length !== 1) { flags.push(`minibar « ${it.name} » non lu`); return { itemId: it.itemId, name: it.name, count: null, sure: false }; }
      const c = m[0].count;
      const sure = m[0].sure === true;
      if (c === null || c === undefined) return { itemId: it.itemId, name: it.name, count: null, sure: true }; // case laissée vide : article non compté
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > MAX_COUNT) { flags.push(`minibar « ${it.name} » : quantité invalide`); return { itemId: it.itemId, name: it.name, count: null, sure: false }; }
      if (!sure) flags.push(`minibar « ${it.name} » : lecture incertaine`);
      // Plus que la dotation : possible si l'article a été remis, mais à confirmer.
      if (c > it.dotation) flags.push(`minibar « ${it.name} » : ${c} dépasse la dotation (${it.dotation})`);
      return { itemId: it.itemId, name: it.name, count: c, sure: sure && c <= it.dotation };
    });

    const note = hit && typeof hit.note === 'string' ? hit.note.trim().slice(0, 300) : '';
    const noteSure = hit ? hit.note_sure === true || note === '' : false;
    if (note && !noteSure) flags.push('remarque incertaine');
    return { taskId: row.taskId, roomNumber: row.roomNumber, done, minibar, note, noteSure, flags };
  });

  return { codeRead, codeMatches, rows: out, problems };
}

export const rowNeedsReview = (r: ReadRow): boolean => r.flags.length > 0;

// Lecture inutilisable : le code ne correspond pas. Rien n'est prérempli.
export const readUsable = (r: ReadResult): boolean => r.codeMatches;

// ---------- Validation par la gouvernante ----------

export type FinalRow = { taskId: number; done: boolean; minibar: { itemId: number; counted: number }[]; note: string };
export type ValidateInput = { rows: FinalRow[]; reviewed: number[] };

const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };

// Contrôle la saisie finale contre la fiche imprimée. Les lignes douteuses d'une lecture doivent avoir été confirmées une à une.
export function cleanValidation(b: Record<string, unknown>, rows: SheetRow[], read: ReadResult | null): Clean<ValidateInput> {
  if (!Array.isArray(b.rows)) return { ok: false, error: 'Lignes manquantes.' };
  const known = new Map(rows.map((r) => [r.taskId, r]));
  const out: FinalRow[] = [];
  const seen = new Set<number>();
  for (const x of b.rows) {
    if (!isObj(x)) return { ok: false, error: 'Ligne illisible.' };
    const taskId = int(x.taskId, 1, Number.MAX_SAFE_INTEGER);
    const row = taskId ? known.get(taskId) : undefined;
    if (!taskId || !row) return { ok: false, error: 'Chambre absente de la fiche.' };
    if (seen.has(taskId)) return { ok: false, error: `Chambre ${row.roomNumber} en double.` };
    seen.add(taskId);
    if (typeof x.done !== 'boolean') return { ok: false, error: `Chambre ${row.roomNumber} : indiquez si le ménage est fait.` };
    const mb: FinalRow['minibar'] = [];
    for (const m of Array.isArray(x.minibar) ? x.minibar : []) {
      if (!isObj(m)) return { ok: false, error: `Chambre ${row.roomNumber} : minibar illisible.` };
      const itemId = int(m.itemId, 1, Number.MAX_SAFE_INTEGER);
      const counted = int(m.counted, 0, MAX_COUNT);
      if (!itemId || !row.minibar.some((i) => i.itemId === itemId)) return { ok: false, error: `Chambre ${row.roomNumber} : article hors fiche.` };
      if (counted === null) return { ok: false, error: `Chambre ${row.roomNumber} : quantité de minibar invalide (0 à ${MAX_COUNT}).` };
      mb.push({ itemId, counted });
    }
    if (new Set(mb.map((m) => m.itemId)).size !== mb.length) return { ok: false, error: `Chambre ${row.roomNumber} : article en double.` };
    const note = typeof x.note === 'string' ? x.note.trim() : '';
    if (note.length > 300) return { ok: false, error: `Chambre ${row.roomNumber} : remarque trop longue (300 caractères).` };
    out.push({ taskId, done: x.done, minibar: mb, note });
  }
  if (out.length !== rows.length) return { ok: false, error: 'Toutes les chambres de la fiche doivent figurer dans la validation.' };

  const reviewed = Array.isArray(b.reviewed) ? b.reviewed.filter((n): n is number => typeof n === 'number') : [];
  if (read) {
    if (!read.codeMatches) return { ok: false, error: 'La photo ne correspond pas à cette fiche : renvoyez la bonne photo, ou saisissez la fiche à la main sans photo.' };
    for (const r of read.rows) {
      if (rowNeedsReview(r) && !reviewed.includes(r.taskId)) return { ok: false, error: `Chambre ${r.roomNumber} : lecture douteuse (${r.flags.join(', ')}), à confirmer avant de valider.` };
    }
  }
  return { ok: true, value: { rows: out, reviewed } };
}

// La remarque de la fiche s'ajoute à la note de la tâche sans effacer ce qui y figure déjà (500 caractères au plus).
export function appendNote(existing: string, note: string): string {
  const n = note.trim();
  if (!n) return existing;
  if (existing.includes(n)) return existing;
  return (existing ? `${existing} | Fiche : ${n}` : `Fiche : ${n}`).slice(0, 500);
}

// Une tâche déjà terminée ou contrôlée ne revient jamais en arrière ; la fiche ne fait qu'avancer l'état.
export const shouldMarkDone = (status: string, done: boolean): boolean => done && (status === 'todo' || status === 'doing');
