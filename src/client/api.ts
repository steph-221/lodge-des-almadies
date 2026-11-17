// Appels JSON vers l'API de l'espace hôtel. 401 : la session a expiré, retour à la connexion.
export async function api<T = Record<string, unknown>>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) { location.href = '/admin/'; }
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  return { ok: r.ok, status: r.status, data };
}
