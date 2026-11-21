// Lecture de tableaux collés ou exportés (CSV, texte copié depuis Excel). Logique pure, partagée par le serveur et le navigateur.
export type Table = { delimiter: string; headers: string[]; rows: string[][] };

const DELIMS = [';', ',', '\t'] as const;

// Séparateur le plus fréquent sur la première ligne, hors guillemets.
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const c of text) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && (c === '\n' || c === '\r')) break;
    else if (!inQ && c in counts) counts[c]++;
  }
  let best = ',';
  let max = 0;
  for (const d of DELIMS) if (counts[d] > max) { max = counts[d]; best = d; }
  return best;
}

export function parseTable(input: string): Table {
  const text = input.replace(/^﻿/, '');
  if (!text.trim()) return { delimiter: ',', headers: [], rows: [] };
  const delimiter = detectDelimiter(text);
  const all: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); all.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delimiter) endCell();
    else if (c === '\n') endRow();
    else if (c === '\r') { if (text[i + 1] === '\n') i++; endRow(); }
    else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  const clean = all.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
  if (!clean.length) return { delimiter, headers: [], rows: [] };
  return { delimiter, headers: clean[0], rows: clean.slice(1) };
}
