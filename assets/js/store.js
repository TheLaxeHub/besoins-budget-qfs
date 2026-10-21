/*
 * Accès aux données : API Google Apps Script (apps-script/Code.gs).
 * La feuille Google Sheets sert de base partagée.
 *
 * Connexion : annuaire, envoyerCode, verifierCode (postes du siège), connexionSite (caissières).
 * Données (avec jeton de session) : list, create, decide, cancel, deconnexion.
 *
 * Tant que API_URL est vide (config.js), l'application indique qu'elle n'est pas reliée à sa base.
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
      // Échec sans réponse lisible : coupure réseau OU script Apps Script non accessible publiquement
      // (Google renvoie alors une page de connexion que le navigateur refuse de lire).
      throw erreur('RESEAU', navigator.onLine === false
        ? 'Pas de connexion internet.'
        : "Le serveur ne répond pas. Vérifiez que le script Apps Script est déployé avec « Exécuter en tant que : Moi » et « Qui a accès : Tout le monde », et que l'URL dans config.js est bien celle qui se termine par /exec.");
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

  /* ---------------- Règles partagées avec l'interface (le serveur applique les mêmes) ---------------- */

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
  const estExporteur = function (s) { return !!s.id && (C.EXPORTEURS || []).indexOf(s.nom) >= 0; };
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

  // Nettoie les données de démonstration laissées par d'anciennes versions dans ce navigateur.
  try {
    Object.keys(localStorage).forEach(function (k) { if (/^bud27_demo/.test(k)) localStorage.removeItem(k); });
  } catch (e) { /* stockage indisponible */ }

  const req = function (action, token, data) {
    if (!C.API_URL) {
      return Promise.reject(erreur('NON_CONFIGURE', "L'application n'est pas encore reliée à sa base de données (API_URL vide dans assets/js/config.js)."));
    }
    return appel({ action: action, token: token, data: data });
  };

  window.Store = {
    configure: !!C.API_URL,
    // Règles partagées avec l'interface (le serveur applique les mêmes).
    estMien: estMien,
    peutDecider: peutDecider,
    valideurDe: valideurDe,
    estValideur: estValideur,
    estExporteur: estExporteur,
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
