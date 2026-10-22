/*
 * Expression des besoins — Budget 2027 : interface (connexion, tableau de bord,
 * saisie des besoins par tous les postes, validation par les Responsables et les Managers).
 */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const Store = window.Store;

  // Couleurs reprises du thème Flowbite d'iris.
  const STATUTS = {
    EN_ATTENTE: { libelle: 'En attente', pluriel: 'En attente', badge: 'becp', couleur: '#ea580c' },
    VALIDE: { libelle: 'Validé', pluriel: 'Validés', badge: 'bter', couleur: '#047857' },
    REJETE: { libelle: 'Rejeté', pluriel: 'Rejetés', badge: 'brej', couleur: '#be123c' },
  };
  const ORDRE_STATUTS = ['EN_ATTENTE', 'VALIDE', 'REJETE'];
  const CATS = C.CATEGORIES;
  const sitesDe = function (poste) { return (C.SITES_PAR_POSTE || {})[poste] || []; };
  const unique = function (l) { return l.filter(function (x, i) { return x && l.indexOf(x) === i; }); };
  // Synthèses et filtres : le siège puis les sites de tous les postes en agence.
  const TOUS_SITES = unique(Object.keys(C.SITES_PAR_POSTE || {}).reduce(function (t, p) { return t.concat(sitesDe(p)); }, [C.SITE_SIEGE]));
  // Idem, plus les sites présents dans les données (anciens noms de sites compris).
  const sitesConnus = function () { return unique(TOUS_SITES.concat(S.besoins.map(function (b) { return b.site; }))); };
  const AUTRE = '__autre__';
  const PAR_PAGE = 100;
  const CLE_SESSION = 'bud27_session';
  const FILTRES_DEFAUT = { vue: 'tout', periode: 'tout', du: '', au: '', site: '', cat: '', type: '', statut: '', q: '', tri: 'recent' };

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
    vue: null,
    secCible: null,
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
  // « Valideur » = Responsable ou Manager (la vue Back Office n'existe plus).
  const estBO = function () { return !!S.session && Store.estValideur(S.session); };
  const estManager = function () { return !!S.session && S.session.poste === 'Manager'; };
  const peutDecider = function (b) { return !!S.session && Store.peutDecider(S.session, b); };
  const estMien = function (b) { return !!S.session && Store.estMien(S.session, b); };
  const valideurTxt = function (b) { const v = Store.valideurDe(b); return v === 'Managers' ? 'les managers' : v || 'non désigné'; };
  const monValideur = function () { return valideurTxt({ poste: S.session.poste, demandeur: S.session.nom, demandeur_id: S.session.id }); };
  const equipTxt = function (b) { return b.annee_acquisition || b.etat_actuel ? [b.annee_acquisition ? 'Acquis en ' + b.annee_acquisition : '', b.etat_actuel].filter(Boolean).join(' · ') : ''; };
  const valideParMoi = function (b) { return !!S.session && b.traite_par_id === S.session.id && !!S.session.id; };
  const cleUser = function () { return (S.session.id || (S.session.site + '_' + S.session.nom)).toLowerCase(); };
  const initiales = function (n) { return String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join(''); };
  const parId = function (id) { return S.besoins.find(function (b) { return b.id === id; }); };
  const cat = function (code) { return CATS.find(function (c) { return c.code === code; }) || { code: code, libelle: code, ico: 'package', couleur: '#6b7280', articles: [] }; };
  const qteRetenue = function (b) { return b.statut === 'VALIDE' ? Number(b.quantite_validee) || 0 : b.statut === 'REJETE' ? 0 : Number(b.quantite) || 0; };
  const somme = function (l, f) { return l.reduce(function (s, x) { return s + (Number(f(x)) || 0); }, 0); };
  const estCaisse = function () { return !(posteDef(S.session.poste) || {}).siege; };

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

  // Date limite de saisie : { d, j } (j = jours restants) ou null.
  function dateLimite() {
    const d = C.DATE_LIMITE ? new Date(C.DATE_LIMITE + 'T23:59:59') : null;
    if (!d || isNaN(d)) return null;
    return { d: d, j: Math.ceil((d - Date.now()) / 864e5) };
  }

  // Popup de confirmation : confirmer({ titre, texte, extra, ok, okIco, annuler, ico, ton: 'info'|'danger'|'success' }) → Promise<boolean>
  let cfResolve = null;
  function confirmer(o) {
    return new Promise(function (res) {
      if (cfResolve) cfResolve(false);
      cfResolve = res;
      const ton = o.ton || 'info';
      $('#cf').className = 'cf cf-' + ton;
      $('#cfIc').innerHTML = ico(o.ico || 'circle-help');
      $('#cfT').textContent = o.titre || '';
      $('#cfP').innerHTML = o.texte || '';
      $('#cfX').innerHTML = o.extra || '';
      $('#cfX').hidden = !o.extra;
      $('#cfOk').className = 'btn ' + (ton === 'danger' ? 'bdg' : ton === 'success' ? 'bsc' : 'bp');
      $('#cfOk').innerHTML = (o.okIco ? ico(o.okIco) : '') + esc(o.ok || 'Confirmer');
      $('#cfNo').innerHTML = (o.annulerIco ? ico(o.annulerIco) : '') + esc(o.annuler || 'Annuler');
      $('#cf').hidden = false;
      document.body.classList.add('cf-on');
      icones();
      setTimeout(function () { $('#cfOk').focus(); }, 40);
    });
  }
  function fermerConfirm(v) {
    $('#cf').hidden = true;
    document.body.classList.remove('cf-on');
    if (cfResolve) { const r = cfResolve; cfResolve = null; r(v); }
  }
  function initConfirm() {
    $('#cfOk').addEventListener('click', function () { fermerConfirm(true); });
    $('#cfNo').addEventListener('click', function () { fermerConfirm(false); });
    $('#cf').addEventListener('click', function (e) { if (e.target === $('#cf')) fermerConfirm(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#cf').hidden) { e.stopImmediatePropagation(); fermerConfirm(false); } }, true);
  }

  const memoire = {
    lire: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mode privé */ } },
    effacer: function (k) { try { localStorage.removeItem(k); } catch (e) { /* mode privé */ } },
  };
  const clePanier = function () { return 'bud27_panier_' + cleUser(); };
  const typesDe = function (code) { return cat(code).types || C.TYPES_BESOIN; };

  /* ================= Connexion ================= */
  // En agence : Poste → Site → Identité (accès direct).
  // Au siège  : Poste → Identité → Code reçu par e-mail (le site est toujours le SIEGE, pas d'étape « site »).

  const L = { etape: 1, poste: null, site: '', nom: '', annuaire: null, minuteur: null, expire: 0 };
  const posteDef = function (lib) { return C.POSTES.find(function (p) { return p.libelle === lib; }); };

  function initConnexion() {
    $$('[data-cfg]').forEach(function (el) { el.textContent = C[el.dataset.cfg] || ''; });
    document.title = C.APP_TITRE + ' — QFS';
    $('#lgConf').hidden = Store.configure;
    const carte = function (p) {
      return '<button type="button" class="lg-role" data-poste="' + esc(p.libelle) + '"><span class="lg-role-i">' + ico(p.ico || 'user') + '</span>' +
        '<b>' + esc(p.libelle) + '</b></button>';
    };
    $('#lgRolesSite').innerHTML = C.POSTES.filter(function (p) { return !p.siege; }).map(carte).join('');
    $('#lgRolesSiege').innerHTML = C.POSTES.filter(function (p) { return p.siege; }).map(carte).join('');
    const dl = dateLimite();
    $('#lgDl').hidden = !dl;
    if (dl) {
      $('#lgDl').innerHTML = ico('calendar-clock') + '<span>' + (dl.j < 0 ? 'Saisie close depuis le <b>' + fDate(dl.d) + '</b>.'
        : 'Saisie ouverte jusqu\'au <b>' + fDate(dl.d) + '</b>' + (dl.j === 0 ? " — c'est aujourd'hui !" : ' — encore ' + dl.j + ' jour(s).')) + '</span>';
    }
    dessinerGrille('');
    icones();

    $('#lgPoste').addEventListener('click', function (e) {
      const b = e.target.closest('[data-poste]');
      if (!b) return;
      L.poste = posteDef(b.dataset.poste);
      L.site = L.poste.siege ? C.SITE_SIEGE : '';
      etapeConnexion(L.poste.siege ? 3 : 2);
    });
    $('#lgSearch').addEventListener('input', function (e) { dessinerGrille(e.target.value); });
    $('#lgSearch').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const premier = $('#lgGrid .lg-pdv');
      if (premier) premier.click();
    });
    $('#lgGrid').addEventListener('click', function (e) {
      const b = e.target.closest('[data-site]');
      if (!b) return;
      L.site = b.dataset.site;
      etapeConnexion(3);
    });
    $$('#login [data-back]').forEach(function (b) {
      b.addEventListener('click', function () { arreterMinuteur(); etapeConnexion(Number(b.dataset.back)); });
    });
    $('#lgNomForm').addEventListener('submit', function (e) { e.preventDefault(); connexionSite(); });
    $('#lgAgents').addEventListener('click', function (e) {
      const b = e.target.closest('[data-agent]');
      if (b) connexionSite(b.dataset.agent);
    });
    $('#lgPasLa').addEventListener('click', function () { afficherNomLibre(true); });
    $('#lgListe').addEventListener('click', function () {
      $('#lgConnus').hidden = false;
      $('#lgNomForm').hidden = true;
      $('#lgQuiH').innerHTML = enteteQui() + ' — touchez votre nom.';
    });
    $('#lgPeople').addEventListener('click', function (e) {
      const b = e.target.closest('[data-nom]');
      if (!b) return;
      L.nom = b.dataset.nom;
      demanderCode();
    });
    const cases = $$('#otpBox input');
    cases.forEach(function (inp, k) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/\D/g, '').slice(-1);
        $('#otpBox').classList.remove('err');
        if (inp.value && k < 3) cases[k + 1].focus();
        if (cases.every(function (c) { return c.value; })) verifierCode();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && k > 0) cases[k - 1].focus();
      });
      inp.addEventListener('paste', function (e) {
        const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 4);
        if (t.length < 2) return;
        e.preventDefault();
        cases.forEach(function (c, i) { c.value = t[i] || ''; });
        if (t.length === 4) verifierCode(); else cases[t.length].focus();
      });
    });
    $('#lgOtp').addEventListener('submit', function (e) { e.preventDefault(); verifierCode(); });
    $('#otpRenvoi').addEventListener('click', function () { demanderCode(); });
  }

  function dessinerGrille(q) {
    const n = sansAccents(q).trim();
    const sites = sitesDe(L.poste && L.poste.libelle).filter(function (p) { return !n || sansAccents(p).includes(n); });
    $('#lgGrid').innerHTML = sites.length
      ? sites.map(function (p) { return '<button type="button" class="lg-pdv" data-site="' + esc(p) + '">' + esc(p) + '</button>'; }).join('')
      : '<div class="lg-none">Aucun site ne correspond à « ' + esc(q) + ' ».</div>';
  }

  const enteteQui = function () { return '<b>' + esc(L.poste.libelle) + '</b> · <b>' + esc(L.site) + '</b>'; };

  async function etapeConnexion(n) {
    L.etape = n;
    $('#lgErr').textContent = '';
    const siege = !!(L.poste && L.poste.siege);
    $('#lgPoste').hidden = n !== 1 || !Store.configure;
    $('#lgSteps').hidden = !Store.configure;
    $('#lgSite').hidden = n !== 2;
    $('#lgQui').hidden = n !== 3;
    $('#lgOtp').hidden = n !== 4;
    $('#lgStp2').textContent = siege ? 'Identité' : 'Site';
    $('#lgStp3').textContent = siege ? 'Code' : 'Identité';
    const pas = siege && n > 1 ? n - 1 : Math.min(n, 3);
    $$('#lgSteps li').forEach(function (li) {
      const k = Number(li.dataset.s);
      li.classList.toggle('on', k === pas);
      li.classList.toggle('ok', k < pas);
    });
    if (n === 2) {
      $('#lgSiteH').innerHTML = 'Poste <b>' + esc(L.poste.libelle) + '</b> — choisissez votre site parmi les ' + sitesDe(L.poste.libelle).length + '.';
      $('#lgSearch').value = '';
      dessinerGrille('');
      if (window.innerWidth > 700) setTimeout(function () { $('#lgSearch').focus(); }, 50);
    }
    if (n === 3) {
      $('#lgQuiBack').dataset.back = siege ? '1' : '2';
      $('#lgQuiBack span').textContent = siege ? 'Changer de poste' : 'Changer de site';
      $('#lgQuiH').innerHTML = enteteQui() + (siege ? ' — choisissez votre nom : un code de connexion vous sera envoyé par e-mail.' : '');
      $('#lgPeople').hidden = !siege;
      $('#lgNomForm').hidden = true;
      $('#lgConnus').hidden = true;
      if (siege) await dessinerPersonnes();
      else await dessinerAgents();
    }
    icones();
  }

  async function dessinerPersonnes() {
    const box = $('#lgPeople');
    if (!L.annuaire) {
      box.innerHTML = '<div class="lg-none">Chargement…</div>';
      try {
        L.annuaire = (await Store.annuaire()).personnes || [];
      } catch (e) {
        box.innerHTML = '';
        $('#lgErr').textContent = e.message;
        return;
      }
    }
    const liste = L.annuaire.filter(function (p) { return p.poste === L.poste.libelle; });
    box.innerHTML = liste.length ? liste.map(function (p) {
      return '<button type="button" class="lg-pdv" data-nom="' + esc(p.nom) + '"><span class="lg-pin">' + esc(initiales(p.nom)) + '</span><span>' + esc(p.nom) + '<small>' + esc(p.email) + '</small></span></button>';
    }).join('') : '<div class="lg-none">Aucune personne enregistrée pour ce poste.</div>';
  }

  async function dessinerAgents() {
    let agents = [];
    $('#lgAgents').innerHTML = '<div class="lg-none">Chargement…</div>';
    $('#lgConnus').hidden = false;
    try {
      agents = (await Store.agentsSite({ poste: L.poste.libelle, site: L.site })).agents || [];
    } catch (e) {
      $('#lgErr').textContent = e.message;
    }
    L.agents = agents;
    if (!agents.length) { afficherNomLibre(false); return; }
    $('#lgQuiH').innerHTML = enteteQui() + ' — touchez votre nom.';
    $('#lgAgents').innerHTML = agents.map(function (n) {
      return '<button type="button" class="lg-pdv" data-agent="' + esc(n) + '"><span class="lg-pin">' + esc(initiales(n)) + '</span><span>' + esc(n) + '<small>C\'est moi</small></span></button>';
    }).join('');
    icones();
  }

  function afficherNomLibre(depuisListe) {
    $('#lgConnus').hidden = true;
    $('#lgNomForm').hidden = false;
    $('#lgListe').hidden = !(L.agents && L.agents.length);
    $('#lgQuiH').innerHTML = enteteQui() + (depuisListe ? ' — indiquez votre nom : il vous sera proposé aux prochaines connexions.' : ' — première connexion sur ce site : indiquez votre nom.');
    $('#lgNom').value = '';
    setTimeout(function () { $('#lgNom').focus(); }, 50);
  }

  async function connexionSite(nomChoisi) {
    const nom = (nomChoisi || $('#lgNom').value).trim();
    if (nom.length < 2) { $('#lgNom').classList.add('err'); $('#lgErr').textContent = 'Indiquez votre nom et prénom.'; return; }
    $('#lgNom').classList.remove('err');
    chargement(true);
    try {
      const r = await Store.connexionSite({ poste: L.poste.libelle, site: L.site, nom: nom });
      demarrerSession(Object.assign({ token: r.token }, r.session));
    } catch (e) {
      $('#lgErr').textContent = e.message;
    } finally {
      chargement(false);
    }
  }

  async function demanderCode() {
    chargement(true);
    $('#lgErr').textContent = '';
    try {
      const r = await Store.envoyerCode({ poste: L.poste.libelle, nom: L.nom });
      if (L.etape !== 4) etapeConnexion(4);
      $('#lgOtpWho').innerHTML = '<span class="lg-pin">' + esc(initiales(L.nom)) + '</span><span><b>' + esc(L.nom) + '</b><small>' + esc(L.poste.libelle) + ' · ' + esc(C.SITE_SIEGE) + '</small></span>';
      $('#lgOtpH').innerHTML = 'Un code à 4 chiffres vient d\'être envoyé à <b>' + esc(r.email) + '</b>. Saisissez-le ci-dessous (pensez à vérifier les courriers indésirables).';
      $$('#otpBox input').forEach(function (c) { c.value = ''; c.disabled = false; });
      $('#otpBox').classList.remove('err');
      $('#otpGo').disabled = false;
      demarrerMinuteur(r.expire || (Date.now() + C.OTP_MINUTES * 60000));
      setTimeout(function () { $('#otpBox input').focus(); }, 50);
    } catch (e) {
      if (L.etape !== 4) await etapeConnexion(L.etape);
      $('#lgErr').textContent = e.message;
    } finally {
      chargement(false);
    }
  }

  function demarrerMinuteur(expire) {
    arreterMinuteur();
    L.expire = expire;
    const tic = function () {
      const reste = Math.max(0, Math.round((L.expire - Date.now()) / 1000));
      const t = $('#otpTimer');
      if (reste <= 0) {
        arreterMinuteur();
        t.className = 'otp-t exp';
        t.textContent = 'Code expiré. Demandez un nouveau code pour continuer.';
        $$('#otpBox input').forEach(function (c) { c.value = ''; c.disabled = true; });
        $('#otpGo').disabled = true;
        return;
      }
      t.className = 'otp-t';
      t.innerHTML = 'Code valable encore <b>' + Math.floor(reste / 60) + ':' + p2(reste % 60) + '</b>';
    };
    tic();
    L.minuteur = setInterval(tic, 1000);
  }
  function arreterMinuteur() { clearInterval(L.minuteur); L.minuteur = null; }

  let verifEnCours = false;
  async function verifierCode() {
    if (verifEnCours) return;
    const code = $$('#otpBox input').map(function (c) { return c.value; }).join('');
    if (code.length !== 4) { $('#lgErr').textContent = 'Saisissez les 4 chiffres du code.'; return; }
    if (Date.now() > L.expire) { $('#lgErr').textContent = 'Code expiré. Demandez un nouveau code.'; return; }
    verifEnCours = true;
    chargement(true);
    $('#lgErr').textContent = '';
    try {
      const r = await Store.verifierCode({ poste: L.poste.libelle, nom: L.nom, code: code });
      arreterMinuteur();
      demarrerSession(Object.assign({ token: r.token }, r.session));
    } catch (e) {
      $('#lgErr').textContent = e.message;
      $('#otpBox').classList.add('err');
      $$('#otpBox input').forEach(function (c) { c.value = ''; });
      if (e.code === 'CODE_EXPIRE') { L.expire = 0; } else { $('#otpBox input').focus(); }
    } finally {
      verifEnCours = false;
      chargement(false);
    }
  }

  function afficherConnexion() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    document.body.className = '';
    arreterMinuteur();
    L.poste = null; L.site = ''; L.nom = '';
    etapeConnexion(1);
  }

  function demarrerSession(sess) {
    S.session = sess;
    memoire.ecrire(CLE_SESSION, sess);
    document.body.className = estBO() ? 'is-bo' : 'is-pdv';
    S.filtres = Object.assign({}, FILTRES_DEFAUT, { vue: estBO() ? 'a_valider' : 'tout' });
    S.panier = (memoire.lire(clePanier()) || []).filter(function (l) { return l && l.uid; });
    S.vue = null;
    NV.cat = CATS[0].code; NV.q = '';
    MES.statut = ''; MES.q = '';
    VAL.onglet = 'attente'; VAL.site = ''; VAL.cat = ''; VAL.q = '';
    $('#login').hidden = true;
    $('#app').hidden = false;
    initApp();
    actualiser();
    clearInterval(S.minuteur);
    if (C.ACTUALISATION_SECONDES > 0) {
      S.minuteur = setInterval(function () {
        const actif = document.activeElement;
        const enSaisie = actif && /INPUT|TEXTAREA|SELECT/.test(actif.tagName) && actif.closest('.main');
        if (!document.hidden && !S.ouvert && !enSaisie && $('#as').hidden) actualiser(true);
      }, C.ACTUALISATION_SECONDES * 1000);
    }
  }

  function deconnecter(message) {
    clearInterval(S.minuteur);
    if (S.session && !message) Store.deconnexion(S.session).catch(function () { /* déjà expirée */ });
    memoire.effacer(CLE_SESSION);
    fermerPanneau();
    fermerFiche();
    S.session = null;
    S.besoins = [];
    S.selection = {};
    S.premierChargement = false;
    S.filtres = Object.assign({}, FILTRES_DEFAUT);
    afficherConnexion();
    window.scrollTo(0, 0);
    toast(message || 'Vous êtes déconnecté.', message ? 'err' : 'ok');
  }

  /* ================= Application ================= */

  let appInitialisee = false;

  function initApp() {
    const bo = estBO();
    const ss = S.session;
    const caisse = estCaisse();
    $('#sbAv').textContent = initiales(ss.nom);
    $('#sbAv').className = 'sb-av' + (bo ? ' bo' : '');
    $('#sbName').textContent = ss.nom;
    $('#sbRole').textContent = ss.poste + ' · ' + ss.site;
    $('#sbMes').textContent = caisse ? 'Besoins du site' : 'Mes besoins';
    $('#bnMes').textContent = caisse ? 'Mon site' : 'Mes besoins';
    $('#nvHello').textContent = 'Bonjour ' + ss.nom;
    $('#mesExport').hidden = !Store.estExporteur(ss);
    $('#regTitle').textContent = estManager() ? 'Registre — besoins des responsables et des managers' : 'Registre — besoins validés par ' + ss.nom;
    $('#fVue').value = S.filtres.vue;
    $('#ftText').textContent = 'Quipux Financial Services — ' + C.APP_TITRE + ' · ' + new Date().getFullYear();
    rendreDateLimite();
    majCompteurPanier();
    icones();

    $('#fSite').innerHTML = '<option value="">Tous les sites</option>' +
      TOUS_SITES.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
    $('#fCat').innerHTML = '<option value="">Toutes</option>' +
      CATS.map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.libelle) + '</option>'; }).join('');
    $('#fType').innerHTML = '<option value="">Tous</option>' +
      C.TYPES_BESOIN.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    synchroniserFiltres();
    ['#nvSearch', '#mesSearch', '#valSearch'].forEach(function (k) { $(k).value = ''; });
    $('#valSite').value = ''; $('#valCat').value = '';
    rendreNouveau();
    // Lien direct (#tdb, #sec-art…) sinon écran d'accueil du poste.
    const cible = cibleHash();
    S.vueDemandee = !!cible;
    S.secCible = cible && cible.sec;
    allerVue(cible ? cible.vue : bo ? 'valider' : 'nouveau', { hist: cible ? false : 'replace' });

    if (appInitialisee) return;
    appInitialisee = true;
    initNouveau();
    initFiche();
    initMes();
    initValider();
    const nav = function (e) {
      const b = e.target.closest('[data-view]');
      if (b) allerVue(b.dataset.view);
    };
    $('#sbNav').addEventListener('click', nav);
    $('#bn').addEventListener('click', nav);
    document.addEventListener('click', function (e) {
      const g = e.target.closest('[data-goto]');
      if (g) allerVue(g.dataset.goto);
      const x = e.target.closest('[data-export]');
      if (x) exporterExcel();
    });
    window.addEventListener('popstate', surHash);
    window.addEventListener('hashchange', surHash);
    $('#tdbNav').addEventListener('click', function (e) {
      const a = e.target.closest('a[data-sec]');
      if (!a) return;
      e.preventDefault();
      try { history.replaceState(null, '', '#' + a.dataset.sec); } catch (x) { /* fichier local */ }
      allerSection(a.dataset.sec);
    });
    let rafNav = 0;
    window.addEventListener('scroll', function () {
      if (rafNav) return;
      rafNav = requestAnimationFrame(function () { rafNav = 0; majTdbNav(); });
    }, { passive: true });

    const surFiltre = function () { S.limite = PAR_PAGE; rendre(); };
    $('#fVue').addEventListener('change', function (e) { S.filtres.vue = e.target.value; S.selection = {}; surFiltre(); });
    $('#fSite').addEventListener('change', function (e) { S.filtres.site = e.target.value; surFiltre(); });
    $('#fCat').addEventListener('change', function (e) { S.filtres.cat = e.target.value; surFiltre(); });
    $('#fType').addEventListener('change', function (e) { S.filtres.type = e.target.value; surFiltre(); });
    $('#fReset').addEventListener('click', function () {
      S.filtres = Object.assign({}, FILTRES_DEFAUT, { vue: estBO() ? 'a_valider' : 'tout' });
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
      icones();
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
        if (b.statut !== 'EN_ATTENTE' || !peutDecider(b)) return;
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
      allerSection('sec-reg');
    });
    $('#sbToggle').addEventListener('click', function () { menu(!document.body.classList.contains('sb-open')); });
    $('#sbClose').addEventListener('click', function () { menu(false); });
    $('#sbOv').addEventListener('click', function () { menu(false); });
    $('#btnRefresh').addEventListener('click', function () { actualiser(); });
    $('#btnLogout').addEventListener('click', function () { deconnecter(); });

    $('#ov').addEventListener('click', fermerPanneau);
    $('#pClose').addEventListener('click', fermerPanneau);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fermerPanneau();
    });
  }

  function menu(ouvert) { document.body.classList.toggle('sb-open', ouvert); }

  function rendreDateLimite() {
    const b = $('#dlBanner');
    const dl = dateLimite();
    $('#sbCamp').textContent = dl ? (dl.j < 0 ? 'Saisie close' : 'Saisie jusqu\'au ' + fDate(dl.d)) : 'Expression des besoins';
    if (!dl) { b.hidden = true; return; }
    b.hidden = false;
    b.className = 'dl-banner' + (dl.j < 0 ? ' late' : '');
    b.innerHTML = ico(dl.j < 0 ? 'alarm-clock-off' : 'calendar-clock') + '<span>' + (dl.j < 0
      ? 'La date limite de saisie (' + fDate(dl.d) + ') est dépassée. Contactez votre responsable pour tout besoin urgent.'
      : 'Date limite de saisie des besoins ' + esc(C.CAMPAGNE) + ' : <b>' + fDate(dl.d) + '</b> — ' + (dl.j === 0 ? "c'est aujourd'hui" : 'encore ' + dl.j + ' jour(s)') + '.') + '</span>';
  }

  function synchroniserFiltres() {
    const f = S.filtres;
    $('#fVue').value = f.vue;
    $('#fSite').value = f.site;
    $('#fCat').value = f.cat;
    $('#fType').value = f.type;
    $('#srch').value = f.q;
    $('#tri').value = f.tri;
  }

  async function actualiser(silencieux) {
    if (!silencieux) chargement(true);
    $('#btnRefresh').classList.add('spin');
    try {
      const r = await Store.list(S.session);
      S.besoins = r.besoins || [];
      S.synchro = new Date();
      if (!S.premierChargement) {
        S.premierChargement = true;
        // Retour d'un agent qui a déjà envoyé des besoins (et rien en cours) : il arrive sur leur suivi.
        if (!estBO() && !S.vueDemandee && !S.panier.length && S.besoins.some(estMien)) S.vue = 'mes';
      }
      Object.keys(S.selection).forEach(function (id) {
        const b = parId(id);
        if (!b || b.statut !== 'EN_ATTENTE' || !peutDecider(b)) delete S.selection[id];
      });
      rendre();
      if (S.vue) allerVueSilencieux(S.vue);
      if (S.ouvert && S.ouvert !== '__groupe__') rendrePanneau();
      if (S.secCible) {
        const sec = S.secCible;
        S.secCible = null;
        setTimeout(function () { allerSection(sec); }, 120);
      }
    } catch (err) {
      if (err.code === 'SESSION_EXPIREE') {
        deconnecter('Session expirée : ' + err.message);
      } else if (!silencieux) {
        toast(err.message, 'err');
      }
    } finally {
      if (!silencieux) chargement(false);
      $('#btnRefresh').classList.remove('spin');
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

  function filtrer(options) {
    const o = options || {};
    const f = S.filtres;
    const b = bornes();
    return S.besoins.filter(function (x) {
      const d = date(x.cree_le);
      if (b[0] && (!d || d < b[0])) return false;
      if (b[1] && (!d || d > b[1])) return false;
      if (!o.ignorerSite && f.site && x.site !== f.site) return false;
      if (estBO() && !o.ignorerVue) {
        if (f.vue === 'a_valider' && !peutDecider(x)) return false;
        if (f.vue === 'valides_moi' && !(x.statut === 'VALIDE' && valideParMoi(x))) return false;
        if (f.vue === 'mes' && !estMien(x)) return false;
      }
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
    $('#pgMeta').textContent = C.CAMPAGNE + (S.filtres.site ? ' · Site : ' + S.filtres.site : '') + ' · Mis à jour à ' + fHeure(S.synchro);
    $('#tbSync').textContent = 'À jour · ' + fHeure(S.synchro);
    $('#tbSync').title = 'Données synchronisées le ' + fDateHeure(S.synchro);
    rendreProgression(st);
    rendreKpis(st);
    rendreGraphiques(liste);
    rendreTable(liste);
    if (estBO()) rendreSynthese(filtrer({ ignorerSite: true }));
    rendreArticles(liste);
    rendreMes();
    rendreValider();
    icones();
  }

  function rendreProgression(st) {
    const segs = ['VALIDE', 'REJETE', 'EN_ATTENTE'];
    $('#gPct').textContent = st.taux + '%';
    $('#swrap').innerHTML = segs.map(function (k) {
      const w = st.n ? (st[k] / st.n) * 100 : 0;
      return w ? '<div class="sw-seg" style="width:' + w + '%;background:' + STATUTS[k].couleur + '" title="' + STATUTS[k].pluriel + ' : ' + st[k] + '"></div>' : '';
    }).join('');
    $('#sLegend').innerHTML = segs.map(function (k) {
      return '<span class="sli"><span class="sd" style="background:' + STATUTS[k].couleur + '"></span>' + STATUTS[k].pluriel + ' : <b>' + st[k] + '</b></span>';
    }).join('');
    $('#psum').textContent = st.n
      ? st.traites + ' ligne(s) examinée(s) sur ' + st.n + ' — ' + st.EN_ATTENTE + ' encore en attente (' + nombre(st.qteAttente) + ' unité(s)).'
      : 'Aucun besoin pour les filtres choisis.';
  }

  function rendreKpis(st) {
    const k = function (icone, label, val, unite, couleur) {
      return '<div class="kc" style="--kc:' + couleur + '"><div class="kbi">' + ico(icone) + '</div><p class="kl">' + label + '</p>' +
        '<p class="kv">' + val + '</p><p class="ku">' + unite + '</p></div>';
    };
    const parCat = CATS.map(function (c) { return c.libelle + ' ' + nombre(somme(filtrer().filter(function (b) { return b.categorie === c.code; }), function (b) { return b.quantite; })); }).join(' · ');
    const aValider = S.besoins.filter(function (b) { return b.statut === 'EN_ATTENTE' && peutDecider(b); });
    $('#kpis').innerHTML = [
      k('package', 'Quantité demandée', nombre(st.qte), parCat, '#1d4ed8'),
      estBO()
        ? k('stamp', 'À valider par vous', nombre(aValider.length), aValider.length ? nombre(somme(aValider, function (b) { return b.quantite; })) + ' unité(s) en attente de votre décision' : 'rien en attente', '#9333ea')
        : k('shopping-cart', 'Demande non envoyée', nombre(S.panier.length), S.panier.length ? 'article(s) à envoyer pour validation' : 'rien en attente d\'envoi', '#9333ea'),
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
    Chart.defaults.color = '#64748b';
    Chart.defaults.borderColor = '#eef2f6';
    const legende = { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3, padding: 14 } };
    const infobulle = { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8, titleFont: { weight: '600' }, boxPadding: 4 };
    const actifs = liste.filter(function (b) { return b.statut !== 'REJETE'; });

    graphique('cCat', {
      type: 'bar',
      data: {
        labels: CATS.map(function (c) { return c.libelle; }),
        datasets: ORDRE_STATUTS.map(function (s) {
          return {
            label: STATUTS[s].pluriel,
            backgroundColor: STATUTS[s].couleur,
            borderRadius: 6,
            maxBarThickness: 56,
            data: CATS.map(function (c) { return somme(liste.filter(function (b) { return b.categorie === c.code && b.statut === s; }), function (b) { return b.quantite; }); }),
          };
        }),
      },
      options: { maintainAspectRatio: false, plugins: { legend: legende, tooltip: infobulle }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
    });

    graphique('cStatut', {
      type: 'doughnut',
      data: {
        labels: ORDRE_STATUTS.map(function (s) { return STATUTS[s].pluriel; }),
        datasets: [{ data: ORDRE_STATUTS.map(function (s) { return liste.filter(function (b) { return b.statut === s; }).length; }), backgroundColor: ORDRE_STATUTS.map(function (s) { return STATUTS[s].couleur; }), borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: legende, tooltip: infobulle } },
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
        datasets: [{ label: 'Quantité', data: top.map(function (x) { return x.q; }), backgroundColor: top.map(function (x) { return cat(x.k.split('|')[0]).couleur; }), borderRadius: 6, barThickness: 16 }],
      },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: infobulle }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
    });

    const coulTypes = ['#1d4ed8', '#ea580c', '#0891b2', '#9333ea', '#047857'];
    graphique('cType', {
      type: 'doughnut',
      data: {
        labels: C.TYPES_BESOIN,
        datasets: [{ data: C.TYPES_BESOIN.map(function (t) { return somme(actifs.filter(function (b) { return b.type_besoin === t; }), qteRetenue); }), backgroundColor: coulTypes, borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: legende, tooltip: infobulle } },
    });

    if (estBO()) {
      const ls = filtrer({ ignorerSite: true }).filter(function (b) { return b.statut !== 'REJETE'; });
      const sites = sitesConnus().map(function (p) { return { p: p, q: somme(ls.filter(function (b) { return b.site === p; }), qteRetenue) }; })
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
              label: c.libelle, backgroundColor: c.couleur, borderRadius: 4, barThickness: 14,
              data: sites.map(function (p) { return somme(ls.filter(function (b) { return b.site === p && b.categorie === c.code; }), qteRetenue); }),
            };
          }),
        },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: legende, tooltip: infobulle }, scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } },
      });
    }
  }

  function rendreTable(liste) {
    const f = S.filtres;
    let lignes = liste;
    const q = sansAccents(f.q).trim();
    if (q) {
      lignes = lignes.filter(function (b) {
        return sansAccents([b.id, b.ref, b.site, b.libelle, b.caracteristiques, b.etat_actuel, b.motif, b.demandeur, b.poste, b.type_besoin].join(' ')).includes(q);
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
        (bo ? '<td class="ck">' + (b.statut === 'EN_ATTENTE' && peutDecider(b) ? '<input type="checkbox" data-ck="' + esc(b.id) + '"' + (sel ? ' checked' : '') + ' aria-label="Sélectionner">' : '') + '</td>' : '') +
        '<td class="nw"><b>' + esc(b.id) + '</b></td>' +
        '<td class="nw">' + fDate(b.cree_le) + '<div class="sub">' + fHeure(b.cree_le) + '</div></td>' +
        (bo ? '<td class="nw"><b>' + esc(b.site) + '</b><div class="sub">' + esc(b.demandeur) + (b.poste ? ' · ' + esc(b.poste) : '') + '</div></td>' : '') +
        '<td>' + badgeCat(b.categorie) + '</td>' +
        '<td><b>' + esc(b.libelle) + '</b>' + (b.caracteristiques ? '<div class="sub clip" title="' + esc(b.caracteristiques) + '">' + esc(b.caracteristiques) + '</div>' : '') + '</td>' +
        '<td class="num"><span class="ib">' + nombre(b.quantite) + '</span></td>' +
        '<td class="ty">' + esc(b.type_besoin) + '</td>' +
        '<td>' + (equipTxt(b) ? esc(equipTxt(b)) : '<span class="z">—</span>') + '</td>' +
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
      const attente = visibles.filter(function (b) { return b.statut === 'EN_ATTENTE' && peutDecider(b); });
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
    const lignes = sitesConnus().map(function (p) {
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
    const m = {};
    actifs.forEach(function (b) {
      const k = b.categorie + '|' + b.libelle;
      if (!m[k]) m[k] = { categorie: b.categorie, libelle: b.libelle, sites: {}, n: 0, qte: 0, val: 0, att: 0 };
      const x = m[k];
      x.sites[b.site] = 1;
      x.n++;
      x.qte += Number(b.quantite) || 0;
      if (b.statut === 'VALIDE') x.val += Number(b.quantite_validee) || 0;
      if (b.statut === 'EN_ATTENTE') x.att += Number(b.quantite) || 0;
    });
    const tous = Object.keys(m).map(function (k) { return m[k]; });
    $('#artChips').innerHTML = [['', 'Toutes']].concat(CATS.map(function (c) { return [c.code, c.libelle]; })).map(function (c) {
      const n = c[0] ? tous.filter(function (x) { return x.categorie === c[0]; }).length : tous.length;
      return '<button type="button" class="fb' + (S.artCat === c[0] ? ' on' : '') + '" data-c="' + c[0] + '">' + c[1] + ' <i>' + n + '</i></button>';
    }).join('');
    const ordreCat = CATS.map(function (c) { return c.code; });
    const lignes = tous.filter(function (x) { return !S.artCat || x.categorie === S.artCat; })
      .sort(function (a, b) { return ordreCat.indexOf(a.categorie) - ordreCat.indexOf(b.categorie) || b.qte - a.qte; });
    const z = function (n) { return n ? nombre(n) : '<span class="z">0</span>'; };
    const repartition = function (x) {
      const pv = x.qte ? x.val / x.qte * 100 : 0;
      const pa = x.qte ? x.att / x.qte * 100 : 0;
      return '<div class="rep" title="Validé : ' + nombre(x.val) + ' · En attente : ' + nombre(x.att) + ' · Non retenu : ' + nombre(Math.max(0, x.qte - x.val - x.att)) + '">' +
        '<div class="rep-b"><span style="width:' + pv + '%;background:#047857"></span><span style="width:' + pa + '%;background:#ea580c"></span></div>' +
        '<span class="rep-p">' + Math.round(pv) + '%</span></div>';
    };
    $('#tArt tbody').innerHTML = lignes.length ? lignes.map(function (x) {
      const c = cat(x.categorie);
      return '<tr data-lib="' + esc(x.libelle) + '" title="Voir les lignes de cet article dans le registre">' +
        '<td><span class="art-n" style="--c:' + c.couleur + '"><span class="dl-ic">' + ico(icoArticle(x.libelle, x.categorie)) + '</span><b>' + esc(x.libelle) + '</b></span></td>' +
        '<td>' + badgeCat(x.categorie) + '</td>' +
        '<td class="num">' + Object.keys(x.sites).length + '</td>' +
        '<td class="num">' + x.n + '</td><td class="num"><b>' + nombre(x.qte) + '</b></td>' +
        '<td class="num">' + z(x.val) + '</td><td class="num">' + z(x.att) + '</td><td>' + repartition(x) + '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="nd">' + ico('package-open') + 'Aucun article pour ces filtres.</div></td></tr>';
    const tot = { qte: somme(lignes, function (x) { return x.qte; }), val: somme(lignes, function (x) { return x.val; }), att: somme(lignes, function (x) { return x.att; }), n: somme(lignes, function (x) { return x.n; }) };
    const sites = {};
    lignes.forEach(function (x) { Object.keys(x.sites).forEach(function (s) { sites[s] = 1; }); });
    $('#tArt tfoot').innerHTML = lignes.length ? '<tr><td>Total · ' + lignes.length + ' article(s)</td><td></td><td class="num">' + Object.keys(sites).length + '</td><td class="num">' + tot.n + '</td>' +
      '<td class="num">' + nombre(tot.qte) + '</td><td class="num">' + nombre(tot.val) + '</td><td class="num">' + nombre(tot.att) + '</td><td>' + repartition(tot) + '</td></tr>' : '';
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
        it('Poste', esc(b.poste)) + it('Validation par', esc(valideurTxt(b))) +
        (equipTxt(b) ? it('Année d\'acquisition de l\'équipement actuel', esc(b.annee_acquisition)) + it('État de l\'équipement actuel', esc(b.etat_actuel)) : '') +
      '</div><p class="pil" style="margin:12px 0 6px">Motif</p><div class="ptx">' + esc(b.motif) + '</div>' +
      '</div>' +
      (b.statut !== 'EN_ATTENTE'
        ? '<div class="ps"><h3 class="pst">Décision</h3><div class="pg">' +
          it('Décision', badgeStatut(b.statut)) + it('Quantité validée', b.statut === 'VALIDE' ? '<b>' + nombre(b.quantite_validee) + '</b>' : '') +
          it('Par', esc(b.traite_par) + (b.traite_par_poste ? ' <span class="z">(' + esc(b.traite_par_poste) + ')</span>' : '')) + it('Le', fDateHeure(b.maj_le)) +
          (b.commentaire_bo ? it('Commentaire', esc(b.commentaire_bo), true) : '') + '</div></div>'
        : '');

    if (peutDecider(b)) {
      $('#pForm').innerHTML = formDecision(b.statut === 'EN_ATTENTE' ? 'VALIDE' : b.statut, b.quantite_validee !== '' ? b.quantite_validee : b.quantite, b.commentaire_bo, true);
      brancherDecision([b.id]);
    } else if (b.statut === 'EN_ATTENTE' && estMien(b)) {
      $('#pForm').innerHTML = '<div class="ps"><h3 class="pst">Modifier</h3><p class="cs" style="margin-bottom:6px">Validation par ' + esc(valideurTxt(b)) + '.</p><p class="cs" style="margin-bottom:12px">Ce besoin n\'a pas encore été examiné : vous pouvez le retirer puis le ressaisir si nécessaire.</p>' +
        '<button type="button" class="btn btn-danger" id="pRetirer">' + ico('trash-2') + 'Retirer ce besoin</button></div>';
      $('#pRetirer').addEventListener('click', function () { retirer(b); });
    } else if (b.statut === 'EN_ATTENTE') {
      $('#pForm').innerHTML = '<div class="ps"><p class="cs">En attente de validation par ' + esc(valideurTxt(b)) + '.</p></div>';
    } else {
      $('#pForm').innerHTML = '';
    }
    icones();
  }

  function formDecision(statut, qte, commentaire, unitaire) {
    return '<form class="ps" id="decForm" novalidate><h3 class="pst">' + (unitaire ? 'Décision' : 'Décision groupée') + '</h3>' +
      '<div class="dec">' +
        '<label class="d-ok"><input type="radio" name="dst" value="VALIDE"' + (statut === 'VALIDE' ? ' checked' : '') + '><span>' + ico('check') + 'Valider</span></label>' +
        '<label class="d-ko"><input type="radio" name="dst" value="REJETE"' + (statut === 'REJETE' ? ' checked' : '') + '><span>' + ico('x') + 'Rejeter</span></label>' +
        '<label class="d-at"><input type="radio" name="dst" value="EN_ATTENTE"' + (statut === 'EN_ATTENTE' ? ' checked' : '') + '><span>' + ico('undo-2') + 'Remettre en attente</span></label>' +
      '</div>' +
      (unitaire ? '<div id="decQteW"><label class="fl" for="decQte">Quantité validée</label><input class="in" id="decQte" type="number" min="0" step="1" value="' + esc(qte) + '" style="max-width:160px"></div>'
        : '<p class="cs" style="margin-top:10px">En validation groupée, la quantité validée est égale à la quantité demandée de chaque ligne.</p>') +
      '<label class="fl" for="decCom">Commentaire <small id="decComReq"></small></label><textarea class="in" id="decCom" rows="3" placeholder="Ex. : validé pour le budget 2027, à livrer au T1…">' + esc(commentaire || '') + '</textarea>' +
      '<p class="cs" style="margin-top:10px">Décision enregistrée au nom de <b>' + esc(S.session.nom) + '</b> (' + esc(S.session.poste) + ').</p>' +
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
      const err = $('#decErr');
      err.textContent = '';
      if (!statut) { err.textContent = 'Choisissez une décision.'; return; }
      if (statut === 'REJETE' && !com) { err.textContent = 'Indiquez le motif du rejet.'; $('#decCom').focus(); return; }
      const data = { ids: ids, statut: statut, commentaire: com };
      if ($('#decQte') && statut === 'VALIDE') {
        const q = Number($('#decQte').value);
        if (!(q >= 0) || $('#decQte').value === '') { err.textContent = 'Quantité validée invalide.'; return; }
        data.quantite_validee = Math.round(q);
      }
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
    $('#pId').textContent = S.session.poste + ' · ' + ids.length + ' ligne(s)';
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
    const ok = await confirmer({
      ton: 'danger', ico: 'trash-2', titre: 'Retirer ce besoin ?',
      texte: '« <b>' + esc(b.libelle) + '</b> » (× ' + nombre(b.quantite) + ', demande ' + esc(b.ref) + ') sera retiré et ne sera pas examiné.',
      ok: 'Retirer le besoin', okIco: 'trash-2', annuler: 'Annuler',
    });
    if (!ok) return;
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

  /* ================= Navigation entre les vues (avec liens directs #vue) ================= */

  const VUES = {
    nouveau: 'Exprimer un besoin',
    mes: 'Mes besoins',
    valider: 'À valider',
    tdb: 'Tableau de bord',
  };
  const SECTIONS_TDB = ['sec-kpi', 'sec-graph', 'sec-reg', 'sec-synth', 'sec-art'];

  // #nouveau, #mes, #valider, #tdb ou une section du tableau de bord (#sec-art…).
  function cibleHash() {
    let h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { h = ''; }
    if (VUES[h]) return { vue: h };
    if (SECTIONS_TDB.indexOf(h) >= 0) return { vue: 'tdb', sec: h };
    return null;
  }

  function surHash() {
    if (!S.session) return;
    const c = cibleHash();
    if (!c) return;
    if (c.vue !== S.vue) allerVue(c.vue, { hist: false });
    if (c.sec) allerSection(c.sec);
  }

  function allerSection(id) {
    const el = document.getElementById(id);
    if (!el || $('.view[data-view="tdb"]').hidden) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function majTdbNav() {
    if (S.vue !== 'tdb') return;
    const lim = $('#tdbNav').getBoundingClientRect().bottom + 24;
    const visibles = SECTIONS_TDB.filter(function (id) { const el = document.getElementById(id); return el && el.offsetParent !== null; });
    let cur = visibles[0];
    visibles.forEach(function (id) { if (document.getElementById(id).getBoundingClientRect().top <= lim) cur = id; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = visibles[visibles.length - 1];
    $$('#tdbNav a').forEach(function (a) { a.classList.toggle('on', a.dataset.sec === cur); });
  }

  function allerVueSilencieux(v) {
    if ($('.view[data-view="' + v + '"]').hidden) allerVue(v, { hist: 'replace' });
  }

  // o.hist : 'push' (par défaut, bouton Précédent du navigateur), 'replace', ou false (l'adresse est déjà la bonne).
  function allerVue(v, o) {
    const opt = o || {};
    if (!estBO() && (v === 'valider' || v === 'tdb')) v = 'nouveau';
    S.vue = v;
    $$('.view').forEach(function (s) { s.hidden = s.dataset.view !== v; });
    $$('#sbNav [data-view], #bn [data-view]').forEach(function (b) { b.classList.toggle('on', b.dataset.view === v); });
    $('#bcVue').textContent = v === 'mes' ? $('#sbMes').textContent : VUES[v];
    const hist = opt.hist === undefined ? 'push' : opt.hist;
    const c = cibleHash();
    try {
      if (hist && location.hash !== '#' + v) history[hist === 'push' ? 'pushState' : 'replaceState'](null, '', '#' + v);
      else if (!hist && !(c && c.vue === v)) history.replaceState(null, '', '#' + v);
    } catch (e) { /* fichier local */ }
    menu(false);
    window.scrollTo(0, 0);
    if (v === 'nouveau') majBarreMobile();
    if (v === 'tdb') { Object.keys(S.charts).forEach(function (k) { S.charts[k].resize(); }); majTdbNav(); }
    icones();
  }

  const ICONES_ARTICLES = [
    [/[ée]cran/i, 'monitor'], [/^bureau/i, 'lamp-desk'], [/portable/i, 'laptop'], [/unit[ée] centrale|bureau$/i, 'cpu'], [/clavier/i, 'keyboard'],
    [/souris/i, 'mouse'], [/batterie/i, 'battery-charging'], [/chargeur/i, 'plug-zap'], [/imprimante/i, 'printer'],
    [/scanner/i, 'scan-line'], [/serveur/i, 'server'], [/disque|stockage/i, 'hard-drive'], [/onduleur/i, 'zap'],
    [/multiprise/i, 'plug'], [/wifi/i, 'wifi'], [/support/i, 'laptop'],
    [/caisson/i, 'archive'], [/caissette/i, 'box'], [/si[èe]ge|chaise|fauteuil/i, 'armchair'],
    [/chasuble|polo|tee/i, 'shirt'], [/coffre/i, 'vault'], [/billet/i, 'banknote'], [/tablette/i, 'tablet'],
    [/t[ée]l[ée]phone|fourreau|protection/i, 'smartphone'],
  ];
  const icoArticle = function (lib, catCode) {
    const t = ICONES_ARTICLES.find(function (x) { return x[0].test(lib); });
    return t ? t[1] : cat(catCode).ico || 'package';
  };

  /* ================= Vue « Exprimer un besoin » : catalogue, fiche article, demande ================= */
  // Un clic sur un article ouvre sa fiche (quantité, type, équipement actuel, motif) : l'article
  // n'entre dans « Ma demande » qu'une fois complet. Un article déjà ajouté se rouvre pour être modifié.

  const NV = { cat: CATS[0].code, q: '' };
  const AIDE_TYPES = {
    'Nouvelle Acquisition': ['sparkles', 'Équipement supplémentaire ou pour un nouveau poste'],
    'Remplacement Équipement Défectueux': ['wrench', 'L\'équipement actuel est en panne ou défectueux'],
    'Renouvellement': ['refresh-cw', 'L\'équipement actuel est ancien ou usé'],
  };
  const avecEquipement = function (l) { return C.TYPES_EQUIPEMENT_ACTUEL.indexOf(l.type_besoin) >= 0; };
  const manques = function (l) {
    const m = [];
    if (!String(l.libelle || '').trim()) m.push("l'article");
    if (!(Number(l.quantite) > 0)) m.push('la quantité');
    if (!l.type_besoin) m.push('le type');
    if (avecEquipement(l)) {
      const a = Number(l.annee_acquisition);
      if (!(a >= 1980 && a <= new Date().getFullYear())) m.push("l'année d'acquisition");
      if (!l.etat_actuel) m.push("l'état actuel");
    }
    if (!String(l.motif || '').trim()) m.push('le motif');
    return m;
  };
  const nouvelUid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  function initNouveau() {
    $('#nvCats').addEventListener('click', function (e) {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      NV.cat = b.dataset.cat;
      NV.q = '';
      $('#nvSearch').value = '';
      rendreCatalogue();
    });
    $('#nvSearch').addEventListener('input', function (e) { NV.q = e.target.value; rendreCatalogue(); });
    $('#nvTiles').addEventListener('click', function (e) {
      const t = e.target.closest('[data-art]');
      if (!t) return;
      if (t.dataset.art === AUTRE) { ouvrirFiche(null, { categorie: t.dataset.cat, libelle: '', autre: true }); return; }
      const ex = S.panier.find(function (l) { return l.categorie === t.dataset.cat && l.libelle === t.dataset.art; });
      ouvrirFiche(ex || null, { categorie: t.dataset.cat, libelle: t.dataset.art });
    });
    $('#demVider').addEventListener('click', async function () {
      const n = S.panier.length;
      const ok = await confirmer({
        ton: 'danger', ico: 'trash-2', titre: 'Vider votre demande ?',
        texte: 'Les <b>' + n + ' article' + (n > 1 ? 's' : '') + '</b> de votre demande seront retirés, avec les informations déjà saisies.',
        extra: recapHtml(S.panier), ok: 'Oui, tout retirer', okIco: 'trash-2', annuler: 'Garder ma demande',
      });
      if (!ok) return;
      S.panier = [];
      sauverPanier();
      rendreNouveau();
      toast('Votre demande a été vidée.');
    });
    $('#demEnvoyer').addEventListener('click', envoyerDemande);
    $('#nvBar').addEventListener('click', function () { $('#nvDem').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    window.addEventListener('resize', majBarreMobile);
    $('#demLignes').addEventListener('click', function (e) {
      const el = e.target.closest('[data-act]');
      const ligne = e.target.closest('[data-uid]');
      const l = ligne && S.panier.find(function (x) { return String(x.uid) === ligne.dataset.uid; });
      if (!el || !l) return;
      if (el.dataset.act === 'rm') retirerLigne(l);
      else if (el.dataset.act === 'edit') ouvrirFiche(l);
    });
  }

  function rendreNouveau() {
    rendreCatalogue();
    rendreDemande();
    majBarreMobile();
  }

  function rendreCatalogue() {
    const dans = {};
    S.panier.forEach(function (l) {
      const k = l.categorie + '|' + l.libelle;
      dans[k] = (dans[k] || 0) + (Number(l.quantite) || 0);
    });
    $('#nvCats').innerHTML = CATS.map(function (c) {
      const n = S.panier.filter(function (l) { return l.categorie === c.code; }).length;
      return '<button type="button" role="tab" aria-selected="' + (!NV.q && NV.cat === c.code) + '" class="seg-b' + (!NV.q && NV.cat === c.code ? ' on' : '') + '" data-cat="' + c.code + '" style="--c:' + c.couleur + '">' +
        ico(c.ico) + esc(c.libelle) + (n ? '<i>' + n + '</i>' : '') + '</button>';
    }).join('');
    const q = sansAccents(NV.q).trim();
    const tuiles = [];
    CATS.forEach(function (c) {
      if (!q && c.code !== NV.cat) return;
      c.articles.forEach(function (a) {
        if (q && !sansAccents(a).includes(q)) return;
        tuiles.push({ c: c, a: a });
      });
    });
    $('#nvAide').textContent = q ? tuiles.length + ' article(s) pour « ' + NV.q.trim() + ' »' : cat(NV.cat).aide || '';
    const tuile = function (t) {
      const n = dans[t.c.code + '|' + t.a] || 0;
      return '<button type="button" class="tile' + (n ? ' in' : '') + '" data-cat="' + t.c.code + '" data-art="' + esc(t.a) + '" style="--c:' + t.c.couleur + '"' +
        ' aria-pressed="' + (n ? 'true' : 'false') + '" title="' + (n ? 'Modifier ou retirer cet article' : 'Ajouter à ma demande') + '">' +
        '<span class="tile-ck">' + ico('check') + '</span>' +
        '<span class="tile-ic">' + ico(icoArticle(t.a, t.c.code)) + '</span>' +
        '<span class="tile-n">' + esc(t.a) + '</span>' +
        (q ? '<span class="tile-c">' + esc(t.c.libelle) + '</span>' : '') +
        (n ? '<span class="tile-a"><span class="a-on">' + ico('check') + 'Ajouté · ' + nombre(n) + '</span><span class="a-off">' + ico('pencil') + 'Modifier</span></span>'
          : '<span class="tile-a">' + ico('plus') + 'Ajouter</span>') + '</button>';
    };
    const autres = (q ? [] : [cat(NV.cat)]).map(function (c) {
      return '<button type="button" class="tile tile-o" data-cat="' + c.code + '" data-art="' + AUTRE + '" style="--c:' + c.couleur + '">' +
        '<span class="tile-ic">' + ico('pencil-line') + '</span><span class="tile-n">Autre article</span>' +
        '<span class="tile-a">' + ico('plus') + 'Préciser</span></button>';
    });
    $('#nvTiles').innerHTML = tuiles.length || autres.length
      ? tuiles.map(tuile).join('') + autres.join('')
      : '<div class="nd" style="grid-column:1/-1">' + ico('search-x') + 'Aucun article ne correspond à « ' + esc(NV.q) + ' ».<button type="button" class="btn bo btn-sm" id="nvAutre">' + ico('pencil-line') + 'Demander un autre article</button></div>';
    const autre = $('#nvAutre');
    if (autre) autre.addEventListener('click', function () { ouvrirFiche(null, { categorie: NV.cat, libelle: NV.q.trim(), autre: true }); });
    icones();
  }

  function flashLigne(uid) {
    const el = $('#demLignes [data-uid="' + uid + '"]');
    if (!el) return;
    if (window.innerWidth > 1024) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function recapHtml(lignes) {
    return '<div class="cf-l">' + lignes.map(function (l) {
      const c = cat(l.categorie);
      return '<div class="cf-li" style="--c:' + c.couleur + '"><span class="dl-ic">' + ico(icoArticle(l.libelle, l.categorie)) + '</span>' +
        '<span class="cf-ln"><b>' + esc(l.libelle || 'Article à préciser') + '</b><small>' + esc(c.libelle) + (l.type_besoin ? ' · ' + esc(l.type_besoin) : '') + '</small></span>' +
        '<span class="cf-lq">× ' + nombre(l.quantite) + '</span></div>';
    }).join('') + '</div>';
  }

  async function retirerLigne(l) {
    const rempli = l.type_besoin || String(l.motif || '').trim() || l.annee_acquisition || String(l.caracteristiques || '').trim();
    if (rempli) {
      const ok = await confirmer({
        ton: 'danger', ico: 'circle-minus', titre: 'Retirer cet article ?',
        texte: '« <b>' + esc(l.libelle || 'Article à préciser') + '</b> » sera retiré de votre demande, avec les informations saisies.',
        ok: 'Retirer', okIco: 'trash-2', annuler: 'Garder',
      });
      if (!ok) return false;
    }
    S.panier = S.panier.filter(function (x) { return x !== l; });
    sauverPanier();
    rendreNouveau();
    toast('« ' + (l.libelle || 'Article') + ' » retiré de votre demande.');
    return true;
  }

  /* ---------- Fiche article ---------- */

  const AS = { l: null, uid: null, essai: false };

  function initFiche() {
    $('#asForm').addEventListener('submit', function (e) { e.preventDefault(); validerFiche(); });
    $('#asX').addEventListener('click', fermerFiche);
    $('#asNo').addEventListener('click', fermerFiche);
    $('#as').addEventListener('click', function (e) { if (e.target === $('#as')) fermerFiche(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#as').hidden && $('#cf').hidden) { e.stopImmediatePropagation(); fermerFiche(); }
    }, true);
    $('#asDel').addEventListener('click', async function () {
      const l = S.panier.find(function (x) { return x.uid === AS.uid; });
      if (l && await retirerLigne(l)) fermerFiche();
    });
    const box = $('#asB');
    box.addEventListener('click', function (e) {
      const el = e.target.closest('[data-act]');
      if (!el || !AS.l) return;
      const l = AS.l;
      const act = el.dataset.act;
      if (act === 'moins' || act === 'plus') {
        l.quantite = Math.max(1, (parseInt(l.quantite, 10) || 1) + (act === 'plus' ? 1 : -1));
        $('#asB [data-f="quantite"]').value = l.quantite;
        majPiedFiche();
      } else if (act === 'type') {
        l.type_besoin = el.dataset.v;
        rendreFiche();
      } else if (act === 'etat') {
        l.etat_actuel = el.dataset.v;
        rendreFiche();
      } else if (act === 'motif') {
        const m = el.dataset.v;
        l.motif = String(l.motif || '').trim() ? String(l.motif).trim() + ' — ' + m : m;
        const t = $('#asMotif');
        t.value = l.motif;
        t.classList.remove('err');
        majPiedFiche();
      }
    });
    box.addEventListener('input', function (e) {
      const f = e.target.dataset.f;
      if (!f || !AS.l) return;
      AS.l[f] = f === 'quantite' ? Math.max(1, parseInt(e.target.value, 10) || 1) : e.target.value;
      e.target.classList.remove('err');
      if (f === 'libelle') $('#asT').textContent = e.target.value.trim() || 'Autre article';
      majPiedFiche();
    });
    box.addEventListener('change', function (e) {
      if (e.target.dataset.f === 'quantite' && AS.l) e.target.value = AS.l.quantite;
    });
  }

  function ouvrirFiche(ligne, nouveau) {
    AS.uid = ligne ? ligne.uid : null;
    AS.essai = !!(ligne && manques(ligne).length);
    AS.l = Object.assign({ quantite: 1, type_besoin: '', caracteristiques: '', motif: '', annee_acquisition: '', etat_actuel: '', libelle: '', autre: false }, ligne || nouveau);
    const c = cat(AS.l.categorie);
    $('#as').style.setProperty('--c', c.couleur);
    $('#asIc').innerHTML = ico(AS.l.autre ? 'pencil-line' : icoArticle(AS.l.libelle, AS.l.categorie));
    $('#asC').textContent = c.libelle;
    $('#asT').textContent = AS.l.libelle || 'Autre article';
    $('#asDel').hidden = !ligne;
    $('#asOk').innerHTML = ligne ? ico('check') + 'Enregistrer' : ico('plus') + 'Ajouter à ma demande';
    rendreFiche();
    $('#as').hidden = false;
    $('#asB').scrollTop = 0;
    document.body.classList.add('as-on');
    majFlow();
    icones();
    setTimeout(function () {
      const lib = $('#asB [data-f="libelle"]');
      if (lib && !lib.value) lib.focus();
      else if (window.innerWidth > 700) { const b = $('#asB .opt button'); if (b) b.focus(); }
    }, 60);
  }

  function fermerFiche() {
    if ($('#as').hidden) return;
    $('#as').hidden = true;
    document.body.classList.remove('as-on');
    AS.l = null;
    AS.uid = null;
    majFlow();
  }

  function rendreFiche() {
    const l = AS.l;
    const m = AS.essai ? manques(l) : [];
    const err = function (k) { return m.indexOf(k) >= 0 ? ' err' : ''; };
    const an = new Date().getFullYear();
    $('#asB').innerHTML =
      (l.autre ? '<label class="fl" for="asLib">Article demandé</label><input class="in' + err("l'article") + '" id="asLib" data-f="libelle" value="' + esc(l.libelle) + '" placeholder="Précisez l\'article (marque, modèle…)" maxlength="120">' : '') +
      '<label class="fl" for="asQte">Quantité</label>' +
      '<div class="as-qr"><div class="qty"><button type="button" data-act="moins" aria-label="Diminuer la quantité">−</button>' +
        '<input id="asQte" data-f="quantite" type="number" min="1" inputmode="numeric" value="' + esc(l.quantite) + '">' +
        '<button type="button" data-act="plus" aria-label="Augmenter la quantité">+</button></div><span class="qty-h">unité(s) demandée(s)</span></div>' +
      '<label class="fl">Type de besoin</label>' +
      '<div class="opt' + err('le type') + '" role="radiogroup">' + typesDe(l.categorie).map(function (t) {
        const a = AIDE_TYPES[t] || ['circle-dot', ''];
        return '<button type="button" role="radio" aria-checked="' + (l.type_besoin === t) + '" class="' + (l.type_besoin === t ? 'on' : '') + '" data-act="type" data-v="' + esc(t) + '"><b>' + ico(a[0]) + esc(t) + '</b>' + (a[1] ? '<small>' + esc(a[1]) + '</small>' : '') + '</button>';
      }).join('') + '</div>' +
      (avecEquipement(l) ? '<div class="eq"><p class="eq-t">' + ico('history') + 'Équipement actuel à remplacer</p>' +
        '<label class="fl" for="asAn">Année d\'acquisition</label><input class="in' + err("l'année d'acquisition") + '" id="asAn" data-f="annee_acquisition" type="number" inputmode="numeric" min="1980" max="' + an + '" placeholder="Ex. : 2019" value="' + esc(l.annee_acquisition) + '">' +
        '<label class="fl">État actuel</label><div class="pills' + err("l'état actuel") + '">' + C.ETATS_EQUIPEMENT.map(function (x) {
          return '<button type="button" class="pill' + (l.etat_actuel === x ? ' on' : '') + '" data-act="etat" data-v="' + esc(x) + '">' + esc(x) + '</button>';
        }).join('') + '</div></div>' : '') +
      '<label class="fl" for="asMotif">Motif <small>— l\'élément clé pour la validation</small></label>' +
      '<textarea class="in' + err('le motif') + '" id="asMotif" data-f="motif" rows="3" maxlength="1000" placeholder="Pourquoi ce besoin ? Ex. : l\'imprimante de la caisse 2 ne fonctionne plus depuis juin.">' + esc(l.motif) + '</textarea>' +
      '<div class="quick">' + C.MOTIFS_RAPIDES.map(function (q) { return '<button type="button" data-act="motif" data-v="' + esc(q) + '">' + ico('plus') + esc(q) + '</button>'; }).join('') + '</div>' +
      '<label class="fl" for="asCar">Caractéristiques <small>(facultatif)</small></label>' +
      '<input class="in" id="asCar" data-f="caracteristiques" value="' + esc(l.caracteristiques) + '" maxlength="300" placeholder="Ex. : Core i7, 16 Go RAM, 512 Go SSD">';
    majPiedFiche();
    icones();
  }

  function majPiedFiche() {
    const m = manques(AS.l);
    $('#asM').className = 'as-m' + (m.length ? '' : ' ok');
    $('#asM').innerHTML = m.length ? ico('circle-alert') + 'À préciser : ' + esc(m.join(', ')) : ico('circle-check') + 'Tout est prêt';
    icones();
  }

  function validerFiche() {
    const l = AS.l;
    l.libelle = String(l.libelle || '').trim();
    if (manques(l).length) {
      AS.essai = true;
      rendreFiche();
      const e = $('#asB .err');
      if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (/INPUT|TEXTAREA/.test(e.tagName)) e.focus(); }
      return;
    }
    if (!avecEquipement(l)) { l.annee_acquisition = ''; l.etat_actuel = ''; }
    const propre = {
      categorie: l.categorie, libelle: l.libelle, autre: !!l.autre, quantite: parseInt(l.quantite, 10) || 1, type_besoin: l.type_besoin,
      caracteristiques: l.caracteristiques || '', motif: l.motif, annee_acquisition: l.annee_acquisition, etat_actuel: l.etat_actuel,
    };
    const existante = AS.uid && S.panier.find(function (x) { return x.uid === AS.uid; });
    let uid;
    if (existante) { Object.assign(existante, propre); uid = existante.uid; } else { uid = nouvelUid(); S.panier.push(Object.assign({ uid: uid }, propre)); }
    fermerFiche();
    sauverPanier();
    rendreNouveau();
    flashLigne(uid);
    toast(existante ? 'Modifications enregistrées.' : '« ' + propre.libelle + ' » ajouté à votre demande.', 'ok');
  }

  /* ---------- Ma demande ---------- */

  function htmlLigne(l) {
    const c = cat(l.categorie);
    const m = manques(l);
    const det = [l.type_besoin, String(l.motif || '').trim()].filter(Boolean).join(' · ');
    return '<div class="ci' + (m.length ? ' todo' : '') + '" data-uid="' + esc(l.uid) + '" style="--c:' + c.couleur + '">' +
      '<span class="dl-ic">' + ico(icoArticle(l.libelle, l.categorie)) + '</span>' +
      '<button type="button" class="ci-m" data-act="edit" title="Modifier">' +
        '<b>' + esc(l.libelle || 'Article à préciser') + '</b>' +
        (m.length ? '<span class="ci-todo">' + ico('circle-alert') + 'À compléter : ' + esc(m.join(', ')) + '</span>' : '<small>' + esc(det) + '</small>') +
      '</button>' +
      '<span class="ci-q">× ' + nombre(l.quantite) + '</span>' +
      '<button type="button" class="ci-x" data-act="edit" title="Modifier" aria-label="Modifier">' + ico('pencil') + '</button>' +
      '<button type="button" class="ci-x rm" data-act="rm" title="Retirer" aria-label="Retirer">' + ico('trash-2') + '</button>' +
    '</div>';
  }

  function rendreDemande() {
    $('#demWho').innerHTML = ico('user-round') + '<span>Au nom de <b>' + esc(S.session.nom) + '</b> · ' + esc(S.session.poste) + ' · ' + esc(S.session.site) + '<br>Validation par <b>' + esc(monValideur()) + '</b></span>';
    $('#demLignes').innerHTML = S.panier.length
      ? S.panier.map(htmlLigne).join('')
      : '<div class="dem-vide"><div class="dem-vide-ic">' + ico('mouse-pointer-click') + '</div><b>Votre demande est vide</b><span>Touchez un article du catalogue pour l\'ajouter.</span>' +
        '<ol><li><span>1</span>Choisissez un article</li><li><span>2</span>Précisez quantité, type et motif</li><li><span>3</span>Envoyez votre demande</li></ol></div>';
    majPiedDemande();
    icones();
  }

  function majPiedDemande() {
    const n = S.panier.length;
    const incompletes = S.panier.filter(function (l) { return manques(l).length; }).length;
    const qte = somme(S.panier, function (l) { return l.quantite; });
    $('#demN').hidden = !n;
    $('#demN').textContent = n;
    $('#demSub').textContent = n ? n + ' article(s) · ' + nombre(qte) + ' unité(s)' : 'Aucun article pour le moment';
    $('#demVider').hidden = !n;
    $('#demEnvoyer').disabled = !n || incompletes > 0;
    $('#demEnvoyerTxt').textContent = n ? 'Envoyer ma demande (' + n + ')' : 'Envoyer ma demande';
    $('#demMsg').className = 'dem-msg' + (incompletes ? ' warn' : '');
    $('#demMsg').innerHTML = !n ? '' : incompletes ? ico('circle-alert') + incompletes + ' article(s) à compléter avant l\'envoi.' : ico('circle-check') + 'Tout est prêt : vous pouvez envoyer.';
    majFlow();
    majCompteurPanier();
    majBarreMobile();
  }

  function majFlow() {
    const n = S.panier.length;
    const pret = n && !S.panier.some(function (l) { return manques(l).length; });
    const etape = !$('#as').hidden ? 2 : pret ? 3 : n ? 2 : 1;
    $$('#nvFlow li').forEach(function (li) {
      const k = Number(li.dataset.f);
      li.classList.toggle('on', k === etape);
      li.classList.toggle('ok', k < etape);
    });
  }

  function majBarreMobile() {
    const bar = $('#nvBar');
    bar.hidden = !(S.vue === 'nouveau' && S.panier.length && window.innerWidth <= 1024);
    $('#nvBarN').textContent = S.panier.length;
  }

  async function envoyerDemande() {
    const premier = S.panier.find(function (l) { return manques(l).length; });
    if (premier) {
      ouvrirFiche(premier);
      toast('Complétez : ' + manques(premier).join(', ') + '.', 'err');
      return;
    }
    if (!S.panier.length) return;
    const v = monValideur();
    const n = S.panier.length;
    const ok = await confirmer({
      ton: 'info', ico: 'send', titre: 'Envoyer votre demande ?',
      texte: '<b>' + n + ' besoin' + (n > 1 ? 's' : '') + '</b> (' + nombre(somme(S.panier, function (l) { return l.quantite; })) + ' unité(s)) seront transmis à <b>' + esc(v) + '</b> pour validation.',
      extra: recapHtml(S.panier), ok: 'Envoyer ma demande', okIco: 'send', annuler: 'Revoir',
    });
    if (!ok) return;
    const btn = $('#demEnvoyer');
    btn.disabled = true;
    chargement(true);
    try {
      const items = S.panier.map(function (l) {
        return {
          categorie: l.categorie, type_besoin: l.type_besoin, libelle: String(l.libelle).trim(), quantite: parseInt(l.quantite, 10),
          caracteristiques: String(l.caracteristiques || '').trim(), motif: String(l.motif).trim(),
          annee_acquisition: avecEquipement(l) ? parseInt(l.annee_acquisition, 10) : '', etat_actuel: avecEquipement(l) ? l.etat_actuel : '',
        };
      });
      const r = await Store.create(S.session, { items: items });
      S.panier = [];
      sauverPanier();
      rendreNouveau();
      chargement(false);
      actualiser(true);
      const suivre = await confirmer({
        ton: 'success', ico: 'check', titre: 'Demande envoyée !',
        texte: items.length + ' besoin' + (items.length > 1 ? 's' : '') + ' transmis à <b>' + esc(v) + '</b>. Vous suivrez la décision dans « ' + esc($('#sbMes').textContent) + ' ».',
        extra: '<div class="cf-ref"><small>Référence de la demande</small><b>' + esc(r.ref) + '</b><span>À indiquer au valideur en cas de question.</span></div>',
        ok: 'Suivre mes besoins', okIco: 'list-checks', annuler: 'Nouvelle demande', annulerIco: 'plus',
      });
      if (suivre) allerVue('mes');
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
    } finally {
      chargement(false);
    }
  }

  function sauverPanier() {
    memoire.ecrire(clePanier(), S.panier.map(function (l) { const c = Object.assign({}, l); delete c.voirCar; delete c.open; return c; }));
    majCompteurPanier();
  }

  function majCompteurPanier() {
    const n = S.panier.length;
    [$('#sbCart'), $('#bnCart')].forEach(function (el) { el.hidden = !n; el.textContent = n; });
  }

  /* ================= Vue « Mes besoins » ================= */

  const MES = { statut: '', q: '' };

  function initMes() {
    $('#mesStats').addEventListener('click', function (e) {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      MES.statut = b.dataset.s;
      rendreMes();
    });
    $('#mesSearch').addEventListener('input', function (e) { MES.q = e.target.value; rendreMes(); });
    $('#mesListe').addEventListener('click', function (e) {
      const r = e.target.closest('[data-id]');
      if (r) ouvrirPanneau(r.dataset.id);
    });
  }

  const groupes = function (liste) {
    const m = {};
    liste.forEach(function (b) { (m[b.ref] = m[b.ref] || []).push(b); });
    return Object.keys(m).map(function (k) { return m[k].sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); }); })
      .sort(function (a, b) { return String(b[0].cree_le).localeCompare(String(a[0].cree_le)); });
  };

  const fJour = function (v) { const d = date(v); return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; };
  // Référence d'une demande, attribuée par le serveur à chaque envoi : B = Besoins, 27 = Budget 2027, puis le numéro d'ordre.
  const refHtml = function (ref) {
    const n = String(ref).split('-').pop();
    return '<span class="ref" title="Référence de la demande : B = Besoins, 27 = Budget 2027, ' + esc(n) + ' = numéro d\'ordre de la demande. À communiquer au valideur en cas de question.">Réf. ' + esc(ref) + '</span>';
  };

  // État global d'une demande, d'après ses lignes.
  function etatDemande(g) {
    const n = g.length;
    const v = g.filter(function (b) { return b.statut === 'VALIDE'; }).length;
    const r = g.filter(function (b) { return b.statut === 'REJETE'; }).length;
    if (!v && !r) return { cls: 'att', ico: 'hourglass', txt: 'En attente de validation' };
    if (v + r < n) return { cls: 'cours', ico: 'loader', txt: 'En cours · ' + (v + r) + '/' + n + ' examiné(s)' };
    if (v === n) return { cls: 'ok', ico: 'circle-check', txt: n > 1 ? 'Entièrement validée' : 'Validée' };
    if (r === n) return { cls: 'ko', ico: 'circle-x', txt: 'Rejetée' };
    return { cls: 'ok', ico: 'circle-check', txt: 'Traitée · ' + v + ' validé(s), ' + r + ' rejeté(s)' };
  }

  function rendreMes() {
    const caisse = estCaisse();
    const toutes = S.besoins.filter(function (b) { return caisse ? !peutDecider(b) : estMien(b); });
    $('#mesTitre').textContent = caisse ? 'Besoins du site ' + S.session.site : 'Mes besoins';
    $('#mesSub').textContent = caisse
      ? 'Les besoins exprimés par les caissières de ' + S.session.site + ' et leur validation par ' + monValideur() + '.'
      : 'Le suivi de vos demandes et de leur validation par ' + monValideur() + '.';
    $('#mesListeT').textContent = caisse ? 'Demandes du site' : 'Mes demandes';
    const st = stats(toutes);
    const nbDem = groupes(toutes).length;
    // Anneau : part des lignes examinées (vert = validé, rouge = rejeté, gris = en attente).
    const pv = st.n ? st.VALIDE / st.n * 100 : 0;
    const pr = st.n ? st.REJETE / st.n * 100 : 0;
    const filtre = function (s, label, n, sous, couleur) {
      return '<button type="button" class="mk' + (MES.statut === s ? ' on' : '') + '" data-s="' + s + '" style="--mk:' + couleur + '" aria-pressed="' + (MES.statut === s) + '">' +
        '<span>' + label + '</span><b>' + nombre(n) + '</b><small>' + sous + '</small></button>';
    };
    $('#mesStats').innerHTML =
      '<div class="mes-prog">' +
        '<div class="ring" style="background:conic-gradient(#047857 0 ' + pv + '%,#be123c ' + pv + '% ' + (pv + pr) + '%,#eef2f6 ' + (pv + pr) + '% 100%)"><span><b>' + st.taux + '%</b><small>examinés</small></span></div>' +
        '<div class="mes-prog-t"><b>' + nombre(nbDem) + ' demande(s) envoyée(s)</b><small>' + nombre(st.n) + ' article(s) · ' + nombre(st.qte) + ' unité(s) demandée(s)</small>' +
          (st.EN_ATTENTE ? '<small class="att">' + ico('hourglass') + nombre(st.EN_ATTENTE) + ' en attente de ' + esc(monValideur()) + '</small>' : st.n ? '<small class="fini">' + ico('circle-check') + 'Tout a été examiné</small>' : '') + '</div>' +
      '</div>' +
      '<div class="mes-kpis" role="group" aria-label="Filtrer par statut">' +
        filtre('', 'Tous', st.n, 'article(s)', '#0f172a') +
        filtre('EN_ATTENTE', 'En attente', st.EN_ATTENTE, nombre(st.qteAttente) + ' unité(s)', '#ea580c') +
        filtre('VALIDE', 'Validés', st.VALIDE, nombre(st.qteValidee) + ' unité(s) accordée(s)', '#047857') +
        filtre('REJETE', 'Rejetés', st.REJETE, st.REJETE ? 'motif indiqué' : 'aucun rejet', '#be123c') +
      '</div>';
    const q = sansAccents(MES.q).trim();
    let liste = toutes.filter(function (b) {
      return !q || sansAccents([b.id, b.ref, b.libelle, b.motif, b.demandeur, b.type_besoin, fJour(b.cree_le), fDate(b.cree_le)].join(' ')).includes(q);
    });
    if (MES.statut) liste = liste.filter(function (b) { return b.statut === MES.statut; });
    const gs = groupes(liste);
    $('#mesListe').innerHTML = gs.length ? gs.map(function (g) {
      // L'état porte sur la demande entière, même si un filtre masque certaines lignes.
      const complet = toutes.filter(function (b) { return b.ref === g[0].ref; });
      const e = etatDemande(complet);
      const n = complet.length;
      const seg = function (s, coul) { const k = complet.filter(function (b) { return b.statut === s; }).length; return k ? '<span style="width:' + (k / n * 100) + '%;background:' + coul + '"></span>' : ''; };
      return '<article class="grp dmd">' +
        '<header class="dmd-h">' +
          '<span class="dmd-i">' + ico('file-text') + '</span>' +
          '<div class="grp-t"><b>Demande du ' + fJour(g[0].cree_le) + '</b>' +
            '<small>' + refHtml(g[0].ref) + ' · ' + n + ' article(s) · ' + nombre(somme(complet, function (b) { return b.quantite; })) + ' unité(s) · envoyée à ' + fHeure(g[0].cree_le) +
            (caisse ? ' · par ' + esc(g[0].demandeur) : '') + '</small></div>' +
          '<span class="dst dst-' + e.cls + '">' + ico(e.ico) + e.txt + '</span>' +
        '</header>' +
        '<div class="dmd-bar" aria-hidden="true">' + seg('VALIDE', '#047857') + seg('REJETE', '#be123c') + '</div>' +
        g.map(ligneSuivi).join('') + '</article>';
    }).join('') : '<div class="card nd">' + ico('inbox') + (toutes.length ? 'Aucun besoin ne correspond.' : 'Aucun besoin envoyé pour le moment.') +
      (toutes.length ? '' : '<button type="button" class="btn bp" data-goto="nouveau">' + ico('plus') + 'Exprimer un besoin</button>') + '</div>';
    icones();
  }

  function ligneSuivi(b) {
    const c = cat(b.categorie);
    const details = [esc(b.type_besoin), equipTxt(b) ? esc(equipTxt(b)) : '', b.caracteristiques ? esc(b.caracteristiques) : ''].filter(Boolean).join(' · ');
    const reduit = b.statut === 'VALIDE' && Number(b.quantite_validee) < Number(b.quantite);
    return '<button type="button" class="gr" data-id="' + esc(b.id) + '" style="--c:' + c.couleur + '">' +
      '<span class="dl-ic">' + ico(icoArticle(b.libelle, b.categorie)) + '</span>' +
      '<span class="gr-a"><b>' + esc(b.libelle) + '</b><small>' + details + '</small>' +
        (b.statut === 'REJETE' && b.commentaire_bo ? '<span class="gr-rej">' + ico('message-square-warning') + esc(b.commentaire_bo) + '</span>' : '') + '</span>' +
      '<span class="gr-qs">' +
        '<span class="gr-q"><small>Demandé</small><b>' + nombre(b.quantite) + '</b></span>' +
        '<span class="gr-q' + (b.statut === 'VALIDE' ? ' v' : '') + (reduit ? ' r' : '') + '"><small>Validé</small><b>' + (b.statut === 'VALIDE' ? nombre(b.quantite_validee) : '—') + '</b></span>' +
      '</span>' +
      '<span class="gr-s">' + badgeStatut(b.statut) + (b.traite_par ? '<small>par ' + esc(b.traite_par) + '</small>' : '') + '</span>' +
    '</button>';
  }

  /* ================= Vue « À valider » ================= */

  const VAL = { onglet: 'attente', site: '', cat: '', q: '' };

  function initValider() {
    $('#valSite').innerHTML = '<option value="">Tous les sites</option>' + TOUS_SITES.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
    $('#valCat').innerHTML = '<option value="">Toutes catégories</option>' + CATS.map(function (c) { return '<option value="' + c.code + '">' + esc(c.libelle) + '</option>'; }).join('');
    $('#valTabs').addEventListener('click', function (e) {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      VAL.onglet = b.dataset.o;
      rendreValider();
    });
    $('#valSite').addEventListener('change', function (e) { VAL.site = e.target.value; rendreValider(); });
    $('#valCat').addEventListener('change', function (e) { VAL.cat = e.target.value; rendreValider(); });
    $('#valSearch').addEventListener('input', function (e) { VAL.q = e.target.value; rendreValider(); });
    const box = $('#valListe');
    box.addEventListener('click', function (e) {
      const el = e.target.closest('[data-act]');
      if (!el) {
        const r = e.target.closest('.gr[data-id]');
        if (r) ouvrirPanneau(r.dataset.id);
        return;
      }
      const row = e.target.closest('[data-id]');
      const act = el.dataset.act;
      if (act === 'tout') {
        const ids = el.dataset.ids.split(',');
        decider(ids, 'VALIDE', '', null, ids.length + ' besoin(s) validé(s).');
        return;
      }
      if (!row) return;
      const id = row.dataset.id;
      if (act === 'ok') {
        const q = row.querySelector('[data-q]');
        const v = Number(q.value);
        if (q.value === '' || !(v >= 0)) { q.classList.add('err'); q.focus(); toast('Quantité validée invalide.', 'err'); return; }
        decider([id], 'VALIDE', '', Math.round(v), 'Besoin validé.');
      } else if (act === 'ko') {
        row.classList.add('rej');
        const i = row.querySelector('[data-rej]');
        i.focus();
      } else if (act === 'ko-annuler') {
        row.classList.remove('rej');
      } else if (act === 'ko-ok') {
        const i = row.querySelector('[data-rej]');
        if (!i.value.trim()) { i.classList.add('err'); i.focus(); toast('Indiquez le motif du rejet.', 'err'); return; }
        decider([id], 'REJETE', i.value.trim(), null, 'Besoin rejeté.');
      } else if (act === 'detail') {
        ouvrirPanneau(id);
      }
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-rej]')) { e.preventDefault(); e.target.closest('[data-id]').querySelector('[data-act="ko-ok"]').click(); }
    });
  }

  async function decider(ids, statut, commentaire, qte, message) {
    chargement(true);
    try {
      const data = { ids: ids, statut: statut, commentaire: commentaire };
      if (qte !== null && qte !== undefined) data.quantite_validee = qte;
      await Store.decide(S.session, data);
      toast(message, 'ok');
      await actualiser(true);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      chargement(false);
    }
  }

  function rendreValider() {
    if (!estBO()) return;
    const mien = S.besoins.filter(peutDecider);
    const attente = mien.filter(function (b) { return b.statut === 'EN_ATTENTE'; });
    [$('#nbValider'), $('#bnValider')].forEach(function (el) { el.hidden = !attente.length; el.textContent = attente.length; });
    $('#valSub').textContent = estManager()
      ? 'Besoins exprimés par les responsables et les managers.'
      : 'Besoins que vous validez : ' + (C.VALIDEURS[S.session.nom] ? C.VALIDEURS[S.session.nom].postes.concat(C.VALIDEURS[S.session.nom].personnes).join(', ') : '') + '.';
    const demandeurs = Object.keys(attente.reduce(function (m, b) { m[b.site + '|' + b.demandeur] = 1; return m; }, {})).length;
    const anciens = attente.filter(function (b) { return joursDepuis(b.cree_le) >= C.SEUIL_ATTENTE_JOURS; }).length;
    $('#valSum').className = 'val-sum' + (attente.length ? '' : ' done');
    $('#valSum').innerHTML = '<span class="val-sum-i">' + ico(attente.length ? 'stamp' : 'party-popper') + '</span><div>' + (attente.length
      ? '<b>' + attente.length + ' besoin(s) attendent votre décision</b><small>' + nombre(somme(attente, function (b) { return b.quantite; })) + ' unité(s) · ' + demandeurs + ' demandeur(s)' +
        (anciens ? ' · <b style="display:inline;font-size:inherit;color:var(--danger)">' + anciens + ' en attente depuis plus de ' + C.SEUIL_ATTENTE_JOURS + ' jours</b>' : '') + '</small>'
      : '<b>Tout est à jour</b><small>Aucun besoin n\'attend votre décision pour le moment.</small>') + '</div>';
    $('#valTabs').innerHTML = [['attente', 'À traiter', attente.length], ['traites', 'Déjà traités', mien.length - attente.length]].map(function (o) {
      return '<button type="button" class="fb' + (VAL.onglet === o[0] ? ' on' : '') + '" data-o="' + o[0] + '">' + o[1] + ' <i>' + o[2] + '</i></button>';
    }).join('');
    const q = sansAccents(VAL.q).trim();
    const liste = (VAL.onglet === 'attente' ? attente : mien.filter(function (b) { return b.statut !== 'EN_ATTENTE'; })).filter(function (b) {
      if (VAL.site && b.site !== VAL.site) return false;
      if (VAL.cat && b.categorie !== VAL.cat) return false;
      return !q || sansAccents([b.id, b.ref, b.libelle, b.motif, b.demandeur, b.poste, b.site].join(' ')).includes(q);
    });
    const gs = groupes(liste);
    $('#valListe').innerHTML = gs.length ? gs.map(function (g) {
      const b0 = g[0];
      const enAtt = g.filter(function (b) { return b.statut === 'EN_ATTENTE'; });
      return '<div class="grp"><div class="grp-h">' +
        '<span class="av">' + esc(initiales(b0.demandeur)) + '</span>' +
        '<div class="grp-t"><b>' + esc(b0.demandeur) + '</b><small>' + esc(b0.poste) + ' · ' + esc(b0.site) + ' · demande ' + esc(b0.ref) + ' du ' + fDateHeure(b0.cree_le) +
          (VAL.onglet === 'attente' && joursDepuis(b0.cree_le) >= C.SEUIL_ATTENTE_JOURS ? ' · <span class="adys">' + Math.floor(joursDepuis(b0.cree_le)) + ' j d\'attente</span>' : '') + '</small></div>' +
        (enAtt.length > 1 ? '<button type="button" class="btn bo btn-sm" data-act="tout" data-ids="' + enAtt.map(function (b) { return esc(b.id); }).join(',') + '">' + ico('check-check') + 'Tout valider (' + enAtt.length + ')</button>' : '') +
        '</div>' + g.map(function (b) { return VAL.onglet === 'attente' ? ligneValidation(b) : ligneSuivi(b); }).join('') + '</div>';
    }).join('') : '<div class="card nd">' + ico(VAL.onglet === 'attente' ? 'party-popper' : 'inbox') +
      (VAL.onglet === 'attente' ? (attente.length ? 'Aucun besoin ne correspond aux filtres.' : 'Rien à valider pour le moment.') : 'Aucun besoin traité pour le moment.') + '</div>';
    icones();
  }

  function ligneValidation(b) {
    const c = cat(b.categorie);
    const details = [esc(c.libelle), esc(b.type_besoin), equipTxt(b) ? '<b class="eqb">' + esc(equipTxt(b)) + '</b>' : '', b.caracteristiques ? esc(b.caracteristiques) : ''].filter(Boolean).join(' · ');
    return '<div class="vr" data-id="' + esc(b.id) + '" style="--c:' + c.couleur + '">' +
      '<span class="dl-ic">' + ico(icoArticle(b.libelle, b.categorie)) + '</span>' +
      '<div class="vr-a"><b>' + esc(b.libelle) + '</b><small>' + details + '</small><p class="vr-m">' + ico('quote') + esc(b.motif) + '</p></div>' +
      '<div class="vr-q"><small>Demandé</small><b>' + nombre(b.quantite) + '</b></div>' +
      '<div class="vr-v"><small>Validé</small><input class="in" type="number" min="0" inputmode="numeric" data-q value="' + esc(b.quantite) + '" aria-label="Quantité validée"></div>' +
      '<div class="vr-b"><button type="button" class="vb vb-ok" data-act="ok">' + ico('check') + 'Valider</button><button type="button" class="vb vb-ko" data-act="ko">' + ico('x') + 'Rejeter</button></div>' +
      '<div class="vr-r"><input class="in" data-rej placeholder="Motif du rejet (obligatoire), puis Entrée"><button type="button" class="vb vb-ko" data-act="ko-ok">Confirmer le rejet</button><button type="button" class="lk" data-act="ko-annuler">Annuler</button></div>' +
    '</div>';
  }

  /* ================= Export Excel ================= */

  function exporterExcel() {
    if (!window.XLSX) { toast("La bibliothèque Excel n'a pas pu être chargée (connexion internet ?).", 'err'); return; }
    const exporteur = Store.estExporteur(S.session);
    if (!estBO() && !exporteur) return;
    // Responsable valideur : les besoins qu'il a lui-même validés.
    // Manager et exportateurs (ex. Rita Kessie) : les besoins validés par les responsables et par les managers.
    const lignes = S.besoins.filter(function (b) {
      if (b.statut !== 'VALIDE') return false;
      return estManager() || (exporteur && !estBO()) ? (b.traite_par_poste === 'Responsable' || b.traite_par_poste === 'Manager') : valideParMoi(b);
    }).sort(function (a, b) { return String(a.site).localeCompare(String(b.site)) || String(a.id).localeCompare(String(b.id)); });
    if (!lignes.length) { toast(estManager() || (exporteur && !estBO()) ? 'Aucun besoin validé par Zeinab Kone, Yaya Comara ou les managers pour le moment.' : 'Vous n\'avez encore validé aucun besoin.', 'err'); return; }
    const feuille = function (rows, largeurs) {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = largeurs.map(function (w) { return { wch: w }; });
      return ws;
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(lignes.map(function (b) {
      return {
        'N°': b.id, 'Réf. demande': b.ref, 'Saisi le': fDateHeure(b.cree_le), 'Site': b.site, 'Demandeur': b.demandeur, 'Poste': b.poste,
        'Catégorie': cat(b.categorie).libelle, 'Type besoin': b.type_besoin, 'Libellé': b.libelle,
        'Quantité demandée': Number(b.quantite) || 0, 'Caractéristiques': b.caracteristiques,
        "Année d'acquisition équipement actuel": b.annee_acquisition, 'État équipement actuel': b.etat_actuel, 'Motif': b.motif,
        'Statut': (STATUTS[b.statut] || {}).libelle, 'Quantité validée': b.statut === 'VALIDE' ? Number(b.quantite_validee) || 0 : '',
        'Commentaire du valideur': b.commentaire_bo, 'Validé par': b.traite_par, 'Poste du valideur': b.traite_par_poste, 'Validé le': fDateHeure(b.maj_le),
      };
    }), [14, 11, 16, 18, 20, 18, 13, 22, 30, 10, 30, 16, 22, 40, 11, 10, 30, 18, 16, 16]), 'Besoins validés');

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
      XLSX.utils.book_append_sheet(wb, feuille(sitesConnus().map(function (p) {
        const l = lignes.filter(function (b) { return b.site === p; });
        const st = stats(l);
        const row = { 'Site': p, 'Lignes': st.n };
        CATS.forEach(function (c) { row[c.libelle + ' (qté)'] = somme(l.filter(function (b) { return b.categorie === c.code && b.statut !== 'REJETE'; }), function (b) { return b.quantite; }); });
        return Object.assign(row, { 'Qté totale': st.qte, 'En attente': st.EN_ATTENTE, 'Validées': st.VALIDE, 'Rejetées': st.REJETE, 'Qté validée': st.qteValidee, 'Taux de traitement (%)': st.taux });
      }), [20, 8, 16, 12, 12, 11, 11, 10, 10, 12, 20]), 'Synthèse par site');
    }
    const nom = 'Besoins_valides_' + C.CAMPAGNE.replace(/\s+/g, '_') + '_' + S.session.nom.replace(/\s+/g, '_') + '_' + fDate(new Date()).replace(/\//g, '-') + '.xlsx';
    XLSX.writeFile(wb, nom);
    toast('Export Excel généré.', 'ok');
  }

  /* ================= Démarrage ================= */

  initConfirm();
  initConnexion();
  const sess = memoire.lire(CLE_SESSION);
  if (Store.configure && sess && sess.token && sess.poste) {
    demarrerSession(sess); // un jeton expiré renvoie à l'écran de connexion
  } else {
    afficherConnexion();
  }
})();
