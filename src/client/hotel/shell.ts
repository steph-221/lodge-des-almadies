// Déconnexion commune à toutes les pages de l'espace Services hôtel.
document.getElementById('logout')?.addEventListener('click', async () => {
  await fetch('/api/admin/login', { method: 'DELETE' });
  location.href = '/admin/';
});
