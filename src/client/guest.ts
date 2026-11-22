// Page cliente : envoi d'une demande. Aucune donnée personnelle, le jeton de la chambre est dans l'adresse de la page.
const app = document.getElementById('g-app');
if (app) {
  const token = app.dataset.token ?? '';
  const lang = app.dataset.lang === 'en' ? 'en' : 'fr';
  const msg = document.getElementById('g-msg')!;
  const hp = document.getElementById('g-hp') as HTMLInputElement;
  const say = (text: string, ok: boolean) => { msg.textContent = text; msg.className = 'g-msg ' + (ok ? 'g-ok' : 'g-err'); };
  const net = lang === 'en' ? 'Network problem. Please try again or call the front desk.' : 'Problème de réseau. Réessayez ou appelez la réception.';

  app.querySelectorAll<HTMLFormElement>('form.g-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button')!;
      btn.disabled = true;
      try {
        const fd = new FormData(form);
        const r = await fetch('/api/guest/request', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, lang, catalogId: Number(form.dataset.id), qty: fd.get('qty'), note: fd.get('note'), website: hp.value }),
        });
        const d = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        if (r.ok) {
          say(d.message ?? 'OK', true);
          form.reset();
          // La liste « Vos demandes » se met à jour au rechargement.
          setTimeout(() => location.reload(), 1800);
        } else say(d.error ?? net, false);
      } catch {
        say(net, false);
      } finally {
        btn.disabled = false;
      }
    });
  });
}
