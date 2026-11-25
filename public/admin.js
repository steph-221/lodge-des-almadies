/* Interface d'administration : prix, textes et photos de toutes les pages. */
(function () {
  'use strict';
  var c = null;           // contenu en cours d'édition
  var tab = 'home';
  var dirty = false;
  var $ = function (id) { return document.getElementById(id); };
  var msg = function (t, cls) { var m = $('msg'); m.textContent = t; m.className = cls || ''; };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    });
    (function add(list) {
      list.forEach(function (ch) {
        if (ch == null || ch === false) return;
        if (Array.isArray(ch)) return add(ch);
        el.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
      });
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }
  var touch = function () { dirty = true; msg('Modifications non enregistrées', ''); };
  var imgSrc = function (s) { return /^(https?:)?\/\//.test(s) || s.charAt(0) === '/' ? s : '/img/' + s + '.jpg'; };
  var fmt = function (n) { return Math.round(n).toLocaleString('fr-FR'); };

  /* ---------- champs ---------- */
  function field(label, obj, key, opts) {
    opts = opts || {};
    var input = opts.area
      ? h('textarea', { rows: opts.rows || 3 })
      : h('input', { type: opts.type || 'text' });
    input.value = obj[key] == null ? '' : obj[key];
    input.addEventListener('input', function () {
      obj[key] = opts.type === 'number' ? Number(input.value) : input.value;
      if (opts.onchange) opts.onchange();
      touch();
    });
    return h('label', {}, label, input, opts.hint ? h('span', { class: 'hint' }, opts.hint) : null);
  }
  function check(label, obj, key) {
    var i = h('input', { type: 'checkbox' });
    i.checked = !!obj[key];
    i.addEventListener('change', function () { obj[key] = i.checked; touch(); });
    return h('label', {}, h('span', {}, i, ' ' + label));
  }
  function price(label, obj, key) {
    var eur = h('span', { class: 'eur' });
    var upd = function () { eur.textContent = '≈ ' + fmt(obj[key] / c.rate) + ' €'; };
    upd();
    var f = field(label + ' (FCFA)', obj, key, { type: 'number', onchange: upd });
    f.appendChild(eur);
    return f;
  }

  /* ---------- images ---------- */
  // Réduit l'image dans le navigateur (max 1920 px, JPEG) avant l'envoi.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var s = Math.min(1, 1920 / Math.max(im.width, im.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? resolve(new File([b], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })) : reject(new Error('Image illisible')); }, 'image/jpeg', 0.85);
      };
      im.onerror = function () { reject(new Error('Image illisible')); };
      im.src = url;
    });
  }
  async function upload(file) {
    var small = await shrink(file);
    var fd = new FormData(); fd.append('file', small);
    var r = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || 'Envoi impossible');
    return j.src;
  }
  function pickFiles(multiple, cb) {
    var i = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: multiple });
    i.addEventListener('change', async function () {
      msg('Envoi des photos…', '');
      try {
        for (var k = 0; k < i.files.length; k++) cb(await upload(i.files[k]));
        msg('Photos envoyées. Pensez à enregistrer.', 'ok'); touch();
      } catch (e) { msg(e.message, 'err'); }
    });
    i.click();
  }

  // Photo unique (bandeau, tuile…)
  function imageField(label, obj, key) {
    var im = h('img', { src: imgSrc(obj[key] || 'logo'), alt: '', style: 'width:120px;aspect-ratio:4/3;object-fit:cover;border-radius:8px' });
    var btn = h('button', { class: 'sm', type: 'button', onclick: function () {
      pickFiles(false, function (src) { obj[key] = src; im.src = imgSrc(src); });
    } }, 'Changer la photo');
    return h('div', { style: 'margin:10px 0' }, h('div', { style: 'font-size:.88rem;font-weight:600' }, label), h('div', { style: 'display:flex;gap:12px;align-items:center' }, im, btn));
  }

  // Liste de photos : ajout, suppression, ordre (glisser-déposer ou flèches), texte alternatif pour la galerie.
  // items : tableau de chaînes, ou d'objets { src, alt } si withAlt.
  function photoList(label, arr, withAlt, fromGallery) {
    var wrap = h('div', {});
    var grid = h('div', { class: 'photos' });
    var from = null;
    function move(i, j) { if (j < 0 || j >= arr.length) return; var x = arr.splice(i, 1)[0]; arr.splice(j, 0, x); touch(); draw(); }
    function draw() {
      grid.textContent = '';
      arr.forEach(function (it, i) {
        var src = withAlt ? it.src : it;
        var card = h('div', { class: 'photo', draggable: 'true' },
          h('img', { src: imgSrc(src), alt: '', loading: 'lazy' }),
          withAlt ? (function () { var a = h('input', { value: it.alt || '', placeholder: 'Description' }); a.addEventListener('input', function () { it.alt = a.value; touch(); }); return a; })() : null,
          h('div', { class: 'acts' },
            h('button', { class: 'sm', type: 'button', title: 'Avant', onclick: function () { move(i, i - 1); } }, '←'),
            h('button', { class: 'sm', type: 'button', title: 'Après', onclick: function () { move(i, i + 1); } }, '→'),
            h('button', { class: 'sm danger', type: 'button', onclick: function () { arr.splice(i, 1); touch(); draw(); } }, 'Retirer')));
        card.addEventListener('dragstart', function () { from = i; });
        card.addEventListener('dragover', function (e) { e.preventDefault(); card.classList.add('drag'); });
        card.addEventListener('dragleave', function () { card.classList.remove('drag'); });
        card.addEventListener('drop', function (e) { e.preventDefault(); if (from != null) move(from, i); from = null; });
        grid.appendChild(card);
      });
    }
    draw();
    wrap.appendChild(h('h3', {}, label));
    wrap.appendChild(grid);
    wrap.appendChild(h('button', { class: 'sm', type: 'button', onclick: function () {
      pickFiles(true, function (src) { arr.push(withAlt ? { src: src, alt: 'Le Lodge des Almadies' } : src); draw(); });
    } }, '+ Ajouter des photos'));
    if (fromGallery) {
      var panel = h('div', { class: 'photos', hidden: true });
      c.gallery.forEach(function (g) {
        panel.appendChild(h('img', { src: imgSrc(g.src), alt: g.alt, title: 'Ajouter', style: 'cursor:pointer;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px', onclick: function () { arr.push(g.src); touch(); draw(); } }));
      });
      wrap.appendChild(document.createTextNode(' '));
      wrap.appendChild(h('button', { class: 'sm', type: 'button', onclick: function () { panel.hidden = !panel.hidden; } }, '+ Choisir dans la galerie'));
      wrap.appendChild(panel);
    }
    return wrap;
  }

  /* ---------- listes d'éléments ---------- */
  function stringList(label, arr) {
    var box = h('div', {});
    function draw() {
      box.textContent = '';
      arr.forEach(function (v, i) {
        var inp = h('input', { value: v });
        inp.addEventListener('input', function () { arr[i] = inp.value; touch(); });
        box.appendChild(h('div', { style: 'display:flex;gap:6px;margin:4px 0' }, inp,
          h('button', { class: 'sm danger', type: 'button', onclick: function () { arr.splice(i, 1); touch(); draw(); } }, '×')));
      });
      box.appendChild(h('button', { class: 'sm', type: 'button', onclick: function () { arr.push(''); touch(); draw(); } }, '+ Ajouter'));
    }
    draw();
    return h('div', {}, h('h3', {}, label), box);
  }
  function objList(label, arr, blank, render) {
    var box = h('div', {});
    function draw() {
      box.textContent = '';
      arr.forEach(function (it, i) {
        box.appendChild(h('div', { class: 'item' }, render(it, i),
          h('button', { class: 'sm danger', type: 'button', onclick: function () { arr.splice(i, 1); touch(); draw(); } }, 'Supprimer')));
      });
      box.appendChild(h('button', { class: 'sm', type: 'button', onclick: function () { arr.push(JSON.parse(JSON.stringify(blank))); touch(); draw(); } }, '+ Ajouter'));
    }
    draw();
    return h('div', {}, h('h3', {}, label), box);
  }

  /* ---------- sections ---------- */
  var tabs = {
    home: ['Accueil', function () {
      var x = c.home;
      return h('div', {},
        h('div', { class: 'card' }, h('h2', {}, 'Bandeau d’accueil'),
          field('Titre', x, 'title'), field('Sous-titre', x, 'subtitle'),
          photoList('Carrousel (défile sur la page d’accueil ; la 1re photo s’affiche en premier)', x.carousel, false, true)),
        h('div', { class: 'card' }, h('h2', {}, 'Bienvenue'), field('Titre', x, 'welcomeTitle'), field('Texte', x, 'welcomeText', { area: true })),
        h('div', { class: 'card' }, h('h2', {}, 'Nos services'), objList('Services mis en avant (3 recommandés)', x.services, { title: '', img: 'hotel', text: '', href: '/' }, function (t) {
          return h('div', {}, field('Titre', t, 'title'), field('Texte', t, 'text', { area: true }), field('Lien', t, 'href'), imageField('Photo', t, 'img'));
        })));
    }],
    hotel: ['L’hôtel', function () {
      var x = c.hotel;
      return h('div', {},
        h('div', { class: 'card' }, imageField('Photo du bandeau', x, 'heroImage'), field('Présentation', x, 'intro', { area: true, rows: 5 }), stringList('Points forts', x.items)),
        h('div', { class: 'card' }, objList('Restaurant, boutiques…', x.cards, { title: '', img: 'hotel', text: '' }, function (t) {
          return h('div', {}, field('Titre', t, 'title'), field('Texte', t, 'text', { area: true }), imageField('Photo', t, 'img'));
        })),
        h('div', { class: 'card' }, objList('Emplacement', x.location, { time: '', to: '' }, function (t) {
          return h('div', { class: 'row' }, field('Durée', t, 'time'), field('Jusqu’à', t, 'to'));
        })));
    }],
    rooms: ['Chambres', function () {
      return h('div', {}, c.rooms.map(function (r) {
        return h('div', { class: 'card' }, h('h2', {}, r.name),
          field('Nom', r, 'name'), field('Description', r, 'intro', { area: true, rows: 4 }),
          h('div', { class: 'row' }, field('Personnes', r, 'guests'), field('Lit', r, 'beds')),
          objList('Tarifs par nuit', r.prices, { label: '', fcfa: 0 }, function (p) {
            return h('div', { class: 'row' }, field('Libellé', p, 'label'), price('Prix', p, 'fcfa'));
          }),
          stringList('Équipements', r.equipment),
          photoList('Photos (la 1re sert de bandeau)', r.images));
      }));
    }],
    tarifs: ['Tarifs publics', function () {
      var t = c.tarifs;
      return h('div', {},
        h('div', { class: 'card' }, h('h2', {}, 'Page Tarifs publics'),
          imageField('Photo du bandeau', t, 'heroImage'), field('Introduction', t, 'intro', { area: true }), price('Taxe de séjour (par nuit et par personne)', t, 'taxeSejour')),
        h('div', { class: 'card' }, objList('Hébergement (tarif TTC par chambre et par nuit)', t.rooms, { name: '', building: 'A', view: '', count: 1, fcfa: 0 }, function (r) {
          return h('div', { class: 'row' }, field('Type de chambre', r, 'name'), field('Bâtiment', r, 'building'), field('Vue', r, 'view'), field('Nombre', r, 'count', { type: 'number' }), price('Tarif TTC', r, 'fcfa'));
        })),
        h('div', { class: 'card' }, stringList('Services et équipements en chambre', t.equipements)),
        h('div', { class: 'card' }, objList('Restauration', t.restauration, { label: '', fcfa: 0, detail: '' }, function (r) {
          return h('div', { class: 'row' }, field('Libellé', r, 'label'), price('Prix', r, 'fcfa'), field('Détail', r, 'detail'));
        }), field('Note restaurant et bar', t, 'restaurationNote', { area: true })),
        h('div', { class: 'card' }, objList('Informations complémentaires', t.infos, { subject: '', detail: '' }, function (i) {
          return h('div', { class: 'row' }, field('Sujet', i, 'subject'), field('Détail', i, 'detail'));
        }), h('p', { class: 'hint' }, 'Le taux de change se règle dans Réglages.')));
    }],
    tarifsSem: ['Tarifs séminaire', function () {
      var t = c.tarifs;
      return h('div', {},
        h('div', { class: 'card' }, h('h2', {}, 'Page Tarifs séminaire'),
          imageField('Photo du bandeau', t, 'seminaireHeroImage'), field('Introduction', t, 'seminaireIntro', { area: true }),
          objList('Caractéristiques de la salle', t.seminaireInfo, { label: '', value: '' }, function (i) {
            return h('div', { class: 'row' }, field('Libellé', i, 'label'), field('Valeur', i, 'value'));
          })),
        h('div', { class: 'card' }, objList('Tarifs (1re ligne : salle par jour, 2e : pause-café, utilisées aussi sur la page Séminaires)', t.seminaire, { label: '', fcfa: 0, detail: '' }, function (r) {
          return h('div', { class: 'row' }, field('Libellé', r, 'label'), price('Prix', r, 'fcfa'), field('Détail', r, 'detail'));
        })),
        h('div', { class: 'card' }, h('h2', {}, 'Exemple de budget'), field('Titre', t.budgetExample, 'title'),
          objList('Lignes (le total est calculé)', t.budgetExample.lines, { label: '', fcfa: 0 }, function (l) {
            return h('div', { class: 'row' }, field('Libellé', l, 'label'), price('Montant', l, 'fcfa'));
          }), field('Note', t.budgetExample, 'note')));
    }],
    services: ['Services', function () {
      var x = c.services;
      return h('div', { class: 'card' }, imageField('Photo du bandeau', x, 'heroImage'), field('Introduction', x, 'intro', { area: true }),
        objList('Services', x.items, { title: '', img: 'hotel', text: '', href: '/' }, function (t) {
          return h('div', {}, field('Titre', t, 'title'), field('Texte', t, 'text', { area: true }), field('Lien', t, 'href'), imageField('Photo', t, 'img'));
        }));
    }],
    restaurant: ['Restaurant', function () {
      var r = c.restaurant;
      return h('div', {},
        h('div', { class: 'card' }, h('h2', {}, 'L’ENVERS'), imageField('Photo du bandeau', r, 'heroImage'), field('Présentation', r, 'intro', { area: true }),
          field('Horaires', r, 'hours', { area: true }), field('Téléphone du restaurant', r, 'phone'), field('Note sous les horaires (menu du jour, formules…)', r, 'menuNote', { area: true }),
          objList('Lignes internes (ex. cuisine, bar, réservation)', r.internalLines, { label: '', phone: '' }, function (l) {
            return h('div', { class: 'row' }, field('Libellé', l, 'label'), field('Numéro', l, 'phone'));
          }),
          photoList('Photos du restaurant', r.images)),
        h('div', { class: 'card' }, h('h2', {}, 'Menus'),
          h('p', { class: 'hint' }, 'Deux façons de présenter le menu : le saisir ci-dessous (rubriques et plats), et/ou ajouter des photos ou scans du menu.'),
          objList('Rubriques du menu', r.menu, { title: '', items: [] }, function (sec) {
            return h('div', {}, field('Titre de la rubrique', sec, 'title'),
              objList('Plats', sec.items, { name: '', desc: '', fcfa: 0 }, function (it) {
                return h('div', { class: 'row' }, field('Plat', it, 'name'), field('Description', it, 'desc'), price('Prix', it, 'fcfa'));
              }));
          }),
          photoList('Photos / scans du menu', r.menuImages)));
    }],
    boutiques: ['Boutiques', function () {
      var b = c.boutiques;
      return h('div', { class: 'card' }, imageField('Photo du bandeau', b, 'heroImage'), field('Introduction', b, 'intro', { area: true }),
        objList('Boutiques', b.items, { name: '', text: '', phone: '', images: [] }, function (it) {
          return h('div', {}, field('Nom', it, 'name'), field('Description', it, 'text', { area: true }), field('Téléphone', it, 'phone'), photoList('Photos', it.images));
        }));
    }],
    seminaire: ['Séminaire', function () {
      var s = c.seminaire;
      return h('div', { class: 'card' }, imageField('Photo du bandeau', s, 'heroImage'), field('Introduction', s, 'intro', { area: true }),
        field('Caractéristiques de la salle', s, 'capacity'), stringList('Équipements', s.equipment), stringList('Services (en supplément)', s.services),
        photoList('Photos de la salle', s.images),
        h('p', { class: 'hint' }, 'Les prix (salle, pause-café) se modifient dans l’onglet Tarifs.'));
    }],
    gallery: ['Galerie', function () {
      var p = c.pageHeroes;
      return h('div', { class: 'card' }, imageField('Photo du bandeau de la galerie', p, 'galerie'),
        photoList('Photos de la galerie', c.gallery, true));
    }],
    faq: ['FAQ', function () {
      return h('div', { class: 'card' }, imageField('Photo du bandeau', c.pageHeroes, 'faq'),
        objList('Questions', c.faq, { q: '', a: '' }, function (f) { return h('div', {}, field('Question', f, 'q'), field('Réponse', f, 'a', { area: true })); }));
    }],
    settings: ['Réglages', function () {
      var s = c.site;
      return h('div', {},
        h('div', { class: 'card' }, h('h2', {}, 'Coordonnées'),
          field('Adresse', s, 'address'), h('div', { class: 'row' }, field('Téléphone', s, 'phone'), field('Téléphone (format international)', s, 'phoneHref', { hint: 'ex. +221338690345' })),
          field('E-mail de réception des demandes', s, 'email'), field('Téléphone direct du restaurant', s, 'restaurantPhone'),
          imageField('Photo du bandeau de la page contact', c.pageHeroes, 'contact')),
        h('div', { class: 'card' }, h('h2', {}, 'Réservation Octorate'),
          h('p', { class: 'hint' }, 'Tant que la case est décochée, les boutons « Réserver » mènent au formulaire de contact. Renseigner ici le lien du moteur de réservation fourni par Octorate (https://…).'),
          check('Activer le bouton Réserver vers Octorate', c.booking, 'enabled'), field('Lien de réservation Octorate', c.booking, 'url', { type: 'url' })),
        h('div', { class: 'card' }, h('h2', {}, 'Devise'), field('1 € = … FCFA', c, 'rate', { type: 'number', hint: 'Sert à calculer les montants en euros affichés sur le site.' })),
        h('div', { class: 'card' }, objList('Menu de navigation (le bouton Réserver est ajouté automatiquement)', c.nav, { href: '/', label: '', children: [] }, function (n) {
          n.children = n.children || [];
          return h('div', {}, h('div', { class: 'row' }, field('Libellé', n, 'label'), field('Lien', n, 'href')),
            objList('Sous-menu déroulant (facultatif)', n.children, { href: '/', label: '' }, function (m) {
              return h('div', { class: 'row' }, field('Libellé', m, 'label'), field('Lien', m, 'href'));
            }));
        })));
    }]
  };

  function render() {
    var nav = $('tabs'); nav.textContent = '';
    Object.keys(tabs).forEach(function (k) {
      nav.appendChild(h('button', { type: 'button', 'aria-current': String(k === tab), onclick: function () { tab = k; render(); } }, tabs[k][0]));
    });
    var v = $('view'); v.textContent = '';
    v.appendChild(tabs[tab][1]());
  }

  async function save() {
    $('save').disabled = true; msg('Enregistrement…', '');
    try {
      var r = await fetch('/api/admin/content', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || 'Erreur');
      dirty = false; msg('Enregistré. Les pages se mettent à jour en moins d’une minute.', 'ok');
    } catch (e) { msg(e.message, 'err'); }
    $('save').disabled = false;
  }

  async function init() {
    // La déconnexion est branchée en premier : elle doit marcher même si le chargement du contenu échoue.
    $('logout').addEventListener('click', async function () {
      try {
        var res = await fetch('/api/admin/login', { method: 'DELETE' });
        // On vérifie que la session est bien fermée avant de quitter la page, et on affiche la cause sinon.
        var chk = await fetch('/api/admin/content');
        if (chk.status !== 401) { msg('Déconnexion impossible (code ' + res.status + ', session ' + chk.status + '). Fermez le navigateur ou contactez l’assistance.', 'err'); return; }
      } catch (e) { msg('Déconnexion impossible : ' + e.message, 'err'); return; }
      location.href = '/admin/';
    });
    var r = await fetch('/api/admin/content');
    if (r.status === 401) return location.reload();
    c = await r.json();
    render();
    $('save').addEventListener('click', save);
    $('reset').addEventListener('click', async function () {
      if (!confirm('Remplacer tout le contenu par celui d’origine ? Vos modifications seront perdues.')) return;
      await fetch('/api/admin/content', { method: 'DELETE' });
      location.reload();
    });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  init();
})();
