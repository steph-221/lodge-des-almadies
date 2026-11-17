import { api } from '../api';
import { h } from '../dom';

const box = document.getElementById('secret-box')!;
const msg = document.getElementById('team-msg')!;

function showSecret(title: string, who: string, secret: string) {
  box.textContent = '';
  box.appendChild(
    h('div', { class: 'secret', role: 'status' },
      h('strong', {}, title),
      h('p', {}, `Compte : ${who}. Communiquez ce code à la personne maintenant : il ne sera plus affiché.`),
      h('p', {}, h('code', {}, secret)),
      h('button', { class: 'sm', type: 'button', onclick: () => location.reload() }, 'J’ai noté le code, continuer'),
    ),
  );
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('staff-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  const fd = new FormData(f);
  msg.textContent = '';
  const r = await api<{ staff: { displayName: string; login: string }; secret: string }>('POST', '/api/hotel/staff', {
    login: fd.get('login'), displayName: fd.get('displayName'), role: fd.get('role'),
  });
  if (!r.ok) { msg.textContent = r.data.error || 'Création impossible.'; msg.className = 'err'; return; }
  f.reset();
  showSecret('Compte créé', `${r.data.staff.displayName} (${r.data.staff.login})`, r.data.secret);
});

document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((b) => {
  b.addEventListener('click', async () => {
    const { id, action, name } = b.dataset;
    if (action === 'deactivate' && !confirm(`Désactiver le compte de ${name} ? Ses sessions ouvertes seront fermées.`)) return;
    if (action === 'reset' && !confirm(`Générer un nouveau code pour ${name} ? L’ancien cessera de fonctionner.`)) return;
    b.disabled = true;
    const r = await api<{ secret?: string }>('PATCH', `/api/hotel/staff/${id}`, { action });
    b.disabled = false;
    if (!r.ok) { msg.textContent = r.data.error || 'Action impossible.'; msg.className = 'err'; return; }
    if (r.data.secret) showSecret('Nouveau code', name ?? '', r.data.secret);
    else location.reload();
  });
});
