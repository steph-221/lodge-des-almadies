// Lecture d'une fiche de ménage photographiée par l'API Claude (vision + sortie structurée). Serveur uniquement.
// Le modèle ne fait que proposer : le résultat passe par parseRead (sheets-core) puis par la validation de la gouvernante.
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import { READ_SCHEMA, type SheetRow } from './sheets-core';
import type { Mime } from './files';

// Modèle de lecture : à confirmer après mesure sur de vraies fiches (lot 5, critère de fin). Réglable sans toucher au code par SHEETS_MODEL.
export const SHEET_MODEL = 'claude-opus-5-5';
export const visionConfigured = (): boolean => Boolean(env('ANTHROPIC_API_KEY'));
export const sheetModel = (): string => env('SHEETS_MODEL')?.trim() || SHEET_MODEL;

export type VisionResult = { raw: unknown; model: string; inputTokens: number; outputTokens: number };

export function describeSheet(rows: SheetRow[], code: string): string {
  const lines = rows.map((r) => {
    const mb = r.minibar.length ? ` — minibar : ${r.minibar.map((i) => i.name).join(', ')}` : '';
    return `- Chambre ${r.roomNumber}${mb}`;
  });
  return [
    `Voici la photo d'une fiche de ménage papier d'un hôtel, remplie à la main. Le code imprimé de la fiche est ${code}.`,
    'Chaque ligne du tableau correspond à une chambre. Colonnes : « Faite » (case à cocher), « Minibar : reste » (un petit cadre par article, où l\'on écrit le nombre restant), « Remarque » (texte libre).',
    'Chambres imprimées sur cette fiche :',
    ...lines,
    '',
    'Règles de lecture, à respecter strictement :',
    '- Rends une entrée pour chaque chambre imprimée, avec le numéro tel qu\'il est imprimé. N\'invente aucune chambre.',
    '- « done » : « checked » si la case est clairement cochée ou barrée, « empty » si elle est clairement vide, « unclear » dans tous les autres cas (trait hésitant, rature, ombre, doute).',
    '- Minibar : pour chaque article imprimé de la chambre, donne le nombre écrit dans son cadre. Si le cadre est vide, count = null et sure = true. Si le chiffre est difficile à lire (3 ou 8, 1 ou 7, 0 ou 6, rature), sure = false : ne devine jamais.',
    '- Remarque : recopie le texte lisible. Si une partie est difficile à lire, note_sure = false.',
    '- « code » : recopie le code imprimé en haut de la fiche tel que tu le lis (vide si illisible).',
    '- Dans le doute, déclare le doute (unclear, sure = false) : une fausse certitude est pire qu\'une case à vérifier.',
  ].join('\n');
}

export async function readSheetPhoto(o: { bytes: Uint8Array; mime: Mime; rows: SheetRow[]; code: string }): Promise<VisionResult> {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) throw new Error('La lecture par IA n’est pas configurée (clé ANTHROPIC_API_KEY absente).');
  const client = new Anthropic({ apiKey: key, timeout: 50_000, maxRetries: 1 });
  const model = sheetModel();
  const res = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    // Retombée automatique côté serveur si une règle de sécurité refuse la requête ; sans effet sur les autres modèles.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: READ_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: o.mime, data: Buffer.from(o.bytes).toString('base64') } },
        { type: 'text', text: describeSheet(o.rows, o.code) },
      ],
    }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Le modèle a refusé de lire cette photo.');
  if (res.stop_reason === 'max_tokens') throw new Error('Lecture interrompue (réponse trop longue).');
  const text = res.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Réponse du modèle vide.');
  let raw: unknown;
  try { raw = JSON.parse(text.text); } catch { throw new Error('Réponse du modèle illisible.'); }
  return { raw, model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}
