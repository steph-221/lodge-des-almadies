// Corps JSON toujours sous forme d'objet : un corps absent, `null` ou un tableau donne {} (jamais d'exception).
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const v: unknown = await req.json().catch(() => null);
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Réponse JSON sans mise en cache, utilisée par toutes les routes d'administration.
export const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
