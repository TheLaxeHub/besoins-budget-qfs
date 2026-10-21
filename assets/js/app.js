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
  const equipTxt = function (b) { return b.annee_acquisition || b.etat_actuel ? [b.annee_acquisition ? 'Acquis en ' + b.annee_acquisition : '', b.etat_actuel].filter(Boolean).join(' · ') : ''; };
  const valideParMoi = function (b) { return !!S.session && b.traite_par_id === S.session.id && !!S.session.id; };
  const cleUser = function () { return (S.session.id || (S.session.site + '_' + S.session.nom)).toLowerCase(); };
  const initiales = function (n) { return String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join(''); };
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
  const clePanier = function () { return 'bud27_panier_' + cleUser(); };
  const typesDe = function (code) { return cat(code).types || C.TYPES_BESOIN; };

  /* ================= Connexion : poste → site → accès ================= */

  const L = { etape: 1, poste: null, site: '', nom: '', annuaire: null, minuteur: null, expire: 0 };
  const posteDef = function (lib) { return C.POSTES.find(function (p) { return p.libelle === lib; }); };

  function initConnexion() {
    $$('[data-cfg]').forEach(function (el) { el.textContent = C[el.dataset.cfg] || ''; });
    document.title = C.APP_TITRE + ' — QFS';
    $('#lgDemo').hidden = !Store.demo;
    const carte = function (p) {
      return '<button type="button" class="lg-role" data-poste="' + esc(p.libelle) + '">' + ico(p.ico || 'user') +
        '<b>' + esc(p.libelle) + '</b><small>' + esc(p.aide || '') + '</small></button>';
    };
    $('#lgRolesSite').innerHTML = C.POSTES.filter(function (p) { return !p.siege; }).map(carte).join('');
    $('#lgRolesSiege').innerHTML = C.POSTES.filter(function (p) { return p.siege; }).map(carte).join('');
    dessinerGrille('');
    icones();

    $('#lgPoste').addEventListener('click', function (e) {
      const b = e.target.closest('[data-poste]');
      if (!b) return;
      L.poste = posteDef(b.dataset.poste);
      L.site = L.poste.siege ? C.SITE_SIEGE : '';
      etapeConnexion(2);
    });
    $('#lgSiegeOk').addEventListener('click', function () { L.site = C.SITE_SIEGE; etapeConnexion(3); });
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
    const sites = C.SITES.filter(function (p) { return !n || sansAccents(p).includes(n); });
    $('#lgGrid').innerHTML = sites.length
      ? sites.map(function (p) {
        return '<button type="button" class="lg-pdv" data-site="' + esc(p) + '"><span class="lg-pin">' + esc(p.charAt(0)) + '</span>' + esc(p) + '</button>';
      }).join('')
      : '<div class="lg-none">Aucun site ne correspond.</div>';
  }

  async function etapeConnexion(n) {
    L.etape = n;
    $('#lgErr').textContent = '';
    $('#lgPoste').hidden = n !== 1;
    $('#lgSite').hidden = n !== 2;
    $('#lgQui').hidden = n !== 3;
    $('#lgOtp').hidden = n !== 4;
    $$('#lgSteps li').forEach(function (li) {
      const k = Number(li.dataset.s);
      li.classList.toggle('on', k === Math.min(n, 3));
      li.classList.toggle('ok', k < Math.min(n, 3));
    });
    if (n === 2) {
      const siege = L.poste.siege;
      $('#lgSiteH').textContent = siege
        ? 'Poste ' + L.poste.libelle + ' : votre site est le ' + C.SITE_SIEGE + '.'
        : 'Poste ' + L.poste.libelle + ' : sélectionnez votre site.';
      $('#lgSiteSiege').hidden = !siege;
      $('#lgSiteListe').hidden = siege;
      if (!siege) { $('#lgSearch').value = ''; dessinerGrille(''); setTimeout(function () { $('#lgSearch').focus(); }, 50); }
    }
    if (n === 3) {
      const siege = L.poste.siege;
      $('#lgQuiH').textContent = L.poste.libelle + ' · ' + L.site + (siege ? ' — choisissez votre nom : un code de connexion vous sera envoyé par e-mail.' : '');
      $('#lgNomForm').hidden = siege;
      $('#lgPeople').hidden = !siege;
      if (siege) await dessinerPersonnes();
      else setTimeout(function () { $('#lgNom').focus(); }, 50);
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
      return '<button type="button" class="lg-pdv" data-nom="' + esc(p.nom) + '"><span class="lg-pin">' + esc(p.nom.charAt(0)) + '</span><span>' + esc(p.nom) + '<small>' + esc(p.email) + '</small></span></button>';
    }).join('') : '<div class="lg-none">Aucune personne enregistrée pour ce poste.</div>';
  }

  async function connexionSite() {
    const nom = $('#lgNom').value.trim();
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
      $('#lgOtpWho').textContent = L.nom;
      $('#lgOtpH').innerHTML = 'Un code à 4 chiffres vient d\'être envoyé à <b>' + esc(r.email) + '</b>. Saisissez-le ci-dessous.';
      $('#otpDemo').hidden = !r.demoCode;
      if (r.demoCode) $('#otpDemo').innerHTML = 'Mode démonstration — votre code est <b>' + esc(r.demoCode) + '</b>';
      $$('#otpBox input').forEach(function (c) { c.value = ''; c.disabled = false; });
      $('#otpBox').classList.remove('err');
      $('#otpGo').disabled = false;
      demarrerMinuteur(r.expire || (Date.now() + C.OTP_MINUTES * 60000));
      setTimeout(function () { $('#otpBox input').focus(); }, 50);
    } catch (e) {
      if (L.etape !== 4) etapeConnexion(L.etape);
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
        t.textContent = 'Code expiré. Générez un nouveau code pour continuer.';
        $$('#otpBox input').forEach(function (c) { c.value = ''; c.disabled = true; });
        $('#otpGo').disabled = true;
        $('#otpDemo').hidden = true;
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
    if (Date.now() > L.expire) { $('#lgErr').textContent = 'Code expiré. Générez un nouveau code.'; return; }
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
    S.panier = memoire.lire(clePanier()) || [];
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
    if (S.session && !message) Store.deconnexion(S.session).catch(function () { /* déjà expirée */ });
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
    const ss = S.session;
    const caisse = !(posteDef(ss.poste) || {}).siege;
    $('#sbAv').textContent = initiales(ss.nom);
    $('#sbAv').className = 'sb-av' + (bo ? ' bo' : '');
    $('#sbName').textContent = ss.nom;
    $('#sbRole').textContent = ss.poste + ' · ' + ss.site;
    $('#sbReg').textContent = bo ? 'Besoins à valider' : caisse ? 'Besoins du site' : 'Mes besoins';
    $('#bcWho').textContent = ss.nom + ' · ' + ss.poste;
    $('#pgIco').innerHTML = ico((posteDef(ss.poste) || {}).ico || 'user');
    $('#pgEyebrow').textContent = 'E-Money · ' + ss.poste + ' · ' + ss.site;
    $('#regTitle').textContent = bo
      ? (estManager() ? 'Besoins — validation des responsables et des managers' : 'Besoins — validation ' + ss.nom)
      : caisse ? 'Besoins des caissières — ' + ss.site : 'Mes besoins';
    $('#fVue').value = S.filtres.vue;
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
      document.getElementById('sec-reg').scrollIntoView({ behavior: 'smooth' });
    });
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
    if (!d || isNaN(d)) { b.hidden = true; return; }
    const j = Math.ceil((d - Date.now()) / 864e5);
    b.hidden = false;
    b.className = 'dl-banner' + (j < 0 ? ' late' : '');
    b.innerHTML = ico(j < 0 ? 'alarm-clock-off' : 'calendar-clock') + '<span>' + (j < 0
      ? 'La date limite de saisie (' + fDate(d) + ') est dépassée. Contactez votre responsable pour tout besoin urgent.'
      : 'Date limite de saisie des besoins ' + esc(C.CAMPAGNE) + ' : <b>' + fDate(d) + '</b> — ' + (j === 0 ? "c'est aujourd'hui" : 'encore ' + j + ' jour(s)') + '.') + '</span>';
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
    try {
      const r = await Store.list(S.session);
      S.besoins = r.besoins || [];
      S.synchro = new Date();
      Object.keys(S.selection).forEach(function (id) {
        const b = parId(id);
        if (!b || b.statut !== 'EN_ATTENTE' || !peutDecider(b)) delete S.selection[id];
      });
      rendre();
      if (S.ouvert && S.ouvert !== '__groupe__') rendrePanneau();
    } catch (err) {
      if (err.code === 'SESSION_EXPIREE') {
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
    $('#shPeriode').textContent = 'Campagne ' + C.CAMPAGNE;
    $('#tbSync').textContent = 'Données du ' + fDateHeure(S.synchro);
    rendreProgression(st);
    rendreKpis(st);
    rendreGraphiques(liste);
    rendreTable(liste);
    if (estBO()) rendreSynthese(filtrer({ ignorerSite: true }));
    rendreArticles(liste);
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
      k('package', 'Quantité demandée', nombre(st.qte), parCat, '#111827'),
      estBO()
        ? k('stamp', 'À valider par vous', nombre(aValider.length), aValider.length ? nombre(somme(aValider, function (b) { return b.quantite; })) + ' unité(s) en attente de votre décision' : 'rien en attente', '#9333ea')
        : k('shopping-cart', 'Panier non envoyé', nombre(S.panier.length), S.panier.length ? 'ligne(s) à envoyer pour validation' : 'rien en attente d\'envoi', '#9333ea'),
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
        it('Site', esc(b.site)) + it('Demandeur', esc(b.demandeur) + (b.poste ? '<div class="sub" style="font-weight:500;color:#6b7280">' + esc(b.poste) + '</div>' : '')) +
        it('Validation par', esc(valideurTxt(b))) + it('Poste', esc(b.poste)) +
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
      $('#pForm').innerHTML = '<div class="ps"><h3 class="pst">Modifier</h3><p class="cs" style="margin-bottom:6px">Validation par ' + esc(valideurTxt(b)) + '.</p><p class="cs" style="margin-bottom:10px">Ce besoin n\'a pas encore été examiné : vous pouvez le retirer puis le ressaisir si nécessaire.</p>' +
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
      '<label class="fl" for="decCom">Commentaire <span id="decComReq" class="z"></span></label><textarea class="in" id="decCom" rows="3" placeholder="Ex. : validé pour le budget 2027, à livrer au T1…">' + esc(commentaire || '') + '</textarea>' +
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
  const avecEquipement = function () { return C.TYPES_EQUIPEMENT_ACTUEL.indexOf(N.type) >= 0; };

  function initSaisie() {
    $('#nCats').innerHTML = CATS.map(function (c) {
      return '<label style="--catc:' + c.couleur + '"><input type="radio" name="ncat" value="' + esc(c.code) + '"><span>' + ico(c.ico) +
        '<b>' + esc(c.libelle) + '</b><small>' + esc(c.aide) + '</small><small class="n-art">' + c.articles.length + ' articles proposés</small></span></label>';
    }).join('');

    $('#nQuick').innerHTML = C.MOTIFS_RAPIDES.map(function (m) { return '<button type="button">+ ' + esc(m) + '</button>'; }).join('');

    $('#nCats').addEventListener('change', function (e) {
      N.cat = e.target.value;
      remplirArticles();
      setTimeout(function () { allerA(2); }, 120);
    });
    $('#nTypes').addEventListener('change', function (e) {
      N.type = e.target.value;
      $('#nTypes').classList.remove('err');
      $('#nEq').hidden = !avecEquipement();
    });
    $('#nEtat').innerHTML = '<option value="">— Sélectionner l\'état —</option>' + C.ETATS_EQUIPEMENT.map(function (e) { return '<option>' + esc(e) + '</option>'; }).join('');
    $('#nEtat').addEventListener('change', function () { $('#nEtat').classList.remove('err'); $('#nErr').textContent = ''; });
    $('#nAnnee').addEventListener('input', function () { $('#nErr').textContent = ''; });
    $('#nAnnee').max = new Date().getFullYear();
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
    ['nLibAutre', 'nMotif', 'nAnnee'].forEach(function (id) {
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
    N.type = '';
    $('#nEq').hidden = true;
    $('#nTypes').innerHTML = typesDe(N.cat).map(function (t) {
      return '<label><input type="radio" name="ntype" value="' + esc(t) + '"><span>' + esc(t) + '</span></label>';
    }).join('');
    $('#nLib').innerHTML = '<option value="">— Sélectionner un article —</option>' +
      c.articles.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') +
      '<option value="' + AUTRE + '">Autre (préciser)…</option>';
    $('#nLibAutre').hidden = true;
    $('#nLibAutre').value = '';
  }

  function ouvrirSaisie() {
    const v = valideurTxt({ poste: S.session.poste, demandeur: S.session.nom, demandeur_id: S.session.id });
    $('#mNewSite').textContent = S.session.site + ' · ' + C.CAMPAGNE;
    $('#nWho').innerHTML = 'Envoyé au nom de <b>' + esc(S.session.nom) + '</b> (' + esc(S.session.poste) + ', ' + esc(S.session.site) + ') — validation par <b>' + esc(v) + '</b>.';
    $('#mNew').hidden = false;
    document.body.style.overflow = 'hidden';
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
    $('#nAnnee').value = ''; $('#nEtat').value = ''; $('#nEq').hidden = true;
    if (!garderJustif) {
      $('#nMotif').value = '';
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
    const focus = { 2: '#nLib', 3: '#nMotif' }[n];
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
      if (avecEquipement()) {
        const a = parseInt($('#nAnnee').value, 10);
        if (!(a >= 1980 && a <= new Date().getFullYear())) return erreurSaisie($('#nAnnee'), "Indiquez l'année d'acquisition de l'équipement actuel (1980 à " + new Date().getFullYear() + ').');
        if (!$('#nEtat').value) return erreurSaisie($('#nEtat'), "Indiquez l'état de l'équipement actuel.");
      }
      return true;
    }
    if (n === 3) {
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
      motif: $('#nMotif').value.trim(),
      annee_acquisition: avecEquipement() ? parseInt($('#nAnnee').value, 10) : '',
      etat_actuel: avecEquipement() ? $('#nEtat').value : '',
    });
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
        '<span class="cart-t"><b>' + esc(l.libelle) + '</b><small>' + esc(c.libelle) + ' · ' + esc(l.type_besoin) + (equipTxt(l) ? ' · ' + esc(equipTxt(l)) : '') + '</small></span>' +
        '<button type="button" class="cart-x" data-rm="' + k + '" title="Retirer du panier">' + ico('trash-2') + '</button></div>';
    }).join('') +
      '<div class="cart-tot"><span>' + S.panier.length + ' ligne(s)</span><span>Quantité totale : <b>' + nombre(somme(S.panier, function (l) { return l.quantite; })) + '</b></span></div></div>';
    $('#nSubmitTxt').textContent = 'Envoyer ' + S.panier.length + ' besoin' + (S.panier.length > 1 ? 's' : '');
    icones();
  }

  async function envoyer() {
    if (!S.panier.length) return;
    const btn = $('#nSubmit');
    btn.disabled = true;
    chargement(true);
    try {
      const r = await Store.create(S.session, { items: S.panier });
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
      box.innerHTML = '<div class="ok-ic">' + ico('check') + '</div><h3 class="pnm">Besoins envoyés pour validation</h3>' +
        '<p class="cs">' + n + ' ligne(s) enregistrée(s) — ' + esc(S.session.nom) + ', ' + esc(S.session.site) + '.</p><div class="ok-ref">' + esc(r.ref) + '</div>' +
        '<p class="cs">Vous suivrez leur validation dans le registre des besoins.</p>' +
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
    if (!estBO()) return;
    // Responsable : les besoins qu'il a lui-même validés.
    // Manager : les besoins validés par les responsables et par les managers (dont lui-même).
    const lignes = S.besoins.filter(function (b) {
      if (b.statut !== 'VALIDE') return false;
      return estManager() ? (b.traite_par_poste === 'Responsable' || b.traite_par_poste === 'Manager') : valideParMoi(b);
    }).sort(function (a, b) { return String(a.site).localeCompare(String(b.site)) || String(a.id).localeCompare(String(b.id)); });
    if (!lignes.length) { toast(estManager() ? 'Aucun besoin validé par les responsables ou les managers pour le moment.' : 'Vous n\'avez encore validé aucun besoin.', 'err'); return; }
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
      XLSX.utils.book_append_sheet(wb, feuille(C.SITES.map(function (p) {
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

  initConnexion();
  const sess = memoire.lire(CLE_SESSION);
  if (sess && sess.token && sess.poste) {
    demarrerSession(sess); // un jeton expiré renvoie à l'écran de connexion
  } else {
    afficherConnexion();
  }
})();
