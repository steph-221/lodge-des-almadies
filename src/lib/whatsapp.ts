// Envoi WhatsApp par l'API Cloud de Meta (appel direct, sans dépendance). Serveur uniquement.
// Un message envoyé par l'hôtel en premier doit utiliser un modèle approuvé par Meta (un seul paramètre texte).
import { env } from './env';
import { templateBody } from './hotel/whatsapp-core';

const API = 'https://graph.facebook.com/v21.0';

export const whatsappConfigured = (): boolean => Boolean(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID') && env('WHATSAPP_TEMPLATE'));

// Envoie le modèle à chaque numéro ; renvoie le nombre de messages acceptés. Lève une erreur si aucun n'est accepté.
export async function sendWhatsApp(to: string[], param: string): Promise<number> {
  const token = env('WHATSAPP_TOKEN');
  const phoneId = env('WHATSAPP_PHONE_ID');
  const name = env('WHATSAPP_TEMPLATE');
  if (!token || !phoneId || !name) throw new Error('WhatsApp non configuré (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE).');
  const lang = env('WHATSAPP_TEMPLATE_LANG') || 'fr';
  let ok = 0;
  let lastStatus = 0;
  await Promise.all(to.map(async (num) => {
    try {
      const r = await fetch(`${API}/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(templateBody(num, name, lang, param)),
      });
      if (r.ok) ok++; else lastStatus = r.status;
    } catch { lastStatus = lastStatus || 599; }
  }));
  if (!ok && to.length) throw new Error(`WhatsApp : ${lastStatus}.`);
  return ok;
}
