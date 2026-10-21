/*
 * Accès aux données : API Google Apps Script (apps-script/Code.gs).
 * La feuille Google Sheets sert de base partagée entre les sites et le Back Office.
 * Interface : login, list, create, decide, cancel.
 *
 * Si API_URL est vide (config.js), un MODE DÉMONSTRATION local est utilisé :
 * mêmes règles que le serveur, données gardées dans ce navigateur uniquement.
 */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const BO = C.BACK_OFFICE;
  const CATS = C.CATEGORIES.map(function (c) { return c.code; });

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

  const CLE_DEMO = 'bud27_demo_v1';
  function lireDemo() {
    try { return JSON.parse(localStorage.getItem(CLE_DEMO)) || { seq: 0, besoins: [] }; } catch (e) { return { seq: 0, besoins: [] }; }
  }
  function ecrireDemo(db) {
    try { localStorage.setItem(CLE_DEMO, JSON.stringify(db)); } catch (e) { /* stockage indisponible */ }
  }
  function texte(v, max) { return String(v === null || v === undefined ? '' : v).trim().slice(0, max); }

  const demo = {
    login: function (p) {
      const profil = texte(p.profil, 60).toUpperCase();
      if (profil !== BO && C.SITES.indexOf(profil) < 0) throw erreur('PROFIL_INCONNU', 'Profil inconnu.');
      return { ok: true, profil: profil, isBO: profil === BO };
    },
    list: function (p) {
      const db = lireDemo();
      const b = p.profil === BO ? db.besoins : db.besoins.filter(function (x) { return x.site === p.profil; });
      return { ok: true, besoins: b };
    },
    create: function (p) {
      if (p.profil === BO) throw erreur('INTERDIT', 'Seul un site peut exprimer des besoins.');
      const d = p.data || {};
      const items = d.items || [];
      if (!items.length) throw erreur('VALIDATION', 'Aucun besoin à enregistrer.');
      const db = lireDemo();
      const now = new Date().toISOString();
      const refSeq = ++db.seq;
      const ref = 'B27-' + String(refSeq).padStart(4, '0');
      const crees = items.map(function (it, k) {
        if (CATS.indexOf(it.categorie) < 0 || !it.libelle || !it.type_besoin || !(it.quantite > 0) || !it.service || !it.motif) {
          throw erreur('VALIDATION', 'Ligne ' + (k + 1) + ' incomplète.');
        }
        return {
          id: ref + '-' + String(k + 1).padStart(2, '0'), ref: ref, cree_le: now, site: p.profil,
          demandeur: texte(d.demandeur, 80), categorie: it.categorie, type_besoin: texte(it.type_besoin, 60),
          libelle: texte(it.libelle, 120), quantite: Math.round(Number(it.quantite)),
          caracteristiques: texte(it.caracteristiques, 300), service: texte(it.service, 80),
          personne: texte(it.personne, 80), motif: texte(it.motif, 1000), commentaires: texte(it.commentaires, 1000),
          statut: 'EN_ATTENTE', quantite_validee: '', commentaire_bo: '', traite_par: '', maj_le: now,
        };
      });
      db.besoins = db.besoins.concat(crees);
      ecrireDemo(db);
      return { ok: true, ref: ref, besoins: crees };
    },
    decide: function (p) {
      if (p.profil !== BO) throw erreur('INTERDIT', 'Réservé au Back Office.');
      const d = p.data || {};
      const db = lireDemo();
      const now = new Date().toISOString();
      const ids = d.ids || [];
      db.besoins.forEach(function (b) {
        if (ids.indexOf(b.id) < 0) return;
        b.statut = d.statut;
        b.quantite_validee = d.statut === 'VALIDE' ? (d.quantite_validee !== undefined && ids.length === 1 ? Number(d.quantite_validee) : b.quantite) : '';
        b.commentaire_bo = texte(d.commentaire, 1000);
        b.traite_par = texte(d.agent, 80);
        b.maj_le = now;
      });
      ecrireDemo(db);
      return { ok: true };
    },
    cancel: function (p) {
      const db = lireDemo();
      const b = db.besoins.find(function (x) { return x.id === (p.data || {}).id; });
      if (!b || b.site !== p.profil) throw erreur('INTROUVABLE', 'Besoin introuvable.');
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
  const req = function (action, s, data) {
    return envoyer({ action: action, profil: s.profil, code: s.code, data: data });
  };

  window.Store = {
    demo: !C.API_URL,
    login: function (s) { return req('login', s); },
    list: function (s) { return req('list', s); },
    create: function (s, data) { return req('create', s, data); },
    decide: function (s, data) { return req('decide', s, data); },
    cancel: function (s, data) { return req('cancel', s, data); },
  };
})();
