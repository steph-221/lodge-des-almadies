// Déconnexion commune à toutes les pages de l'espace Services hôtel.
// Astro refuse toute écriture sans content-type dont l'origine ne correspond pas à son URL interne (403 derrière le proxy Vercel) : on en envoie un.
const JSON_HEADERS = { 'content-type': 'application/json' };
const logout = document.getElementById('logout');
logout?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/login', { method: 'DELETE', headers: JSON_HEADERS });
    // On vérifie que la session est bien fermée avant de quitter la page, et on affiche la cause sinon.
    const chk = await fetch('/api/hotel/me');
    if (chk.status !== 401) { logout.textContent = `Échec (code ${res.status}/${chk.status})`; return; }
  } catch { logout.textContent = 'Échec (réseau)'; return; }
  location.href = '/admin/';
});

// Pastilles d'alerte sur les onglets Demandes (nouvelles demandes) et Pannes (pannes ouvertes).
// Interrogation légère toutes les 30 s, en pause quand l'onglet du navigateur est caché.
function setBadge(href: string, n: number) {
  const a = document.querySelector<HTMLAnchorElement>(`nav.tabs a[href="${href}"]`);
  if (!a) return;
  a.querySelector('.badge')?.remove();
  if (n > 0) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = String(n);
    b.setAttribute('aria-label', `${n} à traiter`);
    a.appendChild(b);
  }
}

async function poll() {
  if (document.hidden) return;
  try {
    const r = await fetch('/api/hotel/requests?summary=1');
    if (!r.ok) return; // 401 : la page elle-même gère la reconnexion
    const d = (await r.json()) as { newRequests: number; openIssues: number };
    setBadge('/admin/hotel/demandes/', d.newRequests);
    setBadge('/admin/hotel/pannes/', d.openIssues);
  } catch { /* réseau coupé : on réessaiera */ }
}

if (document.querySelector('nav.tabs a[href="/admin/hotel/demandes/"]')) {
  void poll();
  setInterval(poll, 30_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
}
