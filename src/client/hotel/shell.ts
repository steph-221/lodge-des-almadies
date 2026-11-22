// Déconnexion commune à toutes les pages de l'espace Services hôtel.
document.getElementById('logout')?.addEventListener('click', async () => {
  await fetch('/api/admin/login', { method: 'DELETE' });
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
