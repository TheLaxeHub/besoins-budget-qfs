/*
 * Expression des besoins — Budget 2027 : interface (connexion, tableau de bord,
 * saisie des besoins par les sites, validation par le Back Office).
 */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const Store = window.Store;
  const BO = C.BACK_OFFICE;

  // Couleurs reprises du thème Flowbite d'iris.
  const STATUTS = {
    EN_ATTENTE: { libelle: 'En attente', pluriel: 'En attente', badge: 'becp', couleur: '#ea580c' },
    VALIDE: { libelle: 'Validé', pluriel: 'Validés', badge: 'bter', couleur: '#047857' },
    REJETE: { libelle: 'Rejeté', pluriel: 'Rejetés', badge: 'brej', couleur: '#be123c' },
  };
  const ORDRE_STATUTS = ['EN_ATTENTE', 'VALIDE', 'REJETE'];
  const CATS = C.CATEGORIES;
  const AUTRE = '__autre__';
  const PAR_PAGE = 100;
  const CLE_SESSION = 'bud27_session';
  const FILTRES_DEFAUT = { periode: 'tout', du: '', au: '', site: '', cat: '', type: '', statut: '', q: '', tri: 'recent' };

  const S = {
    session: null,
    besoins: [],
    filtres: Object.assign({}, FILTRES_DEFAUT),
    artCat: '',
    limite: PAR_PAGE,
    lignesTable: [],
    selection: {},
    charts: {},
    ouvert: null,
    minuteur: null,
    synchro: null,
    panier: [],
  };

  /* ================= Utilitaires ================= */

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  const esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const nf = new Intl.NumberFormat('fr-FR');
  const nombre = function (n) { return nf.format(Math.round(Number(n) || 0)); };
  const p2 = function (n) { return String(n).padStart(2, '0'); };
  const date = function (v) { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d; };
  const fDate = function (v) { const d = date(v); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; };
  const fHeure = function (v) { const d = date(v); return d ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : ''; };
  const fDateHeure = function (v) { const d = date(v); return d ? fDate(d) + ' ' + fHeure(d) : '—'; };
  const joursDepuis = function (v) { const d = date(v); return d ? (Date.now() - d) / 864e5 : 0; };
  const sansAccents = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  const estBO = function () { return S.session && S.session.isBO; };
  const parId = function (id) { return S.besoins.find(function (b) { return b.id === id; }); };
  const cat = function (code) { return CATS.find(function (c) { return c.code === code; }) || { code: code, libelle: code, ico: 'package', couleur: '#6b7280', articles: [] }; };
  const qteRetenue = function (b) { return b.statut === 'VALIDE' ? Number(b.quantite_validee) || 0 : b.statut === 'REJETE' ? 0 : Number(b.quantite) || 0; };
  const nomCourt = function (site) { return String(site).replace(/^CGI /, ''); };
  const somme = function (l, f) { return l.reduce(function (s, x) { return s + (Number(f(x)) || 0); }, 0); };

  const badgeStatut = function (s) {
    const d = STATUTS[s] || STATUTS.EN_ATTENTE;
    return '<span class="badge ' + d.badge + '">' + d.libelle + '</span>';
  };
  const badgeCat = function (code) {
    const c = cat(code);
    return '<span class="cat-b" style="color:' + c.couleur + '">' + ico(c.ico) + esc(c.libelle) + '</span>';
  };

  const ico = function (nom) { return '<i data-lucide="' + nom + '"></i>'; };
  function icones() { if (window.lucide) window.lucide.createIcons(); }

  let toastTimer = null;
  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast on ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, type === 'err' ? 5000 : 3000);
  }
  function chargement(on) { $('#loader').hidden = !on; }

  const memoire = {
    lire: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mode privé */ } },
    effacer: function (k) { try { localStorage.removeItem(k); } catch (e) { /* mode privé */ } },
  };
  const clePanier = function () { return 'bud27_panier_' + S.session.profil; };
  const cleNom = function () { return 'bud27_nom_' + S.session.profil; };
  const cleService = function () { return 'bud27_service_' + S.session.profil; };

  /* ================= Connexion ================= */

  let profilChoisi = null;

  function initConnexion() {
    $$('[data-cfg]').forEach(function (el) { el.textContent = C[el.dataset.cfg] || ''; });
    document.title = C.APP_TITRE + ' — QFS';
    $('#lgDemo').hidden = !Store.demo;
    dessinerGrille('');
    icones();
    $('#lgSearch').addEventListener('input', function (e) { dessinerGrille(e.target.value); });
    $('#lgSearch').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const premier = $('#lgGrid .lg-pdv');
      if (premier) premier.click();
    });
    $('#lgGrid').addEventListener('click', function (e) {
      const b = e.target.closest('[data-site]');
      if (b) choisirProfil(b.dataset.site);
    });
    $('#lgBo').addEventListener('click', function () { choisirProfil(BO); });
    $('#lgBack').addEventListener('click', function () { etapeConnexion(1); });
    $('#lgStep2').addEventListener('submit', function (e) {
      e.preventDefault();
      connecter(profilChoisi, $('#lgCode').value.trim());
    });
  }

  function dessinerGrille(q) {
    const n = sansAccents(q).trim();
    const sites = C.SITES.filter(function (p) { return !n || sansAccents(p).includes(n); });
    $('#lgGrid').innerHTML = sites.length
      ? sites.map(function (p) {
        const court = nomCourt(p);
        return '<button type="button" class="lg-pdv" data-site="' + esc(p) + '"><span class="lg-pin">' + esc(court.charAt(0)) + '</span>' + esc(p) + '</button>';
      }).join('')
      : '<div class="lg-none">Aucun site ne correspond.</div>';
  }

  function etapeConnexion(n) {
    $('#lgStep1').hidden = n !== 1;
    $('#lgStep2').hidden = n !== 2;
    $('#lgErr').textContent = '';
    if (n === 2) {
      $('#lgWho').textContent = profilChoisi === BO ? 'Back Office' : profilChoisi;
      $('#lgCode').value = '';
      setTimeout(function () { $('#lgCode').focus(); }, 50);
    }
  }

  function choisirProfil(profil) {
    profilChoisi = profil;
    connecter(profil, '');
  }

  async function connecter(profil, code, silencieux) {
    chargement(true);
    $('#lgErr').textContent = '';
    try {
      const r = await Store.login({ profil: profil, code: code });
      demarrerSession({ profil: r.profil || profil, code: code, isBO: (r.profil || profil) === BO });
    } catch (err) {
      if (silencieux) { afficherConnexion(); return; }
      if (err.code === 'CODE_REQUIS') {
        etapeConnexion(2);
      } else {
        if (err.code === 'CODE_INVALIDE') etapeConnexion(2);
        $('#lgErr').textContent = err.message;
      }
    } finally {
      chargement(false);
    }
  }

  function afficherConnexion() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    document.body.className = '';
    etapeConnexion(1);
    $('#lgSearch').value = '';
    dessinerGrille('');
  }

  function demarrerSession(sess) {
    S.session = sess;
    memoire.ecrire(CLE_SESSION, { profil: sess.profil, code: sess.code });
    document.body.className = sess.isBO ? 'is-bo' : 'is-pdv';
    S.panier = sess.isBO ? [] : (memoire.lire(clePanier()) || []);
    $('#login').hidden = true;
    $('#app').hidden = false;
    initApp();
    actualiser();
    clearInterval(S.minuteur);
    if (!Store.demo && C.ACTUALISATION_SECONDES > 0) {
      S.minuteur = setInterval(function () {
        if (!document.hidden && $('#mNew').hidden && !S.ouvert) actualiser(true);
      }, C.ACTUALISATION_SECONDES * 1000);
    }
  }

  function deconnecter(message) {
    clearInterval(S.minuteur);
    fermerSaisie();
    memoire.effacer(CLE_SESSION);
    fermerPanneau();
    S.session = null;
    S.besoins = [];
    S.selection = {};
    S.filtres = Object.assign({}, FILTRES_DEFAUT);
    afficherConnexion();
    window.scrollTo(0, 0);
    toast(message || 'Vous êtes déconnecté.', message ? 'err' : 'ok');
  }

  /* ================= Application ================= */

  let appInitialisee = false;

  function initApp() {
    const bo = estBO();
    $('#sbAv').textContent = bo ? 'BO' : nomCourt(S.session.profil).charAt(0);
    $('#sbAv').className = 'sb-av' + (bo ? ' bo' : '');
    $('#sbName').textContent = bo ? 'Back Office' : S.session.profil;
    $('#sbRole').textContent = bo ? 'Validation des ' + C.SITES.length + ' sites' : 'Site de déploiement';
    $('#sbReg').textContent = bo ? 'Registre des besoins' : 'Mes besoins';
    $('#bcWho').textContent = bo ? 'Back Office' : S.session.profil;
    $('#pgIco').innerHTML = ico(bo ? 'shield-check' : 'building-2');
    $('#pgEyebrow').textContent = bo ? 'E-Money · Back Office' : 'E-Money · Site ' + S.session.profil;
    $('#regTitle').textContent = bo ? 'Registre des besoins — tous les sites' : 'Mes besoins';
    $('#ftText').textContent = 'Quipux Financial Services — ' + C.APP_TITRE + ' · ' + new Date().getFullYear();
    $('#tbDemo').hidden = !Store.demo;
    rendreDateLimite();
    majCompteurPanier();
    icones();

    $('#fSite').innerHTML = '<option value="">Tous les sites</option>' +
      C.SITES.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
    $('#fCat').innerHTML = '<option value="">Toutes</option>' +
      CATS.map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.libelle) + '</option>'; }).join('');
    $('#fType').innerHTML = '<option value="">Tous</option>' +
      C.TYPES_BESOIN.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    synchroniserFiltres();

    if (appInitialisee) return;
    appInitialisee = true;

    const surFiltre = function () { S.limite = PAR_PAGE; rendre(); };
    $('#fPeriode').addEventListener('change', function (e) {
      S.filtres.periode = e.target.value;
      $('#fDates').hidden = e.target.value !== 'perso';
      surFiltre();
    });
    $('#fDu').addEventListener('change', function (e) { S.filtres.du = e.target.value; surFiltre(); });
    $('#fAu').addEventListener('change', function (e) { S.filtres.au = e.target.value; surFiltre(); });
    $('#fSite').addEventListener('change', function (e) { S.filtres.site = e.target.value; surFiltre(); });
    $('#fCat').addEventListener('change', function (e) { S.filtres.cat = e.target.value; surFiltre(); });
    $('#fType').addEventListener('change', function (e) { S.filtres.type = e.target.value; surFiltre(); });
    $('#fReset').addEventListener('click', function () {
      S.filtres = Object.assign({}, FILTRES_DEFAUT);
      synchroniserFiltres();
      surFiltre();
    });
    $('#srch').addEventListener('input', function (e) { S.filtres.q = e.target.value; S.limite = PAR_PAGE; rendreTable(filtrer()); });
    $('#tri').addEventListener('change', function (e) { S.filtres.tri = e.target.value; rendreTable(filtrer()); });
    $('#chips').addEventListener('click', function (e) {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      S.filtres.statut = b.dataset.s;
      S.limite = PAR_PAGE;
      rendreTable(filtrer());
    });
    $('#artChips').addEventListener('click', function (e) {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      S.artCat = b.dataset.c;
      rendreArticles(filtrer());
    });
    $('#btnMore').addEventListener('click', function () { S.limite += PAR_PAGE; rendreTable(filtrer()); });
    $('#tbody').addEventListener('click', function (e) {
      if (e.target.closest('.ck')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr) ouvrirPanneau(tr.dataset.id);
    });
    $('#tbody').addEventListener('change', function (e) {
      const ck = e.target.closest('input[data-ck]');
      if (!ck) return;
      if (ck.checked) S.selection[ck.dataset.ck] = true; else delete S.selection[ck.dataset.ck];
      ck.closest('tr').classList.toggle('sel', ck.checked);
      majSelection();
    });
    $('#ckAll').addEventListener('change', function (e) {
      const coche = e.target.checked;
      S.lignesTable.slice(0, S.limite).forEach(function (b) {
        if (b.statut !== 'EN_ATTENTE') return;
        if (coche) S.selection[b.id] = true; else delete S.selection[b.id];
      });
      rendreTable(filtrer());
    });
    $('#bulkOk').addEventListener('click', function () { ouvrirDecisionGroupee('VALIDE'); });
    $('#bulkKo').addEventListener('click', function () { ouvrirDecisionGroupee('REJETE'); });
    $('#bulkClear').addEventListener('click', function () { S.selection = {}; rendreTable(filtrer()); });
    $('#tSynth tbody').addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-site]');
      if (!tr) return;
      S.filtres.site = tr.dataset.site;
      $('#fSite').value = tr.dataset.site;
      surFiltre();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('Filtre appliqué : ' + tr.dataset.site);
    });
    $('#tArt tbody').addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-lib]');
      if (!tr) return;
      S.filtres.q = tr.dataset.lib;
      $('#srch').value = tr.dataset.lib;
      S.limite = PAR_PAGE;
      rendreTable(filtrer());
      document.getElementById('sec-reg').scrollIntoView({ behavior: 'smooth' });
    });
    $('#alerts').addEventListener('click', function (e) {
      const c = e.target.closest('[data-id]');
      if (c) { ouvrirPanneau(c.dataset.id); return; }
      const s = e.target.closest('[data-site-vide]');
      if (s) toast(s.dataset.siteVide + " n'a encore exprimé aucun besoin.");
    });

    $('#btnNew').addEventListener('click', ouvrirSaisie);
    $('#sbNew').addEventListener('click', function () { menu(false); ouvrirSaisie(); });
    $('#sbToggle').addEventListener('click', function () { menu(!document.body.classList.contains('sb-open')); });
    $('#sbOv').addEventListener('click', function () { menu(false); });
    $('#sbNav').addEventListener('click', function (e) {
      const a = e.target.closest('a.sb-a');
      if (!a) return;
      $$('#sbNav .sb-a').forEach(function (x) { x.classList.toggle('on', x === a); });
      menu(false);
    });
    $('#btnRefresh').addEventListener('click', function () { actualiser(); });
    $('#btnXlsx').addEventListener('click', exporterExcel);
    $('#btnPrint').addEventListener('click', function () { window.print(); });
    $('#btnLogout').addEventListener('click', function () { deconnecter(); });

    $('#ov').addEventListener('click', fermerPanneau);
    $('#pClose').addEventListener('click', fermerPanneau);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('#mNew').hidden) fermerSaisie();
      else fermerPanneau();
    });
    initSaisie();
  }

  function menu(ouvert) { document.body.classList.toggle('sb-open', ouvert); }

  function rendreDateLimite() {
    const b = $('#dlBanner');
    const d = C.DATE_LIMITE ? new Date(C.DATE_LIMITE + 'T23:59:59') : null;
    if (!d || isNaN(d) || estBO()) { b.hidden = true; return; }
    const j = Math.ceil((d - Date.now()) / 864e5);
    b.hidden = false;
    b.className = 'dl-banner pdv-only' + (j < 0 ? ' late' : '');
    b.innerHTML = ico(j < 0 ? 'alarm-clock-off' : 'calendar-clock') + '<span>' + (j < 0
      ? 'La date limite de saisie (' + fDate(d) + ') est dépassée. Contactez le Back Office pour tout besoin urgent.'
      : 'Date limite de saisie des besoins ' + esc(C.CAMPAGNE) + ' : <b>' + fDate(d) + '</b> — ' + (j === 0 ? "c'est aujourd'hui" : 'encore ' + j + ' jour(s)') + '.') + '</span>';
  }

  function synchroniserFiltres() {
    const f = S.filtres;
    $('#fPeriode').value = f.periode;
    $('#fDates').hidden = f.periode !== 'perso';
    $('#fDu').value = f.du;
    $('#fAu').value = f.au;
    $('#fSite').value = f.site;
    $('#fCat').value = f.cat;
    $('#fType').value = f.type;
    $('#srch').value = f.q;
    $('#tri').value = f.tri;
  }

  async function actualiser(silencieux) {
    if (!silencieux) chargement(true);
    try {
      const r = await Store.list(S.session);
      S.besoins = r.besoins || [];
      S.synchro = new Date();
      Object.keys(S.selection).forEach(function (id) {
        const b = parId(id);
        if (!b || b.statut !== 'EN_ATTENTE') delete S.selection[id];
      });
      rendre();
      if (S.ouvert && S.ouvert !== '__groupe__') rendrePanneau();
    } catch (err) {
      if (err.code === 'CODE_INVALIDE' || err.code === 'CODE_REQUIS' || err.code === 'PROFIL_INCONNU') {
        deconnecter('Session expirée : ' + err.message);
      } else if (!silencieux) {
        toast(err.message, 'err');
      }
    } finally {
      if (!silencieux) chargement(false);
    }
  }

  /* ================= Filtres ================= */

  function bornes() {
    const f = S.filtres;
    const now = new Date();
    const jour = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    switch (f.periode) {
      case 'jour': return [jour(now), null];
      case '7j': return [new Date(jour(now) - 6 * 864e5), null];
      case '30j': return [new Date(jour(now) - 29 * 864e5), null];
      case 'mois': return [new Date(now.getFullYear(), now.getMonth(), 1), null];
      case 'perso': return [f.du ? new Date(f.du + 'T00:00:00') : null, f.au ? new Date(f.au + 'T23:59:59') : null];
      default: return [null, null];
    }
  }

  function libellePeriode() {
    const f = S.filtres;
    const l = { jour: "Aujourd'hui", '7j': '7 derniers jours', '30j': '30 derniers jours', mois: 'Mois en cours', tout: 'Toute la campagne' };
    if (f.periode === 'perso') return (f.du ? 'du ' + fDate(f.du) : '') + (f.au ? ' au ' + fDate(f.au) : '') || 'Personnalisée';
    return l[f.periode] || '';
  }

  function filtrer(options) {
    const o = options || {};
    const f = S.filtres;
    const b = bornes();
    return S.besoins.filter(function (x) {
      const d = date(x.cree_le);
      if (b[0] && (!d || d < b[0])) return false;
      if (b[1] && (!d || d > b[1])) return false;
      if (!o.ignorerSite && f.site && x.site !== f.site) return false;
      if (f.cat && x.categorie !== f.cat) return false;
      if (f.type && x.type_besoin !== f.type) return false;
      return true;
    });
  }

  function stats(liste) {
    const s = { n: liste.length, qte: 0, qteValidee: 0, qteAttente: 0 };
    ORDRE_STATUTS.forEach(function (k) { s[k] = 0; });
    liste.forEach(function (b) {
      s[b.statut] = (s[b.statut] || 0) + 1;
      s.qte += Number(b.quantite) || 0;
      if (b.statut === 'VALIDE') s.qteValidee += Number(b.quantite_validee) || 0;
      if (b.statut === 'EN_ATTENTE') s.qteAttente += Number(b.quantite) || 0;
    });
    s.traites = s.VALIDE + s.REJETE;
    s.taux = s.n ? Math.round((s.traites / s.n) * 100) : 0;
    s.tauxValid = s.traites ? Math.round((s.VALIDE / s.traites) * 100) : 0;
    s.sites = Object.keys(liste.reduce(function (m, b) { m[b.site] = 1; return m; }, {})).length;
    return s;
  }

  /* ================= Rendu ================= */

  function rendre() {
    const liste = filtrer();
    const st = stats(liste);
    $('#pgMeta').textContent = 'Période : ' + libellePeriode() +
      (S.filtres.site ? ' · Site : ' + S.filtres.site : '') +
      ' · Mis à jour à ' + fHeure(S.synchro);
    $('#shPeriode').textContent = libellePeriode();
    $('#tbSync').textContent = 'Données du ' + fDateHeure(S.synchro);
    rendreProgression(st);
    rendreKpis(st);
    rendreGraphiques(liste);
    rendreTable(liste);
    if (estBO()) rendreSynthese(filtrer({ ignorerSite: true }));
    rendreArticles(liste);
    rendreAlertes(liste);
    icones();
  }

  function rendreProgression(st) {
    const segs = ['VALIDE', 'REJETE', 'EN_ATTENTE'];
    $('#gPct').textContent = st.taux + '%';
    $('#swrap').innerHTML = segs.map(function (k) {
      const w = st.n ? (st[k] / st.n) * 100 : 0;
      return '<div class="seg" style="width:' + w + '%;background:' + STATUTS[k].couleur + '" title="' + STATUTS[k].pluriel + ' : ' + st[k] + '"></div>';
    }).join('');
    $('#sLegend').innerHTML = segs.map(function (k) {
      return '<span class="sli"><span class="sd" style="background:' + STATUTS[k].couleur + '"></span>' + STATUTS[k].pluriel + ' : <b>' + st[k] + '</b></span>';
    }).join('');
    $('#psum').textContent = st.n
      ? st.traites + ' ligne(s) examinée(s) par le Back Office sur ' + st.n + ' — ' + st.EN_ATTENTE + ' encore en attente (' + nombre(st.qteAttente) + ' unité(s)).'
      : 'Aucun besoin exprimé sur la période sélectionnée.';
  }

  function rendreKpis(st) {
    const k = function (icone, label, val, unite, couleur) {
      return '<div class="kc" style="--kc:' + couleur + '"><div class="kbi">' + ico(icone) + '</div><p class="kl">' + label + '</p>' +
        '<p class="kv">' + val + '</p><p class="ku">' + unite + '</p></div>';
    };
    const parCat = CATS.map(function (c) { return c.libelle + ' ' + nombre(somme(filtrer().filter(function (b) { return b.categorie === c.code; }), function (b) { return b.quantite; })); }).join(' · ');
    const nbSites = estBO() ? (S.filtres.site ? 1 : C.SITES.length) : 1;
    $('#kpis').innerHTML = [
      k('clipboard-list', estBO() ? 'Lignes de besoin' : 'Mes lignes de besoin', nombre(st.n), 'sur la période', '#1d4ed8'),
      k('package', 'Quantité demandée', nombre(st.qte), parCat, '#111827'),
      estBO()
        ? k('building-2', 'Sites ayant saisi', st.sites + ' / ' + nbSites, nbSites - st.sites > 0 ? (nbSites - st.sites) + ' site(s) sans saisie' : 'tous les sites ont saisi', '#9333ea')
        : k('shopping-cart', 'Panier non envoyé', nombre(S.panier.length), S.panier.length ? 'ligne(s) à envoyer au Back Office' : 'rien en attente d\'envoi', '#9333ea'),
      k('hourglass', 'En attente de validation', nombre(st.EN_ATTENTE), nombre(st.qteAttente) + ' unité(s) concernée(s)', '#ea580c'),
      k('circle-check', 'Lignes validées', nombre(st.VALIDE), nombre(st.qteValidee) + ' unité(s) validée(s)', '#047857'),
      k('circle-x', 'Lignes rejetées', nombre(st.REJETE), st.traites ? st.tauxValid + '% de validation des lignes examinées' : 'aucune décision pour le moment', '#be123c'),
    ].join('');
  }

  function graphique(id, config) {
    const ex = S.charts[id];
    if (ex) {
      ex.data = config.data;
      ex.options = config.options;
      ex.update();
      return;
    }
    if (!window.Chart) return;
    S.charts[id] = new Chart(document.getElementById(id), config);
  }

  function rendreGraphiques(liste) {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Public Sans', ui-sans-serif, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#6b7280';
    Chart.defaults.borderColor = '#f3f4f6';
    const legende = { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3, padding: 14 } };
    const actifs = liste.filter(function (b) { return b.statut !== 'REJETE'; });

    graphique('cCat', {
      type: 'bar',
      data: {
        labels: CATS.map(function (c) { return c.libelle; }),
        datasets: ORDRE_STATUTS.map(function (s) {
          return {
            label: STATUTS[s].pluriel,
            backgroundColor: STATUTS[s].couleur,
            borderRadius: 4,
            data: CATS.map(function (c) { return somme(liste.filter(function (b) { return b.categorie === c.code && b.statut === s; }), function (b) { return b.quantite; }); }),
          };
        }),
      },
      options: { maintainAspectRatio: false, plugins: { legend: legende }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
    });

    graphique('cStatut', {
      type: 'doughnut',
      data: {
        labels: ORDRE_STATUTS.map(function (s) { return STATUTS[s].pluriel; }),
        datasets: [{ data: ORDRE_STATUTS.map(function (s) { return liste.filter(function (b) { return b.statut === s; }).length; }), backgroundColor: ORDRE_STATUTS.map(function (s) { return STATUTS[s].couleur; }), borderWidth: 2, borderColor: '#fff' }],
      },
      options: { maintainAspectRatio: false, cutout: '64%', plugins: { legend: legende } },
    });

    const m = {};
    actifs.forEach(function (b) {
      const k = b.categorie + '|' + b.libelle;
      m[k] = (m[k] || 0) + qteRetenue(b);
    });
    const top = Object.keys(m).map(function (k) { return { k: k, q: m[k] }; }).sort(function (a, b) { return b.q - a.q; }).slice(0, 10);
    graphique('cTop', {
      type: 'bar',
      data: {
        labels: top.map(function (x) { return x.k.split('|')[1]; }),
        datasets: [{ label: 'Quantité', data: top.map(function (x) { return x.q; }), backgroundColor: top.map(function (x) { return cat(x.k.split('|')[0]).couleur; }), borderRadius: 4, barThickness: 16 }],
      },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
    });

    const coulTypes = ['#1d4ed8', '#ea580c', '#0891b2', '#9333ea', '#047857'];
    graphique('cType', {
      type: 'doughnut',
      data: {
        labels: C.TYPES_BESOIN,
        datasets: [{ data: C.TYPES_BESOIN.map(function (t) { return somme(actifs.filter(function (b) { return b.type_besoin === t; }), qteRetenue); }), backgroundColor: coulTypes, borderWidth: 2, borderColor: '#fff' }],
      },
      options: { maintainAspectRatio: false, cutout: '64%', plugins: { legend: legende } },
    });

    if (estBO()) {
      const ls = filtrer({ ignorerSite: true }).filter(function (b) { return b.statut !== 'REJETE'; });
      const sites = C.SITES.map(function (p) { return { p: p, q: somme(ls.filter(function (b) { return b.site === p; }), qteRetenue) }; })
        .filter(function (x) { return x.q > 0; })
        .sort(function (a, b) { return b.q - a.q; })
        .map(function (x) { return x.p; });
      $('#cSiteWrap').style.height = Math.max(240, sites.length * 26 + 70) + 'px';
      graphique('cSite', {
        type: 'bar',
        data: {
          labels: sites,
          datasets: CATS.map(function (c) {
            return {
              label: c.libelle, backgroundColor: c.couleur, borderRadius: 3, barThickness: 14,
              data: sites.map(function (p) { return somme(ls.filter(function (b) { return b.site === p && b.categorie === c.code; }), qteRetenue); }),
            };
          }),
        },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: legende }, scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } },
      });
    }
  }

  function rendreTable(liste) {
    const f = S.filtres;
    let lignes = liste;
    const q = sansAccents(f.q).trim();
    if (q) {
      lignes = lignes.filter(function (b) {
        return sansAccents([b.id, b.ref, b.site, b.libelle, b.caracteristiques, b.service, b.personne, b.motif, b.demandeur, b.type_besoin].join(' ')).includes(q);
      });
    }
    const comptes = {};
    ORDRE_STATUTS.forEach(function (s) { comptes[s] = lignes.filter(function (b) { return b.statut === s; }).length; });
    $('#chips').innerHTML = [['', 'Tous', lignes.length]].concat(ORDRE_STATUTS.map(function (s) { return [s, STATUTS[s].pluriel, comptes[s]]; })).map(function (c) {
      return '<button type="button" class="fb' + (f.statut === c[0] ? ' on' : '') + '" data-s="' + c[0] + '">' + c[1] + ' <i>' + c[2] + '</i></button>';
    }).join('');
    if (f.statut) lignes = lignes.filter(function (b) { return b.statut === f.statut; });

    const tris = {
      recent: function (a, b) { return String(b.cree_le).localeCompare(String(a.cree_le)) || String(a.id).localeCompare(String(b.id)); },
      ancien: function (a, b) { return String(a.cree_le).localeCompare(String(b.cree_le)) || String(a.id).localeCompare(String(b.id)); },
      qte: function (a, b) { return (Number(b.quantite) || 0) - (Number(a.quantite) || 0); },
      maj: function (a, b) { return String(b.maj_le).localeCompare(String(a.maj_le)); },
    };
    lignes = lignes.slice().sort(tris[f.tri] || tris.recent);
    S.lignesTable = lignes;
    const visibles = lignes.slice(0, S.limite);
    const bo = estBO();

    $('#tbody').innerHTML = visibles.map(function (b) {
      const sel = !!S.selection[b.id];
      const vieux = b.statut === 'EN_ATTENTE' && joursDepuis(b.cree_le) >= C.SEUIL_ATTENTE_JOURS;
      return '<tr data-id="' + esc(b.id) + '" class="' + (sel ? 'sel ' : '') + (vieux ? 'late' : '') + '">' +
        (bo ? '<td class="ck">' + (b.statut === 'EN_ATTENTE' ? '<input type="checkbox" data-ck="' + esc(b.id) + '"' + (sel ? ' checked' : '') + ' aria-label="Sélectionner">' : '') + '</td>' : '') +
        '<td class="nw"><b>' + esc(b.id) + '</b></td>' +
        '<td class="nw">' + fDate(b.cree_le) + '<div class="sub">' + fHeure(b.cree_le) + '</div></td>' +
        (bo ? '<td class="nw"><b>' + esc(b.site) + '</b></td>' : '') +
        '<td>' + badgeCat(b.categorie) + '</td>' +
        '<td><b>' + esc(b.libelle) + '</b>' + (b.caracteristiques ? '<div class="sub clip" title="' + esc(b.caracteristiques) + '">' + esc(b.caracteristiques) + '</div>' : '') + '</td>' +
        '<td class="num"><span class="ib">' + nombre(b.quantite) + '</span></td>' +
        '<td class="ty">' + esc(b.type_besoin) + '</td>' +
        '<td>' + esc(b.service) + (b.personne ? '<div class="sub">' + esc(b.personne) + '</div>' : '') + '</td>' +
        '<td><div class="clip" title="' + esc(b.motif) + '">' + esc(b.motif) + '</div></td>' +
        '<td>' + badgeStatut(b.statut) + '</td>' +
        '<td class="num">' + (b.statut === 'VALIDE' ? '<b>' + nombre(b.quantite_validee) + '</b>' : '<span class="z">—</span>') + '</td>' +
        '</tr>';
    }).join('');
    $('#nd').hidden = visibles.length > 0;
    $('#ndTxt').textContent = S.besoins.length || bo ? 'Aucun besoin ne correspond aux critères sélectionnés.' : 'Vous n\'avez encore exprimé aucun besoin. Cliquez sur « Exprimer un besoin » pour commencer.';
    $('#more').hidden = lignes.length <= S.limite;
    $('#rc').textContent = lignes.length + ' ligne(s) — ' + nombre(somme(lignes, function (b) { return b.quantite; })) + ' unité(s)';
    if (bo) {
      const attente = visibles.filter(function (b) { return b.statut === 'EN_ATTENTE'; });
      $('#ckAll').checked = attente.length > 0 && attente.every(function (b) { return S.selection[b.id]; });
      $('#ckAll').disabled = !attente.length;
      majSelection();
    }
  }

  function majSelection() {
    const n = Object.keys(S.selection).length;
    $('#bulk').hidden = !n;
    $('#bulkN').textContent = n + ' ligne(s) sélectionnée(s)';
  }

  function rendreSynthese(liste) {
    const lignes = C.SITES.map(function (p) {
      const l = liste.filter(function (b) { return b.site === p; });
      const st = stats(l);
      const parC = {};
      CATS.forEach(function (c) { parC[c.code] = somme(l.filter(function (b) { return b.categorie === c.code && b.statut !== 'REJETE'; }), function (b) { return b.quantite; }); });
      const derniere = l.reduce(function (m, b) { return String(b.cree_le) > m ? String(b.cree_le) : m; }, '');
      return { p: p, st: st, parC: parC, derniere: derniere };
    }).sort(function (a, b) { return b.st.n - a.st.n || a.p.localeCompare(b.p); });
    const z = function (n) { return n ? nombre(n) : '<span class="z">0</span>'; };
    $('#tSynth tbody').innerHTML = lignes.map(function (x) {
      const st = x.st;
      const couleur = st.taux >= 75 ? '#047857' : st.taux >= 40 ? '#ea580c' : '#be123c';
      return '<tr data-site="' + esc(x.p) + '" title="Filtrer sur ' + esc(x.p) + '"' + (st.n ? '' : ' class="none"') + '>' +
        '<td><b>' + esc(x.p) + '</b></td>' +
        '<td class="num">' + z(st.n) + '</td>' +
        CATS.map(function (c) { return '<td class="num">' + z(x.parC[c.code]) + '</td>'; }).join('') +
        '<td class="num"><b>' + z(st.qte) + '</b></td>' +
        '<td class="num">' + z(st.EN_ATTENTE) + '</td>' +
        '<td class="num">' + z(st.VALIDE) + '</td>' +
        '<td class="num">' + z(st.REJETE) + '</td>' +
        '<td>' + (st.n ? '<div class="pb"><div class="pbt"><div class="pbf" style="width:' + st.taux + '%;background:' + couleur + '"></div></div><span class="pbp" style="color:' + couleur + '">' + st.taux + '%</span></div>' : '<span class="z">—</span>') + '</td>' +
        '<td class="nw">' + (x.derniere ? fDateHeure(x.derniere) : '<span class="nos">Aucune saisie</span>') + '</td>' +
        '</tr>';
    }).join('');
  }

  function rendreArticles(liste) {
    const actifs = liste.filter(function (b) { return b.statut !== 'REJETE'; });
    $('#artChips').innerHTML = [['', 'Toutes']].concat(CATS.map(function (c) { return [c.code, c.libelle]; })).map(function (c) {
      const n = c[0] ? actifs.filter(function (b) { return b.categorie === c[0]; }).length : actifs.length;
      return '<button type="button" class="fb' + (S.artCat === c[0] ? ' on' : '') + '" data-c="' + c[0] + '">' + c[1] + ' <i>' + n + '</i></button>';
    }).join('');
    const m = {};
    actifs.filter(function (b) { return !S.artCat || b.categorie === S.artCat; }).forEach(function (b) {
      const k = b.categorie + '|' + b.libelle;
      if (!m[k]) m[k] = { categorie: b.categorie, libelle: b.libelle, sites: {}, n: 0, qte: 0, val: 0, att: 0 };
      const x = m[k];
      x.sites[b.site] = 1;
      x.n++;
      x.qte += Number(b.quantite) || 0;
      if (b.statut === 'VALIDE') x.val += Number(b.quantite_validee) || 0;
      if (b.statut === 'EN_ATTENTE') x.att += Number(b.quantite) || 0;
    });
    const ordreCat = CATS.map(function (c) { return c.code; });
    const lignes = Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return ordreCat.indexOf(a.categorie) - ordreCat.indexOf(b.categorie) || b.qte - a.qte; });
    const z = function (n) { return n ? nombre(n) : '<span class="z">0</span>'; };
    $('#tArt tbody').innerHTML = lignes.length ? lignes.map(function (x) {
      return '<tr data-lib="' + esc(x.libelle) + '" title="Voir les lignes de cet article">' +
        '<td>' + badgeCat(x.categorie) + '</td><td><b>' + esc(x.libelle) + '</b></td>' +
        '<td class="num bo-only">' + Object.keys(x.sites).length + '</td>' +
        '<td class="num">' + x.n + '</td><td class="num"><b>' + nombre(x.qte) + '</b></td>' +
        '<td class="num">' + z(x.val) + '</td><td class="num">' + z(x.att) + '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="nd">' + ico('package-open') + 'Aucun article sur la période.</div></td></tr>';
    $('#artRc').textContent = lignes.length + ' article(s) — ' + nombre(somme(lignes, function (x) { return x.qte; })) + ' unité(s) demandée(s)';
  }

  function rendreAlertes(liste) {
    const carte = function (b, detail) {
      return '<div class="acard" data-id="' + esc(b.id) + '">' +
        '<div class="aid2"><span class="ib">' + esc(b.id) + '</span>' + (estBO() ? '<b style="font-size:12px;color:#111827">' + esc(b.site) + '</b>' : '') + badgeStatut(b.statut) + '</div>' +
        '<div class="anm">' + nombre(b.quantite) + ' × ' + esc(b.libelle) + '</div>' +
        (detail ? '<div class="adet">' + detail + '</div>' : '') + '</div>';
    };
    const bloc = function (cls, icone, titre, sous, cartes, vide, total) {
      return '<div class="ac ' + cls + '"><div class="ach"><div class="aic">' + ico(icone) + '</div><div><h3 class="act">' + titre + '</h3><p class="acs">' + sous + '</p></div></div>' +
        (cartes.length ? cartes.join('') : '<div class="aempty">' + ico('circle-check') + vide + '</div>') +
        (total > cartes.length ? '<div class="amore">… et ' + (total - cartes.length) + ' autre(s)</div>' : '') + '</div>';
    };
    const MAX = 5;
    const recentes = liste.filter(function (b) { return b.statut !== 'EN_ATTENTE'; })
      .sort(function (a, b) { return String(b.maj_le).localeCompare(String(a.maj_le)); });
    const attente = liste.filter(function (b) { return b.statut === 'EN_ATTENTE'; })
      .sort(function (a, b) { return String(a.cree_le).localeCompare(String(b.cree_le)); });
    const blocDecisions = bloc('info', 'message-square-text', 'Dernières décisions', 'Validations et rejets les plus récents',
      recentes.slice(0, MAX).map(function (b) {
        return carte(b, (b.statut === 'VALIDE' ? 'Qté validée : <b>' + nombre(b.quantite_validee) + '</b>' : '') + (b.commentaire_bo ? (b.statut === 'VALIDE' ? ' — ' : '') + esc(b.commentaire_bo) : '') + ' <span class="z">· ' + fDateHeure(b.maj_le) + '</span>');
      }), 'Aucune décision pour le moment.', recentes.length);

    if (estBO()) {
      const actifsSites = {};
      filtrer({ ignorerSite: true }).forEach(function (b) { actifsSites[b.site] = 1; });
      const vides = C.SITES.filter(function (p) { return !actifsSites[p]; });
      const vieux = attente.filter(function (b) { return joursDepuis(b.cree_le) >= C.SEUIL_ATTENTE_JOURS; });
      $('#alerts').innerHTML = [
        bloc('crit', 'building-2', 'Sites sans aucune saisie', vides.length + ' site(s) sur ' + C.SITES.length + ' — à relancer',
          vides.slice(0, 8).map(function (p) { return '<div class="acard" data-site-vide="' + esc(p) + '"><div class="anm">' + esc(p) + '</div></div>'; }),
          'Tous les sites ont exprimé leurs besoins.', vides.length),
        bloc('urg', 'hourglass', 'En attente depuis plus de ' + C.SEUIL_ATTENTE_JOURS + ' jours', vieux.length + ' ligne(s) à examiner en priorité',
          vieux.slice(0, MAX).map(function (b) { return carte(b, 'Saisi le ' + fDate(b.cree_le) + ' — ' + Math.floor(joursDepuis(b.cree_le)) + ' j d\'attente'); }),
          'Aucune ligne en attente prolongée.', vieux.length),
        blocDecisions,
      ].join('');
    } else {
      const rejets = liste.filter(function (b) { return b.statut === 'REJETE'; })
        .sort(function (a, b) { return String(b.maj_le).localeCompare(String(a.maj_le)); });
      $('#alerts').innerHTML = [
        bloc('crit', 'circle-x', 'Besoins rejetés', 'Motif du Back Office — ressaisissez si besoin',
          rejets.slice(0, MAX).map(function (b) { return carte(b, esc(b.commentaire_bo || 'Sans commentaire')); }),
          'Aucun besoin rejeté.', rejets.length),
        bloc('urg', 'hourglass', 'En attente de validation', attente.length + ' ligne(s) en cours d\'examen',
          attente.slice(0, MAX).map(function (b) { return carte(b, 'Saisi le ' + fDate(b.cree_le) + (b.demandeur ? ' par ' + esc(b.demandeur) : '')); }),
          'Aucun besoin en attente.', attente.length),
        blocDecisions,
      ].join('');
    }
  }

  /* ================= Panneau détail & décisions ================= */

  function ouvrirPanneau(id) {
    S.ouvert = id;
    rendrePanneau();
    $('#ov').classList.add('on');
    $('#pnl').classList.add('on');
    $('#pnl').setAttribute('aria-hidden', 'false');
    $('#pnl .pbd').scrollTop = 0;
    icones();
  }

  function fermerPanneau() {
    S.ouvert = null;
    $('#ov').classList.remove('on');
    $('#pnl').classList.remove('on');
    $('#pnl').setAttribute('aria-hidden', 'true');
  }

  const it = function (l, v, large) {
    return '<div class="pi' + (large ? ' w' : '') + '"><div class="pil">' + l + '</div><div class="piv">' + (v === '' || v === null || v === undefined ? '<span class="z">—</span>' : v) + '</div></div>';
  };

  function rendrePanneau() {
    const b = parId(S.ouvert);
    if (!b) { fermerPanneau(); return; }
    $('#pId').textContent = b.id + ' · ' + b.site;
    $('#pTitle').textContent = nombre(b.quantite) + ' × ' + b.libelle;
    $('#pBody').innerHTML =
      '<div class="pst-row">' + badgeStatut(b.statut) + badgeCat(b.categorie) + '<span class="sub">Demande ' + esc(b.ref) + ' · saisie le ' + fDateHeure(b.cree_le) + '</span></div>' +
      '<div class="ps"><h3 class="pst">Le besoin</h3><div class="pg">' +
        it('Article', esc(b.libelle)) + it('Quantité demandée', '<b>' + nombre(b.quantite) + '</b>') +
        it('Type de besoin', esc(b.type_besoin)) + it('Catégorie', esc(cat(b.categorie).libelle)) +
        it('Caractéristiques', esc(b.caracteristiques), true) +
      '</div></div>' +
      '<div class="ps"><h3 class="pst">Bénéficiaire et justification</h3><div class="pg">' +
        it('Site', esc(b.site)) + it('Demandeur', esc(b.demandeur)) +
        it('Service bénéficiaire', esc(b.service)) + it('Personne bénéficiaire', esc(b.personne)) +
      '</div><p class="pil" style="margin:12px 0 6px">Motif</p><div class="ptx">' + esc(b.motif) + '</div>' +
      (b.commentaires ? '<p class="pil" style="margin:12px 0 6px">Commentaires</p><div class="ptx">' + esc(b.commentaires) + '</div>' : '') + '</div>' +
      (b.statut !== 'EN_ATTENTE'
        ? '<div class="ps"><h3 class="pst">Décision du Back Office</h3><div class="pg">' +
          it('Décision', badgeStatut(b.statut)) + it('Quantité validée', b.statut === 'VALIDE' ? '<b>' + nombre(b.quantite_validee) + '</b>' : '') +
          it('Par', esc(b.traite_par)) + it('Le', fDateHeure(b.maj_le)) +
          (b.commentaire_bo ? it('Commentaire', esc(b.commentaire_bo), true) : '') + '</div></div>'
        : '');

    if (estBO()) {
      $('#pForm').innerHTML = formDecision(b.statut === 'EN_ATTENTE' ? 'VALIDE' : b.statut, b.quantite_validee !== '' ? b.quantite_validee : b.quantite, b.commentaire_bo, true);
      brancherDecision([b.id]);
    } else if (b.statut === 'EN_ATTENTE') {
      $('#pForm').innerHTML = '<div class="ps"><h3 class="pst">Modifier</h3><p class="cs" style="margin-bottom:10px">Ce besoin n\'a pas encore été examiné : vous pouvez le retirer puis le ressaisir si nécessaire.</p>' +
        '<button type="button" class="btn btn-danger" id="pRetirer">' + ico('trash-2') + 'Retirer ce besoin</button></div>';
      $('#pRetirer').addEventListener('click', function () { retirer(b); });
    } else {
      $('#pForm').innerHTML = '';
    }
    icones();
  }

  function formDecision(statut, qte, commentaire, unitaire) {
    const agent = memoire.lire('bud27_agent') || '';
    return '<form class="ps" id="decForm" novalidate><h3 class="pst">' + (unitaire ? 'Décision' : 'Décision groupée') + '</h3>' +
      '<div class="dec">' +
        '<label class="d-ok"><input type="radio" name="dst" value="VALIDE"' + (statut === 'VALIDE' ? ' checked' : '') + '><span>' + ico('check') + 'Valider</span></label>' +
        '<label class="d-ko"><input type="radio" name="dst" value="REJETE"' + (statut === 'REJETE' ? ' checked' : '') + '><span>' + ico('x') + 'Rejeter</span></label>' +
        '<label class="d-at"><input type="radio" name="dst" value="EN_ATTENTE"' + (statut === 'EN_ATTENTE' ? ' checked' : '') + '><span>' + ico('undo-2') + 'Remettre en attente</span></label>' +
      '</div>' +
      (unitaire ? '<div id="decQteW"><label class="fl" for="decQte">Quantité validée</label><input class="in" id="decQte" type="number" min="0" step="1" value="' + esc(qte) + '" style="max-width:160px"></div>'
        : '<p class="cs" style="margin-top:10px">En validation groupée, la quantité validée est égale à la quantité demandée de chaque ligne.</p>') +
      '<label class="fl" for="decCom">Commentaire <span id="decComReq" class="z"></span></label><textarea class="in" id="decCom" rows="3" placeholder="Ex. : validé pour le budget 2027, à livrer au T1…">' + esc(commentaire || '') + '</textarea>' +
      '<label class="fl" for="decAgent">Votre nom (agent Back Office) *</label><input class="in" id="decAgent" value="' + esc(agent) + '" autocomplete="name">' +
      '<div class="lg-err" id="decErr"></div>' +
      '<div class="pf-ft"><button type="submit" class="btn bp">' + ico('save') + 'Enregistrer la décision</button></div></form>';
  }

  function brancherDecision(ids) {
    const maj = function () {
      const s = ($('#decForm input[name=dst]:checked') || {}).value;
      if ($('#decQteW')) $('#decQteW').hidden = s !== 'VALIDE';
      $('#decComReq').textContent = s === 'REJETE' ? '(obligatoire pour un rejet)' : '(facultatif)';
    };
    $$('#decForm input[name=dst]').forEach(function (r) { r.addEventListener('change', maj); });
    maj();
    $('#decForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const statut = ($('#decForm input[name=dst]:checked') || {}).value;
      const com = $('#decCom').value.trim();
      const agent = $('#decAgent').value.trim();
      const err = $('#decErr');
      err.textContent = '';
      if (!statut) { err.textContent = 'Choisissez une décision.'; return; }
      if (statut === 'REJETE' && !com) { err.textContent = 'Indiquez le motif du rejet.'; $('#decCom').focus(); return; }
      if (!agent) { err.textContent = 'Indiquez votre nom.'; $('#decAgent').focus(); return; }
      const data = { ids: ids, statut: statut, commentaire: com, agent: agent };
      if ($('#decQte') && statut === 'VALIDE') {
        const q = Number($('#decQte').value);
        if (!(q >= 0) || $('#decQte').value === '') { err.textContent = 'Quantité validée invalide.'; return; }
        data.quantite_validee = Math.round(q);
      }
      memoire.ecrire('bud27_agent', agent);
      chargement(true);
      try {
        await Store.decide(S.session, data);
        toast(ids.length > 1 ? ids.length + ' ligne(s) mises à jour.' : 'Décision enregistrée.', 'ok');
        ids.forEach(function (id) { delete S.selection[id]; });
        fermerPanneau();
        await actualiser(true);
      } catch (e2) {
        err.textContent = e2.message;
      } finally {
        chargement(false);
      }
    });
  }

  function ouvrirDecisionGroupee(statut) {
    const ids = Object.keys(S.selection);
    if (!ids.length) return;
    const lignes = ids.map(parId).filter(Boolean);
    S.ouvert = '__groupe__';
    $('#pId').textContent = 'Back Office · ' + ids.length + ' ligne(s)';
    $('#pTitle').textContent = 'Décision groupée';
    $('#pBody').innerHTML = '<div class="ps"><h3 class="pst">Lignes sélectionnées</h3><div class="cart-l">' + lignes.map(function (b) {
      const c = cat(b.categorie);
      return '<div class="cart-i"><span class="cart-q" style="background:color-mix(in srgb,' + c.couleur + ' 12%,#fff);color:' + c.couleur + '">' + nombre(b.quantite) + '</span>' +
        '<span class="cart-t"><b>' + esc(b.libelle) + '</b><small>' + esc(b.id) + ' · ' + esc(b.site) + ' · ' + esc(b.type_besoin) + '</small></span></div>';
    }).join('') + '</div></div>';
    $('#pForm').innerHTML = formDecision(statut, '', '', false);
    brancherDecision(ids);
    $('#ov').classList.add('on');
    $('#pnl').classList.add('on');
    $('#pnl').setAttribute('aria-hidden', 'false');
    $('#pnl .pbd').scrollTop = 0;
    icones();
  }

  async function retirer(b) {
    chargement(true);
    try {
      await Store.cancel(S.session, { id: b.id });
      toast('Besoin ' + b.id + ' retiré.', 'ok');
      fermerPanneau();
      await actualiser(true);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      chargement(false);
    }
  }

  /* ================= Saisie des besoins (assistant + panier) ================= */

  const N = { etape: 1, cat: '', type: '' };

  function initSaisie() {
    $('#nCats').innerHTML = CATS.map(function (c) {
      return '<label style="--catc:' + c.couleur + '"><input type="radio" name="ncat" value="' + esc(c.code) + '"><span>' + ico(c.ico) +
        '<b>' + esc(c.libelle) + '</b><small>' + esc(c.aide) + '</small><small class="n-art">' + c.articles.length + ' articles proposés</small></span></label>';
    }).join('');
    $('#nTypes').innerHTML = C.TYPES_BESOIN.map(function (t) {
      return '<label><input type="radio" name="ntype" value="' + esc(t) + '"><span>' + esc(t) + '</span></label>';
    }).join('');
    $('#nQuick').innerHTML = C.MOTIFS_RAPIDES.map(function (m) { return '<button type="button">+ ' + esc(m) + '</button>'; }).join('');

    $('#nCats').addEventListener('change', function (e) {
      N.cat = e.target.value;
      remplirArticles();
      setTimeout(function () { allerA(2); }, 120);
    });
    $('#nTypes').addEventListener('change', function (e) { N.type = e.target.value; $('#nTypes').classList.remove('err'); });
    $('#nLib').addEventListener('change', function () {
      const autre = $('#nLib').value === AUTRE;
      $('#nLibAutre').hidden = !autre;
      if (autre) $('#nLibAutre').focus();
      $('#nLib').classList.remove('err');
    });
    $$('.qty button').forEach(function (b) {
      b.addEventListener('click', function () {
        const i = $('#nQte');
        i.value = Math.max(1, (parseInt(i.value, 10) || 1) + Number(b.dataset.q));
        $('.qty').classList.remove('err');
      });
    });
    $('#nQuick').addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      const t = $('#nMotif');
      const m = b.textContent.slice(2);
      t.value = t.value.trim() ? t.value.trim() + ' — ' + m : m;
      t.classList.remove('err');
    });
    ['nLibAutre', 'nServ', 'nMotif', 'nDem'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () { $('#' + id).classList.remove('err'); });
    });
    $('#nSteps').addEventListener('click', function (e) {
      const li = e.target.closest('li.fait');
      if (li && N.etape < 4) allerA(Number(li.dataset.step));
    });
    $('#nPrev').addEventListener('click', function () {
      if (N.etape === 1 || N.etape === 4) fermerSaisie();
      else allerA(N.etape - 1);
    });
    $('#nNext').addEventListener('click', suivant);
    $('#nAddMore').addEventListener('click', function () { nouvelleLigne(true); });
    $('#nCart').addEventListener('click', function (e) {
      const x = e.target.closest('[data-rm]');
      if (!x) return;
      S.panier.splice(Number(x.dataset.rm), 1);
      sauverPanier();
      rendrePanier();
      if (!S.panier.length) nouvelleLigne(false);
    });
    $('#fNew').addEventListener('submit', function (e) { e.preventDefault(); envoyer(); });
    $('#mNew').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) fermerSaisie();
    });
  }

  function remplirArticles() {
    const c = cat(N.cat);
    $('#mNewTitle').textContent = 'Besoin ' + c.libelle;
    $('#nLib').innerHTML = '<option value="">— Sélectionner un article —</option>' +
      c.articles.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') +
      '<option value="' + AUTRE + '">Autre (préciser)…</option>';
    $('#nLibAutre').hidden = true;
    $('#nLibAutre').value = '';
  }

  function ouvrirSaisie() {
    $('#mNewSite').textContent = S.session.profil + ' · ' + C.CAMPAGNE;
    $('#mNew').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#nDem').value = memoire.lire(cleNom()) || '';
    if (S.panier.length) { rendrePanier(); allerA(4); } else nouvelleLigne(false);
    icones();
  }

  function fermerSaisie() {
    $$('#fNew .ok-box').forEach(function (x) { x.remove(); });  // message de confirmation
    $('#mNew').hidden = true;
    document.body.style.overflow = '';
  }

  function nouvelleLigne(garderJustif) {
    N.cat = ''; N.type = '';
    $$('#nCats input, #nTypes input').forEach(function (i) { i.checked = false; });
    $('#nLib').innerHTML = '';
    $('#nLibAutre').hidden = true; $('#nLibAutre').value = '';
    $('#nQte').value = 1; $('#nCar').value = '';
    if (!garderJustif) {
      $('#nServ').value = memoire.lire(cleService()) || '';
      $('#nPers').value = ''; $('#nMotif').value = ''; $('#nCom').value = '';
    }
    $('#mNewTitle').textContent = 'Exprimer un besoin';
    $$('#fNew .err').forEach(function (x) { x.classList.remove('err'); });
    allerA(1);
  }

  function allerA(n) {
    N.etape = n;
    $('#nErr').textContent = '';
    $$('#fNew .nstep').forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
    $$('#nSteps li').forEach(function (li) {
      const k = Number(li.dataset.step);
      li.classList.toggle('actif', k === n);
      li.classList.toggle('fait', k < n);
    });
    $('#nPrev').innerHTML = n === 1 || n === 4 ? 'Fermer' : ico('arrow-left') + 'Retour';
    $('#nNext').hidden = n === 4;
    $('#nSubmit').hidden = n !== 4;
    if (n === 4) $('#nSubmitTxt').textContent = 'Envoyer ' + S.panier.length + ' besoin' + (S.panier.length > 1 ? 's' : '');
    $('#nNext').innerHTML = n === 3 ? ico('shopping-cart') + 'Ajouter au panier' : 'Suivant' + ico('arrow-right');
    icones();
    const focus = { 2: '#nLib', 3: '#nServ', 4: '#nDem' }[n];
    if (focus && window.innerWidth > 700) setTimeout(function () { const el = $(focus); if (el && !el.value) el.focus(); }, 60);
  }

  function erreurSaisie(el, msg) {
    if (el) { el.classList.add('err'); if (el.focus) el.focus(); }
    $('#nErr').textContent = msg;
    return false;
  }

  function verifier(n) {
    if (n === 1) return N.cat ? true : erreurSaisie(null, 'Choisissez une catégorie.');
    if (n === 2) {
      if (!N.type) return erreurSaisie($('#nTypes'), 'Choisissez le type de besoin.');
      if (!$('#nLib').value) return erreurSaisie($('#nLib'), 'Choisissez un article.');
      if ($('#nLib').value === AUTRE && !$('#nLibAutre').value.trim()) return erreurSaisie($('#nLibAutre'), "Précisez l'article.");
      if (!((parseInt($('#nQte').value, 10) || 0) > 0)) return erreurSaisie($('.qty'), 'La quantité doit être au moins 1.');
      return true;
    }
    if (n === 3) {
      if (!$('#nServ').value.trim()) return erreurSaisie($('#nServ'), 'Indiquez le service bénéficiaire.');
      if (!$('#nMotif').value.trim()) return erreurSaisie($('#nMotif'), 'Le motif est obligatoire : il sert à la validation.');
      return true;
    }
    return true;
  }

  function suivant() {
    if (!verifier(N.etape)) return;
    if (N.etape < 3) { allerA(N.etape + 1); return; }
    // Étape 3 validée : la ligne part dans le panier.
    S.panier.push({
      categorie: N.cat,
      type_besoin: N.type,
      libelle: $('#nLib').value === AUTRE ? $('#nLibAutre').value.trim() : $('#nLib').value,
      quantite: parseInt($('#nQte').value, 10),
      caracteristiques: $('#nCar').value.trim(),
      service: $('#nServ').value.trim(),
      personne: $('#nPers').value.trim(),
      motif: $('#nMotif').value.trim(),
      commentaires: $('#nCom').value.trim(),
    });
    memoire.ecrire(cleService(), $('#nServ').value.trim());
    sauverPanier();
    rendrePanier();
    allerA(4);
  }

  function sauverPanier() {
    memoire.ecrire(clePanier(), S.panier);
    majCompteurPanier();
  }

  function majCompteurPanier() {
    const n = S.panier.length;
    $('#sbCart').hidden = !n;
    $('#sbCart').textContent = n;
  }

  function rendrePanier() {
    $('#nCart').innerHTML = '<div class="cart-l">' + S.panier.map(function (l, k) {
      const c = cat(l.categorie);
      return '<div class="cart-i"><span class="cart-q" style="background:color-mix(in srgb,' + c.couleur + ' 12%,#fff);color:' + c.couleur + '">' + nombre(l.quantite) + '</span>' +
        '<span class="cart-t"><b>' + esc(l.libelle) + '</b><small>' + esc(c.libelle) + ' · ' + esc(l.type_besoin) + ' · ' + esc(l.service) + '</small></span>' +
        '<button type="button" class="cart-x" data-rm="' + k + '" title="Retirer du panier">' + ico('trash-2') + '</button></div>';
    }).join('') +
      '<div class="cart-tot"><span>' + S.panier.length + ' ligne(s)</span><span>Quantité totale : <b>' + nombre(somme(S.panier, function (l) { return l.quantite; })) + '</b></span></div></div>';
    $('#nSubmitTxt').textContent = 'Envoyer ' + S.panier.length + ' besoin' + (S.panier.length > 1 ? 's' : '');
    icones();
  }

  async function envoyer() {
    if (!S.panier.length) return;
    const dem = $('#nDem').value.trim();
    if (!dem) { erreurSaisie($('#nDem'), 'Indiquez votre nom.'); return; }
    memoire.ecrire(cleNom(), dem);
    const btn = $('#nSubmit');
    btn.disabled = true;
    chargement(true);
    try {
      const r = await Store.create(S.session, { demandeur: dem, items: S.panier });
      const n = S.panier.length;
      S.panier = [];
      sauverPanier();
      $$('#fNew .nstep').forEach(function (s) { s.hidden = true; });
      $('#nSubmit').hidden = true;
      $('#nNext').hidden = true;
      $('#nPrev').innerHTML = 'Fermer';
      N.etape = 4;
      $$('#nSteps li').forEach(function (li) { li.classList.remove('actif'); li.classList.add('fait'); });
      $('#nErr').innerHTML = '';
      const box = document.createElement('div');
      box.className = 'nstep ok-box';
      box.innerHTML = '<div class="ok-ic">' + ico('check') + '</div><h3 class="pnm">Besoins envoyés au Back Office</h3>' +
        '<p class="cs">' + n + ' ligne(s) enregistrée(s) pour ' + esc(S.session.profil) + '.</p><div class="ok-ref">' + esc(r.ref) + '</div>' +
        '<p class="cs">Vous suivrez leur validation dans « Mes besoins ».</p>' +
        '<button type="button" class="add-more" id="nAgain" style="margin-top:16px">' + ico('plus') + 'Exprimer d\'autres besoins</button>';
      $('#fNew .mdl-bd').insertBefore(box, $('#nErr'));
      $('#nAgain').addEventListener('click', function () { box.remove(); nouvelleLigne(false); });
      icones();
      actualiser(true);
    } catch (e) {
      $('#nErr').textContent = e.message;
    } finally {
      btn.disabled = false;
      chargement(false);
    }
  }

  /* ================= Export Excel ================= */

  function exporterExcel() {
    if (!window.XLSX) { toast("La bibliothèque Excel n'a pas pu être chargée (connexion internet ?).", 'err'); return; }
    const lignes = S.lignesTable;
    if (!lignes.length) { toast('Aucun besoin à exporter avec les filtres actuels.', 'err'); return; }
    const feuille = function (rows, largeurs) {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = largeurs.map(function (w) { return { wch: w }; });
      return ws;
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(lignes.map(function (b) {
      return {
        'N°': b.id, 'Réf. demande': b.ref, 'Saisi le': fDateHeure(b.cree_le), 'Site': b.site, 'Demandeur': b.demandeur,
        'Catégorie': cat(b.categorie).libelle, 'Type besoin': b.type_besoin, 'Libellé': b.libelle,
        'Quantité demandée': Number(b.quantite) || 0, 'Caractéristiques': b.caracteristiques,
        'Service bénéficiaire': b.service, 'Personne bénéficiaire': b.personne, 'Motif': b.motif, 'Commentaires': b.commentaires,
        'Statut': (STATUTS[b.statut] || {}).libelle, 'Quantité validée': b.statut === 'VALIDE' ? Number(b.quantite_validee) || 0 : '',
        'Commentaire Back Office': b.commentaire_bo, 'Traité par': b.traite_par, 'Mis à jour le': fDateHeure(b.maj_le),
      };
    }), [14, 11, 16, 18, 20, 13, 22, 30, 10, 30, 18, 20, 40, 30, 11, 10, 30, 18, 16]), 'Besoins');

    const m = {};
    lignes.filter(function (b) { return b.statut !== 'REJETE'; }).forEach(function (b) {
      const k = b.categorie + '|' + b.libelle;
      if (!m[k]) m[k] = { 'Catégorie': cat(b.categorie).libelle, 'Article': b.libelle, 'Sites': {}, 'Lignes': 0, 'Qté demandée': 0, 'Qté validée': 0, 'Qté en attente': 0 };
      m[k].Sites[b.site] = 1; m[k].Lignes++;
      m[k]['Qté demandée'] += Number(b.quantite) || 0;
      if (b.statut === 'VALIDE') m[k]['Qté validée'] += Number(b.quantite_validee) || 0;
      if (b.statut === 'EN_ATTENTE') m[k]['Qté en attente'] += Number(b.quantite) || 0;
    });
    XLSX.utils.book_append_sheet(wb, feuille(Object.keys(m).map(function (k) {
      const x = m[k];
      return Object.assign({}, x, { 'Sites': Object.keys(x.Sites).length });
    }), [14, 34, 8, 8, 13, 12, 14]), 'Articles consolidés');

    if (estBO()) {
      XLSX.utils.book_append_sheet(wb, feuille(C.SITES.map(function (p) {
        const l = lignes.filter(function (b) { return b.site === p; });
        const st = stats(l);
        const row = { 'Site': p, 'Lignes': st.n };
        CATS.forEach(function (c) { row[c.libelle + ' (qté)'] = somme(l.filter(function (b) { return b.categorie === c.code && b.statut !== 'REJETE'; }), function (b) { return b.quantite; }); });
        return Object.assign(row, { 'Qté totale': st.qte, 'En attente': st.EN_ATTENTE, 'Validées': st.VALIDE, 'Rejetées': st.REJETE, 'Qté validée': st.qteValidee, 'Taux de traitement (%)': st.taux });
      }), [20, 8, 16, 12, 12, 11, 11, 10, 10, 12, 20]), 'Synthèse par site');
    }
    const nom = 'Besoins_' + C.CAMPAGNE.replace(/\s+/g, '_') + '_' + (estBO() ? 'BackOffice' : S.session.profil.replace(/\s+/g, '_')) + '_' + fDate(new Date()).replace(/\//g, '-') + '.xlsx';
    XLSX.writeFile(wb, nom);
    toast('Export Excel généré.', 'ok');
  }

  /* ================= Démarrage ================= */

  initConnexion();
  const sess = memoire.lire(CLE_SESSION);
  if (sess && sess.profil) {
    profilChoisi = sess.profil;
    connecter(sess.profil, sess.code || '', true);
  } else {
    afficherConnexion();
  }
})();
