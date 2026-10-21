/*
 * Accès aux données : API Google Apps Script (apps-script/Code.gs).
 * La feuille Google Sheets sert de base partagée.
 *
 * Connexion : annuaire, envoyerCode, verifierCode (postes du siège), connexionSite (caissières).
 * Données (avec jeton de session) : list, create, decide, cancel, deconnexion.
 *
 * Si API_URL est vide (config.js), un MODE DÉMONSTRATION local est utilisé :
 * mêmes règles que le serveur, données gardées dans ce navigateur, code affiché à l'écran.
 */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const CATS = C.CATEGORIES.map(function (c) { return c.code; });
  const POSTES_SITE = C.POSTES.filter(function (p) { return !p.siege; }).map(function (p) { return p.libelle; });

  function erreur(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  /* ---------------- Mode en ligne (Google Apps Script) ---------------- */

  async function appel(payload) {
    let res;
    try {
      // text/plain évite la requête préalable CORS que Apps Script ne gère pas.
      res = await fetch(C.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw erreur('RESEAU', 'Impossible de joindre le serveur. Vérifiez votre connexion internet.');
    }
    if (!res.ok) throw erreur('RESEAU', 'Le serveur a répondu ' + res.status + '.');
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw erreur('REPONSE', 'Réponse inattendue du serveur (vérifiez le déploiement Apps Script).');
    }
    if (!data.ok) throw erreur(data.code || 'ERREUR', data.message || 'Erreur inconnue.');
    return data;
  }

  /* ---------------- Mode démonstration (navigateur) ---------------- */

  const CLE_DEMO = 'bud27_demo_v3';
  function lireDemo() {
    try { return JSON.parse(localStorage.getItem(CLE_DEMO)) || { seq: 0, besoins: [], otp: {}, sessions: {} }; } catch (e) { return { seq: 0, besoins: [], otp: {}, sessions: {} }; }
  }
  function ecrireDemo(db) {
    try { localStorage.setItem(CLE_DEMO, JSON.stringify(db)); } catch (e) { /* stockage indisponible */ }
  }
  function texte(v, max) { return String(v === null || v === undefined ? '' : v).trim().slice(0, max); }
  const slug = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.'); };
  const personnesDemo = function () {
    const out = [];
    C.POSTES.forEach(function (p) {
      (p.personnes || []).forEach(function (n) { out.push({ nom: n, poste: p.libelle, email: slug(n) + '@cgi.ci' }); });
    });
    return out;
  };
  const masquer = function (email) { const m = email.split('@'); return m[0].charAt(0) + '•••' + m[0].slice(-1) + '@' + m[1]; };

  function personneDemo(poste, nom) {
    const p = personnesDemo().find(function (x) { return x.poste === poste && x.nom === nom; });
    if (!p) throw erreur('PERSONNE_INCONNUE', 'Personne inconnue pour ce poste.');
    return p;
  }
  function sessionDemo(token) {
    const db = lireDemo();
    const s = db.sessions[token];
    if (!s) throw erreur('SESSION_EXPIREE', 'Session expirée, veuillez vous reconnecter.');
    return s;
  }
  function ouvrirDemo(s) {
    const db = lireDemo();
    const token = 'demo' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    db.sessions[token] = s;
    ecrireDemo(db);
    return { ok: true, token: token, session: s };
  }
  const estMien = function (s, b) { return s.id ? b.demandeur_id === s.id : b.site === s.site && b.demandeur === s.nom && b.poste === s.poste; };
  // Nom du valideur d'un besoin (ou « Managers »). Mêmes règles que valideurDe_ dans Code.gs.
  const valideurDe = function (b) {
    if (C.POSTES_MANAGER.indexOf(b.poste) >= 0) return 'Managers';
    const noms = Object.keys(C.VALIDEURS);
    for (let i = 0; i < noms.length; i++) {
      const v = C.VALIDEURS[noms[i]];
      if (v.postes.indexOf(b.poste) >= 0) return noms[i];
      if (b.demandeur_id && v.personnes.indexOf(b.demandeur) >= 0) return noms[i];
    }
    return '';
  };
  const estValideur = function (s) { return s.poste === 'Manager' || (s.poste === 'Responsable' && !!C.VALIDEURS[s.nom]); };
  const peutDecider = function (s, b) {
    const v = valideurDe(b);
    if (s.poste === 'Manager') return v === 'Managers';
    return s.poste === 'Responsable' && v === s.nom && !estMien(s, b);
  };
  const peutVoir = function (s, b) {
    if (s.poste === 'Manager' || estMien(s, b)) return true;
    if (s.poste === 'Responsable') return peutDecider(s, b);
    if (POSTES_SITE.indexOf(s.poste) >= 0) return b.site === s.site && POSTES_SITE.indexOf(b.poste) >= 0;
    return false;
  };
  const besoinEquipement = function (type) { return C.TYPES_EQUIPEMENT_ACTUEL.indexOf(type) >= 0; };

  const demo = {
    annuaire: function () {
      return { ok: true, personnes: personnesDemo().map(function (p) { return { nom: p.nom, poste: p.poste, email: masquer(p.email) }; }) };
    },
    envoyerCode: function (p) {
      const d = p.data || {};
      const pers = personneDemo(d.poste, d.nom);
      const db = lireDemo();
      const prec = db.otp[pers.email];
      if (prec && Date.now() - prec.envoye < 30000) throw erreur('TROP_TOT', "Un code vient d'être envoyé. Patientez quelques secondes avant d'en demander un autre.");
      const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const expire = Date.now() + C.OTP_MINUTES * 60000;
      db.otp[pers.email] = { code: code, expire: expire, essais: 0, envoye: Date.now() };
      ecrireDemo(db);
      return { ok: true, email: masquer(pers.email), expire: expire, duree: C.OTP_MINUTES * 60, demoCode: code };
    },
    verifierCode: function (p) {
      const d = p.data || {};
      const pers = personneDemo(d.poste, d.nom);
      const db = lireDemo();
      const otp = db.otp[pers.email];
      if (!otp || Date.now() > otp.expire) { delete db.otp[pers.email]; ecrireDemo(db); throw erreur('CODE_EXPIRE', 'Code expiré. Générez un nouveau code.'); }
      if (String(d.code) !== otp.code) {
        otp.essais++;
        if (otp.essais >= 5) { delete db.otp[pers.email]; ecrireDemo(db); throw erreur('CODE_EXPIRE', 'Trop de tentatives. Générez un nouveau code.'); }
        ecrireDemo(db);
        throw erreur('CODE_INVALIDE', 'Code incorrect (' + (5 - otp.essais) + ' essai(s) restant(s)).');
      }
      delete db.otp[pers.email];
      ecrireDemo(db);
      return ouvrirDemo({ poste: pers.poste, site: C.SITE_SIEGE, nom: pers.nom, id: pers.email });
    },
    connexionSite: function (p) {
      const d = p.data || {};
      if (POSTES_SITE.indexOf(d.poste) < 0) throw erreur('INTERDIT', 'Ce poste se connecte avec un code envoyé par e-mail.');
      if (C.SITES.indexOf(d.site) < 0) throw erreur('VALIDATION', 'Site inconnu.');
      const nom = texte(d.nom, 80);
      if (nom.length < 2) throw erreur('VALIDATION', 'Indiquez votre nom et prénom.');
      const db = lireDemo();
      db.agents = db.agents || [];
      const ex = db.agents.find(function (a) { return a.site === d.site && a.poste === d.poste && a.nom.toLowerCase() === nom.toLowerCase(); });
      if (!ex) { db.agents.push({ site: d.site, poste: d.poste, nom: nom }); ecrireDemo(db); }
      return ouvrirDemo({ poste: d.poste, site: d.site, nom: ex ? ex.nom : nom, id: '' });
    },
    agentsSite: function (p) {
      const d = p.data || {};
      const agents = (lireDemo().agents || []).filter(function (a) { return a.site === d.site && a.poste === d.poste; })
        .map(function (a) { return a.nom; }).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
      return { ok: true, agents: agents };
    },
    deconnexion: function (p) {
      const db = lireDemo();
      delete db.sessions[p.token];
      ecrireDemo(db);
      return { ok: true };
    },
    list: function (p) {
      const s = sessionDemo(p.token);
      return { ok: true, besoins: lireDemo().besoins.filter(function (b) { return peutVoir(s, b); }) };
    },
    create: function (p) {
      const s = sessionDemo(p.token);
      const items = (p.data || {}).items || [];
      if (!items.length) throw erreur('VALIDATION', 'Aucun besoin à enregistrer.');
      const db = lireDemo();
      const now = new Date().toISOString();
      const ref = 'B27-' + String(++db.seq).padStart(4, '0');
      const crees = items.map(function (it, k) {
        if (CATS.indexOf(it.categorie) < 0 || !it.libelle || !it.type_besoin || !(it.quantite > 0) || !it.motif) {
          throw erreur('VALIDATION', 'Ligne ' + (k + 1) + ' incomplète.');
        }
        if (besoinEquipement(it.type_besoin) && (!(Number(it.annee_acquisition) > 1980) || C.ETATS_EQUIPEMENT.indexOf(it.etat_actuel) < 0)) {
          throw erreur('VALIDATION', 'Ligne ' + (k + 1) + " : année d'acquisition et état de l'équipement actuel obligatoires.");
        }
        return {
          id: ref + '-' + String(k + 1).padStart(2, '0'), ref: ref, cree_le: now, site: s.site,
          demandeur: s.nom, poste: s.poste, demandeur_id: s.id || '', categorie: it.categorie,
          type_besoin: texte(it.type_besoin, 60), libelle: texte(it.libelle, 120), quantite: Math.round(Number(it.quantite)),
          caracteristiques: texte(it.caracteristiques, 300), service: '', personne: '',
          motif: texte(it.motif, 1000), commentaires: '',
          annee_acquisition: besoinEquipement(it.type_besoin) ? Number(it.annee_acquisition) : '',
          etat_actuel: besoinEquipement(it.type_besoin) ? it.etat_actuel : '',
          statut: 'EN_ATTENTE', quantite_validee: '', commentaire_bo: '', traite_par: '', traite_par_poste: '', traite_par_id: '', maj_le: now,
        };
      });
      db.besoins = db.besoins.concat(crees);
      ecrireDemo(db);
      return { ok: true, ref: ref, besoins: crees };
    },
    decide: function (p) {
      const s = sessionDemo(p.token);
      const d = p.data || {};
      if (d.statut === 'REJETE' && !texte(d.commentaire, 1000)) throw erreur('VALIDATION', 'Un commentaire est obligatoire pour un rejet.');
      const db = lireDemo();
      const now = new Date().toISOString();
      const ids = d.ids || [];
      db.besoins.forEach(function (b) {
        if (ids.indexOf(b.id) < 0) return;
        if (!peutDecider(s, b)) throw erreur('INTERDIT', 'Vous ne pouvez pas valider le besoin ' + b.id + '.');
        const att = d.statut === 'EN_ATTENTE';
        b.statut = d.statut;
        b.quantite_validee = d.statut === 'VALIDE' ? (d.quantite_validee !== undefined && ids.length === 1 ? Number(d.quantite_validee) : b.quantite) : '';
        b.commentaire_bo = texte(d.commentaire, 1000);
        b.traite_par = att ? '' : s.nom;
        b.traite_par_poste = att ? '' : s.poste;
        b.traite_par_id = att ? '' : (s.id || '');
        b.maj_le = now;
      });
      ecrireDemo(db);
      return { ok: true };
    },
    cancel: function (p) {
      const s = sessionDemo(p.token);
      const db = lireDemo();
      const b = db.besoins.find(function (x) { return x.id === (p.data || {}).id; });
      if (!b) throw erreur('INTROUVABLE', 'Besoin introuvable.');
      if (!estMien(s, b)) throw erreur('INTERDIT', 'Vous ne pouvez retirer que vos propres besoins.');
      if (b.statut !== 'EN_ATTENTE') throw erreur('INTERDIT', 'Seuls les besoins en attente peuvent être retirés.');
      db.besoins = db.besoins.filter(function (x) { return x !== b; });
      ecrireDemo(db);
      return { ok: true };
    },
  };

  function demoAppel(payload) {
    return new Promise(function (res, rej) {
      setTimeout(function () {
        try { res(demo[payload.action](payload)); } catch (e) { rej(e); }
      }, 250);
    });
  }

  const envoyer = C.API_URL ? appel : demoAppel;
  const req = function (action, token, data) { return envoyer({ action: action, token: token, data: data }); };

  window.Store = {
    demo: !C.API_URL,
    // Règles partagées avec l'interface (le serveur applique les mêmes).
    estMien: estMien,
    peutDecider: peutDecider,
    valideurDe: valideurDe,
    estValideur: estValideur,
    annuaire: function () { return req('annuaire'); },
    envoyerCode: function (d) { return req('envoyerCode', null, d); },
    verifierCode: function (d) { return req('verifierCode', null, d); },
    connexionSite: function (d) { return req('connexionSite', null, d); },
    agentsSite: function (d) { return req('agentsSite', null, d); },
    deconnexion: function (s) { return req('deconnexion', s.token); },
    list: function (s) { return req('list', s.token); },
    create: function (s, data) { return req('create', s.token, data); },
    decide: function (s, data) { return req('decide', s.token, data); },
    cancel: function (s, data) { return req('cancel', s.token, data); },
  };
})();
