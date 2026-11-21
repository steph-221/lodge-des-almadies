// Catalogue d'articles (linge, consommables, minibar) : contrôle des saisies et import de fichier. Logique pure, testée.
import type { FieldDef, LineError, Mapping } from './import';
import type { Clean } from './validate';

export const ITEM_KINDS = ['linen', 'supply', 'minibar'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const isItemKind = (v: unknown): v is ItemKind => typeof v === 'string' && (ITEM_KINDS as readonly string[]).includes(v);
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { linen: 'Linge', supply: 'Consommable', minibar: 'Minibar' };

export const ITEM_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Article', required: true, aliases: ['article', 'nom', 'designation', 'produit', 'libelle', 'item', 'nomarticle'] },
  { key: 'kind', label: 'Nature (linge, consommable, minibar)', aliases: ['categorie', 'nature', 'type', 'famille', 'kind', 'category'] },
  { key: 'unit', label: 'Unité', aliases: ['unite', 'unit', 'conditionnement'] },
  { key: 'min_stock', label: 'Seuil d’alerte', aliases: ['seuil', 'stockmini', 'stockminimum', 'minimum', 'min', 'seuilalerte'] },
  { key: 'price', label: 'Prix de vente (FCFA)', aliases: ['prix', 'tarif', 'prixvente', 'price', 'pu', 'prixunitaire'] },
  { key: 'stock', label: 'Stock en réserve', aliases: ['stock', 'quantite', 'qte', 'qty', 'stockinitial', 'inventaire', 'enstock'] },
];

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export function parseItemKind(input: string | undefined | null): ItemKind {
  const s = norm(input ?? '');
  if (/linge|linen|textile|drap|serviette/.test(s)) return 'linen';
  if (/minibar|^bar$|boisson|frigo/.test(s)) return 'minibar';
  return 'supply';
}

const str = (v: unknown, max: number): string | null => {
  if (v == null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s.length <= max ? s : null;
};
// Entier positif ou nul ; vide = 0 ; les espaces de milliers sont tolérés (« 1 200 »).
const count = (v: unknown): number | null => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v).replace(/[\s  ]/g, '')) ? Number(String(v).replace(/[\s  ]/g, '')) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
};
export const parseCount = count;

export type ItemInput = { name: string; kind: ItemKind; unit: string; minStock: number; price: number };

export function cleanItem(b: Record<string, unknown>): Clean<ItemInput> {
  const name = str(b.name, 80);
  if (!name) return { ok: false, error: 'Nom de l’article obligatoire (80 caractères maximum).' };
  if (!isItemKind(b.kind)) return { ok: false, error: 'Nature inconnue (linge, consommable ou minibar).' };
  const unit = str(b.unit, 20);
  if (unit === null) return { ok: false, error: 'Unité trop longue.' };
  const minStock = count(b.minStock);
  const price = count(b.price);
  if (minStock === null) return { ok: false, error: 'Seuil d’alerte invalide (nombre entier).' };
  if (price === null) return { ok: false, error: 'Prix invalide (nombre entier en FCFA, 0 si non facturé).' };
  return { ok: true, value: { name, kind: b.kind, unit: unit || 'pièce', minStock, price } };
}

export type ItemImportRow = { line: number; name: string; kind: ItemKind; unit: string; minStock: number; price: number; stock: number };

const cell = (row: string[], i: number | undefined): string => (i !== undefined && i >= 0 ? (row[i] ?? '').trim() : '');

export function mapItems(rows: string[][], m: Mapping): { rows: ItemImportRow[]; errors: LineError[] } {
  const out: ItemImportRow[] = [];
  const errors: LineError[] = [];
  const seen = new Set<string>();
  rows.forEach((r, idx) => {
    const line = idx + 2;
    const fail = (message: string) => errors.push({ line, message });
    const name = cell(r, m.name);
    if (!name) return fail('Nom de l’article manquant.');
    if (name.length > 80) return fail('Nom trop long (80 caractères maximum).');
    if (seen.has(name.toLowerCase())) return fail(`Article « ${name} » en double dans le fichier.`);
    const minStock = count(cell(r, m.min_stock));
    if (minStock === null) return fail('Seuil d’alerte invalide.');
    const price = count(cell(r, m.price));
    if (price === null) return fail('Prix invalide.');
    const stock = count(cell(r, m.stock));
    if (stock === null) return fail('Stock invalide.');
    const unit = cell(r, m.unit);
    if (unit.length > 20) return fail('Unité trop longue.');
    seen.add(name.toLowerCase());
    out.push({ line, name, kind: parseItemKind(cell(r, m.kind)), unit: unit || 'pièce', minStock, price, stock });
  });
  return { rows: out, errors };
}
