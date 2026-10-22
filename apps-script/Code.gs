/**
 * Expression des besoins — Budget 2027 (QFS E-Money)
 * Backend Google Apps Script : la feuille Google Sheets sert de base de données.
 *
 * Mise en service : voir README.md (section « Mise en service »).
 *   1. Coller ce fichier dans Extensions > Apps Script de la feuille Google Sheets.
 *   2. Exécuter une fois la fonction setup() (autorisations, dont l'envoi d'e-mails + création des onglets).
 *   3. Déployer > Nouveau déploiement > Application Web
 *      (Exécuter en tant que : Moi — Qui a accès : Tout le monde).
 *   4. Copier l'URL /exec dans assets/js/config.js (API_URL).
 *
 * Onglets :
 *   - Besoins   : une ligne par besoin exprimé (une demande = plusieurs lignes, même réf.).
 *   - Personnes : agents du siège (nom, poste, e-mail) — reçoivent un code à 4 chiffres pour se connecter.
 *   - Agents    : caissières déjà connectées (site, poste, nom) — proposées à la connexion (« Je suis… »).
 *   - Synthese  : tableaux récapitulatifs (formules, mis à jour automatiquement).
 *
 * Connexion :
 *   - Caissière ordinaire / Caissière E-money : site + nom, accès direct.
 *   - Opérateur, Assistant, Chef, Responsable, Manager : site SIEGE, nom choisi dans « Personnes »,
 *     code à 4 chiffres envoyé par e-mail, valable OTP_MINUTES minutes.
 */

const SITE_SIEGE = 'SIEGE';
// Sites proposés à chaque poste en agence (à garder identique à SITES_PAR_POSTE dans assets/js/config.js).
const SITES_PAR_POSTE = {
  'Caissière ordinaire': [
    'SIEGE', 'FOURRIERE AGBAN', 'GUA', 'CGI PARK BASSAM', 'ABENGOUROU', 'SICTA YOPOUGON ZONE INDUSTRIELLE',
    'ADZOPE', 'CGI STAR AUTO MARCORY', 'CGI YOPOUGON', 'GUB', 'CGI ANGRE', 'VGE', 'SICTA ANGRE', 'PONT',
    'ABOBO', 'EQM CAMP AGBAN', 'STI BARR INT', 'DABOU', 'EQM CAMP AKOUEDO', 'SICTA NIANGON', 'SICTA PLATEAU',
    'FOURRIERE MARCORY', 'DALOA', 'FOURRIERE TAMPON PREFECTURE DE POLICE ABOBO', 'GUK', 'CGI KORHOGO',
    'CGI BASSAM', 'CGI BOUAKE', 'SAN-PEDRO', 'FOURRIERE BASSAM', 'RECTA CI', 'GAGNOA', 'SILOTEC', 'SICTA YAOU',
    'MAN', 'GUIGLO', 'YAMOUSSOUKRO', 'SICTA VRIDI', 'CGI PARK BASE PSSR', 'MAYELIA COCODY', 'PSSR ABIDJAN MALL',
    'SICTA MARCORY PLAYCE', 'EQM YOP BAE',
  ],
  'Caissière E-money': [
    'ABOBO', 'ABOISSO', 'AGBOVILLE', 'ANGRE', 'BONDOUKOU', 'BONGOUANOU', 'BOUAKE', 'BOUNA', 'BOUNDIALI',
    'COSMOS', 'DAOUKRO', 'DIMBOKRO', 'DIVO', 'FERKE', 'FOURRIERE ABOBO', 'FOURRIERE BASSAM', 'GUIGLO', 'KONG',
    'MANKONO', 'KATIOLA', 'ODIENNE', 'PHB', 'SASSANDRA', 'SEGUELA', 'TOUBA', 'SIEGE', 'VGE', 'YOPOUGON',
  ],
};

const POSTES_SITE = ['Caissière ordinaire', 'Caissière E-money'];
const POSTES_SIEGE = ['Opérateur', 'Assistant', 'Chef', 'Responsable', 'Manager'];

// Responsables valideurs (à garder identique à VALIDEURS dans assets/js/config.js).
// Les autres responsables ne valident pas. Les Managers valident les besoins des postes POSTES_MANAGER.
const VALIDEURS = {
  'Zeinab Kone': { postes: ['Caissière E-money'], personnes: ['Aminata Sow', 'Anne Adjo', 'Axel Kouamenan'] },
  'Yaya Comara': { postes: ['Caissière ordinaire'], personnes: ['Kader Soro', 'Isaac Kone', 'Kady Bakayoko', 'Yasmine Kamagate', 'Mohamed Cisse'] },
};
const POSTES_MANAGER = ['Responsable', 'Manager'];
// Personnes du siège qui exportent tous les besoins validés sans les valider (à garder identique à config.js).
const EXPORTEURS = ['Rita Kessie'];

// Types pour lesquels l'année d'acquisition et l'état de l'équipement actuel sont obligatoires.
const TYPES_EQUIPEMENT_ACTUEL = ['Remplacement Équipement Défectueux', 'Renouvellement'];
const ETATS_EQUIPEMENT = ['Hors service', 'En panne (réparable)', 'Défectueux / fonctionne mal', 'Usé / vétuste', 'Fonctionnel'];

// Valeurs initiales de l'onglet « Personnes » (modifiable ensuite directement dans la feuille).
const PERSONNES_INIT = [
  ['Isaac Kone', 'Opérateur', 'isaac.kone@cgi.ci'],
  ['Yasmine Kamagate', 'Opérateur', 'yasmine.kamagate@cgi.ci'],
  ['Anne Adjo', 'Opérateur', 'anne.niamkoun@cgi.ci'],
  ['Mohamed Cisse', 'Opérateur', 'mohamed.cisse@cgi.ci'],
  ['Aminata Sow', 'Assistant', 'aminata.sow@cgi.ci'],
  ['Kady Bakayoko', 'Assistant', 'karidja.bakayoko@cgi.ci'],
  ['Axel Kouamenan', 'Chef', 'axel.kouamenan@cgi.ci'],
  ['Kader Soro', 'Chef', 'kader.soro@cgi.ci'],
  ['Zeinab Kone', 'Responsable', 'zeinab.kone@cgi.ci'],
  ['Yaya Comara', 'Responsable', 'yaya.comara@cgi.ci'],
  ['Massandje Dagnoko', 'Responsable', 'massandje.dagnoko@cgi.ci'],
  ['Rita Kessie', 'Responsable', 'rita.kessie@cgi.ci'],
  ['Issa Kone', 'Manager', 'issa.kone@cgi.ci'],
  ['Jansenus Koffi', 'Manager', 'jansenus.koffi@cgi.ci'],
];

const OTP_MINUTES = 5;
const OTP_ESSAIS_MAX = 5;
const OTP_DELAI_RENVOI_S = 30;
const SESSION_SECONDES = 6 * 3600; // maximum autorisé par CacheService

// À garder identique aux codes de CATEGORIES dans assets/js/config.js.
const CATEGORIES = ['INFORMATIQUE', 'MOBILIER', 'ACHATS'];
const STATUTS = ['EN_ATTENTE', 'VALIDE', 'REJETE'];

const COLS = [
  'id', 'ref', 'cree_le', 'site', 'demandeur', 'categorie', 'type_besoin', 'libelle', 'quantite',
  'caracteristiques', 'service', 'personne', 'motif', 'commentaires', 'statut', 'quantite_validee',
  'commentaire_bo', 'traite_par', 'maj_le', 'poste', 'demandeur_id', 'traite_par_poste', 'traite_par_id',
  'annee_acquisition', 'etat_actuel',
];
const NUMERIQUES = ['quantite', 'quantite_validee', 'annee_acquisition'];

/* ------------------------------------------------------------------ */
/* Points d'entrée                                                     */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, message: 'API Besoins Budget 2027 opérationnelle.' });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = route_(req);
  } catch (err) {
    out = { ok: false, code: err.code || 'ERREUR', message: err.message || String(err) };
  }
  return json_(out);
}

/** À exécuter une fois depuis l'éditeur : crée les onglets, mémorise la feuille, autorise l'envoi d'e-mails. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Africa/Abidjan');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  const db = base_();
  synthese_(ss);
  const defaut = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (defaut && defaut.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaut);
  ss.setActiveSheet(db.besoins);
  Logger.log('Quota d\'e-mails restant aujourd\'hui : ' + MailApp.getRemainingDailyQuota());
  Logger.log('Onglets prêts. Déployez maintenant le script en Application Web.');
}

/* ------------------------------------------------------------------ */
/* Routage                                                             */
/* ------------------------------------------------------------------ */

function route_(req) {
  const d = req.data || {};
  switch (req.action) {
    // Sans session
    case 'annuaire': return { ok: true, personnes: annuaire_() };
    case 'envoyerCode': return Object.assign({ ok: true }, envoyerCode_(d));
    case 'verifierCode': return Object.assign({ ok: true }, verifierCode_(d));
    case 'connexionSite': return Object.assign({ ok: true }, connexionSite_(d));
    case 'agentsSite': return { ok: true, agents: agentsSite_(d) };
  }
  const sess = session_(req.token);
  switch (req.action) {
    case 'moi': return { ok: true, session: sess };
    case 'deconnexion': CacheService.getScriptCache().remove('sess_' + req.token); return { ok: true };
    case 'list': return { ok: true, besoins: lister_(sess) };
    case 'create': return Object.assign({ ok: true }, creer_(sess, d));
    case 'decide': return Object.assign({ ok: true }, decider_(sess, d));
    case 'cancel': return Object.assign({ ok: true }, retirer_(sess, d));
    default: throw erreur_('ACTION_INCONNUE', 'Action inconnue.');
  }
}

/* ------------------------------------------------------------------ */
/* Connexion                                                           */
/* ------------------------------------------------------------------ */

function personnes_() {
  const sh = base_().personnes;
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .map(function (r) { return { nom: String(r[0]).trim(), poste: String(r[1]).trim(), email: String(r[2]).trim().toLowerCase() }; })
    .filter(function (p) { return p.nom && p.email && POSTES_SIEGE.indexOf(p.poste) >= 0; });
}

function masquer_(email) {
  const m = String(email).split('@');
  return m[0].charAt(0) + '•••' + (m[0].length > 1 ? m[0].slice(-1) : '') + '@' + (m[1] || '');
}

/** Liste publique (sans les adresses complètes) pour l'écran de connexion. */
function annuaire_() {
  return personnes_().map(function (p) { return { nom: p.nom, poste: p.poste, email: masquer_(p.email) }; });
}

function trouverPersonne_(poste, nom) {
  const p = personnes_().find(function (x) { return x.poste === String(poste) && x.nom === String(nom); });
  if (!p) throw erreur_('PERSONNE_INCONNUE', 'Personne inconnue pour ce poste.');
  return p;
}

function envoyerCode_(d) {
  const p = trouverPersonne_(d.poste, d.nom);
  const cache = CacheService.getScriptCache();
  const cleRenvoi = 'otp_renvoi_' + p.email;
  if (cache.get(cleRenvoi)) throw erreur_('TROP_TOT', 'Un code vient d\'être envoyé. Patientez quelques secondes avant d\'en demander un autre.');

  const code = ('000' + Math.floor(Math.random() * 10000)).slice(-4);
  const expire = Date.now() + OTP_MINUTES * 60000;
  cache.put('otp_' + p.email, JSON.stringify({ code: code, expire: expire, essais: 0 }), OTP_MINUTES * 60);
  cache.put(cleRenvoi, '1', OTP_DELAI_RENVOI_S);

  MailApp.sendEmail({
    to: p.email,
    subject: 'Votre code de connexion : ' + code + ' — Besoins Budget 2027',
    htmlBody:
      '<div style="font-family:Arial,sans-serif;color:#111827">' +
      '<p>Bonjour ' + p.nom + ',</p>' +
      '<p>Voici votre code de connexion à la plateforme <b>Expression des Besoins — Budget 2027</b> (QFS E-Money) :</p>' +
      '<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:18px 0">' + code + '</p>' +
      '<p>Ce code est valable <b>' + OTP_MINUTES + ' minutes</b>. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message.</p>' +
      '<p style="color:#6b7280;font-size:12px">Quipux Financial Services — message automatique, merci de ne pas répondre.</p></div>',
    name: 'QFS — Besoins Budget 2027',
  });
  return { email: masquer_(p.email), expire: expire, duree: OTP_MINUTES * 60 };
}

function verifierCode_(d) {
  const p = trouverPersonne_(d.poste, d.nom);
  const cache = CacheService.getScriptCache();
  const cle = 'otp_' + p.email;
  const brut = cache.get(cle);
  const otp = brut ? JSON.parse(brut) : null;
  if (!otp || Date.now() > otp.expire) {
    cache.remove(cle);
    throw erreur_('CODE_EXPIRE', 'Code expiré. Générez un nouveau code.');
  }
  if (String(d.code || '').trim() !== otp.code) {
    otp.essais++;
    if (otp.essais >= OTP_ESSAIS_MAX) {
      cache.remove(cle);
      throw erreur_('CODE_EXPIRE', 'Trop de tentatives. Générez un nouveau code.');
    }
    const reste = Math.max(1, Math.floor((otp.expire - Date.now()) / 1000));
    cache.put(cle, JSON.stringify(otp), reste);
    throw erreur_('CODE_INVALIDE', 'Code incorrect (' + (OTP_ESSAIS_MAX - otp.essais) + ' essai(s) restant(s)).');
  }
  cache.remove(cle);
  return ouvrirSession_({ poste: p.poste, site: SITE_SIEGE, nom: p.nom, id: p.email });
}

function connexionSite_(d) {
  const poste = String(d.poste || '');
  const site = String(d.site || '').trim().toUpperCase();
  const nom = texte_(d.nom, 80);
  if (POSTES_SITE.indexOf(poste) < 0) throw erreur_('INTERDIT', 'Ce poste se connecte avec un code envoyé par e-mail.');
  if ((SITES_PAR_POSTE[poste] || []).indexOf(site) < 0) throw erreur_('VALIDATION', 'Site inconnu pour ce poste.');
  if (nom.length < 2) throw erreur_('VALIDATION', 'Indiquez votre nom et prénom.');
  const existant = agentsSite_({ poste: poste, site: site }).find(function (n) { return n.toLowerCase() === nom.toLowerCase(); });
  if (!existant) {
    verrou_(function () { base_().agents.appendRow([site, poste, "'" + nom.replace(/^[=+\-@]+/, ''), new Date().toISOString()]); });
  }
  return ouvrirSession_({ poste: poste, site: site, nom: existant || nom, id: '' });
}

/** Caissières déjà enregistrées pour ce site et ce poste (pour l'écran « Je suis… »). */
function agentsSite_(d) {
  const poste = String(d.poste || '');
  const site = String(d.site || '').trim().toUpperCase();
  const sh = base_().agents;
  if (sh.getLastRow() < 2) return [];
  const vus = {};
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return String(r[0]) === site && String(r[1]) === poste && String(r[2]).trim(); })
    .map(function (r) { return String(r[2]).trim(); })
    .filter(function (n) { const k = n.toLowerCase(); if (vus[k]) return false; vus[k] = 1; return true; })
    .sort(function (a, b) { return a.localeCompare(b, 'fr'); });
}

function ouvrirSession_(s) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(s), SESSION_SECONDES);
  return { token: token, session: s };
}

function session_(token) {
  if (!token) throw erreur_('SESSION_EXPIREE', 'Veuillez vous connecter.');
  const cache = CacheService.getScriptCache();
  const brut = cache.get('sess_' + token);
  if (!brut) throw erreur_('SESSION_EXPIREE', 'Session expirée, veuillez vous reconnecter.');
  cache.put('sess_' + token, brut, SESSION_SECONDES); // prolonge la session tant qu'elle est utilisée
  return JSON.parse(brut);
}

/* ------------------------------------------------------------------ */
/* Droits                                                              */
/* ------------------------------------------------------------------ */

function estMien_(s, b) {
  if (s.id) return b.demandeur_id === s.id;
  return b.site === s.site && b.demandeur === s.nom && b.poste === s.poste;
}

/** Nom du responsable qui valide ce besoin, 'Managers', ou '' si personne n'est désigné. */
function valideurDe_(b) {
  if (POSTES_MANAGER.indexOf(b.poste) >= 0) return 'Managers';
  const noms = Object.keys(VALIDEURS);
  for (let i = 0; i < noms.length; i++) {
    const v = VALIDEURS[noms[i]];
    if (v.postes.indexOf(b.poste) >= 0) return noms[i];
    if (b.demandeur_id && v.personnes.indexOf(b.demandeur) >= 0) return noms[i];
  }
  return '';
}

function peutDecider_(s, b) {
  const v = valideurDe_(b);
  if (s.poste === 'Manager') return v === 'Managers';
  return s.poste === 'Responsable' && v === s.nom && !estMien_(s, b); // un responsable ne valide pas ses propres besoins
}

function peutVoir_(s, b) {
  if (s.poste === 'Manager') return true;
  if (estMien_(s, b)) return true;
  if (s.id && EXPORTEURS.indexOf(s.nom) >= 0 && b.statut === 'VALIDE') return true; // export des besoins validés
  if (s.poste === 'Responsable') return peutDecider_(s, b);
  if (POSTES_SITE.indexOf(s.poste) >= 0) return b.site === s.site && POSTES_SITE.indexOf(b.poste) >= 0;
  return false;
}

/* ------------------------------------------------------------------ */
/* Métier                                                              */
/* ------------------------------------------------------------------ */

function lister_(s) {
  return lire_(base_().besoins).filter(function (b) { return peutVoir_(s, b); });
}

function creer_(s, data) {
  const items = (data.items || []).map(valider_);
  if (!items.length) throw erreur_('VALIDATION', 'Aucun besoin à enregistrer.');
  if (items.length > 100) throw erreur_('VALIDATION', 'Maximum 100 lignes par envoi.');

  return verrou_(function () {
    const db = base_();
    const ref = prochaineRef_();
    const now = new Date().toISOString();
    const crees = items.map(function (it, k) {
      return Object.assign(it, {
        id: ref + '-' + ('0' + (k + 1)).slice(-2), ref: ref, cree_le: now, site: s.site,
        demandeur: s.nom, poste: s.poste, demandeur_id: s.id || '', statut: 'EN_ATTENTE',
        quantite_validee: '', commentaire_bo: '', traite_par: '', traite_par_poste: '', traite_par_id: '', maj_le: now,
      });
    });
    const lignes = crees.map(function (b) { return versLigne_(b); });
    db.besoins.getRange(db.besoins.getLastRow() + 1, 1, lignes.length, COLS.length).setValues(lignes);
    return { ref: ref, besoins: crees };
  });
}

function decider_(s, data) {
  const statut = String(data.statut || '');
  if (STATUTS.indexOf(statut) < 0) throw erreur_('VALIDATION', 'Décision inconnue.');
  const ids = (data.ids || []).map(String);
  if (!ids.length) throw erreur_('VALIDATION', 'Aucun besoin sélectionné.');
  const commentaire = texte_(data.commentaire, 1000);
  if (statut === 'REJETE' && !commentaire) throw erreur_('VALIDATION', 'Un commentaire est obligatoire pour un rejet.');

  return verrou_(function () {
    const sh = base_().besoins;
    const n = sh.getLastRow() - 1;
    if (n < 1) throw erreur_('INTROUVABLE', 'Besoin introuvable.');
    const valeurs = sh.getRange(2, 1, n, COLS.length).getValues();
    const now = new Date().toISOString();
    let maj = 0;
    valeurs.forEach(function (r, k) {
      if (ids.indexOf(String(r[0])) < 0) return;
      const b = depuisLigne_(r);
      if (!peutDecider_(s, b)) throw erreur_('INTERDIT', 'Vous ne pouvez pas valider le besoin ' + b.id + '.');
      b.statut = statut;
      if (statut === 'VALIDE') {
        const q = ids.length === 1 && data.quantite_validee !== undefined && data.quantite_validee !== '' ? Number(data.quantite_validee) : b.quantite;
        if (!(q >= 0)) throw erreur_('VALIDATION', 'Quantité validée invalide.');
        b.quantite_validee = Math.round(q);
      } else {
        b.quantite_validee = '';
      }
      b.commentaire_bo = commentaire;
      b.traite_par = statut === 'EN_ATTENTE' ? '' : s.nom;
      b.traite_par_poste = statut === 'EN_ATTENTE' ? '' : s.poste;
      b.traite_par_id = statut === 'EN_ATTENTE' ? '' : (s.id || '');
      b.maj_le = now;
      sh.getRange(k + 2, 1, 1, COLS.length).setValues([versLigne_(b)]);
      maj++;
    });
    if (!maj) throw erreur_('INTROUVABLE', 'Besoin introuvable.');
    return { maj: maj };
  });
}

function retirer_(s, data) {
  return verrou_(function () {
    const sh = base_().besoins;
    const ligne = trouverLigne_(sh, data.id);
    if (!ligne) throw erreur_('INTROUVABLE', 'Besoin introuvable.');
    const b = depuisLigne_(sh.getRange(ligne, 1, 1, COLS.length).getValues()[0]);
    if (!estMien_(s, b)) throw erreur_('INTERDIT', 'Vous ne pouvez retirer que vos propres besoins.');
    if (b.statut !== 'EN_ATTENTE') throw erreur_('INTERDIT', 'Seuls les besoins en attente peuvent être retirés.');
    sh.deleteRow(ligne);
    return { id: b.id };
  });
}

function valider_(d, k) {
  const it = {
    categorie: String(d.categorie || '').toUpperCase(),
    type_besoin: texte_(d.type_besoin, 60),
    libelle: texte_(d.libelle, 120),
    quantite: Math.round(Number(d.quantite)),
    caracteristiques: texte_(d.caracteristiques, 300),
    service: '',
    personne: '',
    motif: texte_(d.motif, 1000),
    commentaires: '',
    annee_acquisition: '',
    etat_actuel: '',
  };
  const l = 'Ligne ' + (k + 1) + ' : ';
  if (CATEGORIES.indexOf(it.categorie) < 0) throw erreur_('VALIDATION', l + 'catégorie invalide.');
  if (!it.type_besoin) throw erreur_('VALIDATION', l + 'type de besoin manquant.');
  if (!it.libelle) throw erreur_('VALIDATION', l + 'libellé manquant.');
  if (!(it.quantite > 0)) throw erreur_('VALIDATION', l + 'la quantité doit être supérieure à 0.');
  if (!it.motif) throw erreur_('VALIDATION', l + 'motif manquant.');
  if (TYPES_EQUIPEMENT_ACTUEL.indexOf(it.type_besoin) >= 0) {
    const annee = Math.round(Number(d.annee_acquisition));
    if (!(annee >= 1980 && annee <= new Date().getFullYear())) throw erreur_('VALIDATION', l + "année d'acquisition de l'équipement actuel invalide.");
    if (ETATS_EQUIPEMENT.indexOf(String(d.etat_actuel)) < 0) throw erreur_('VALIDATION', l + "état de l'équipement actuel manquant.");
    it.annee_acquisition = annee;
    it.etat_actuel = String(d.etat_actuel);
  }
  return it;
}

/* ------------------------------------------------------------------ */
/* Accès à la feuille                                                  */
/* ------------------------------------------------------------------ */

function base_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  const besoins = onglet_(ss, 'Besoins', COLS);
  const personnes = onglet_(ss, 'Personnes', ['nom', 'poste', 'email']);
  if (personnes.getLastRow() < 2) {
    personnes.getRange(2, 1, PERSONNES_INIT.length, 3).setValues(PERSONNES_INIT);
    personnes.setColumnWidths(1, 3, 220);
  }
  const agents = onglet_(ss, 'Agents', ['site', 'poste', 'nom', 'cree_le']);
  return { besoins: besoins, personnes: personnes, agents: agents };
}

function onglet_(ss, nom, cols) {
  let sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#0D47A1').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    NUMERIQUES.forEach(function (c) {
      const i = cols.indexOf(c);
      if (i >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('0');
    });
  }
  return sh;
}

/** Onglet de synthèse pour consulter les totaux directement dans la feuille. */
function synthese_(ss) {
  if (ss.getSheetByName('Synthese')) return;
  const sy = ss.insertSheet('Synthese');
  sy.getRange('A1').setValue('Quantités par catégorie et article (hors rejets)');
  sy.getRange('A2').setFormula(
    '=IFERROR(QUERY(Besoins!A1:Y, "select F, H, count(A), sum(I), sum(P) where A is not null and O <> \'REJETE\' ' +
    'group by F, H order by F, sum(I) desc label F \'Catégorie\', H \'Article\', count(A) \'Lignes\', sum(I) \'Qté demandée\', sum(P) \'Qté validée\'", 1), "Aucune donnée")');
  sy.getRange('H1').setValue('Quantités demandées par site et catégorie (hors rejets)');
  sy.getRange('H2').setFormula(
    '=IFERROR(QUERY(Besoins!A1:Y, "select D, sum(I) where A is not null and O <> \'REJETE\' group by D pivot F label D \'Site\'", 1), "Aucune donnée")');
  sy.getRange('A1:N1').setFontWeight('bold').setFontColor('#0D47A1');
  sy.setColumnWidth(2, 280);
}

function lire_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(depuisLigne_);
}

function depuisLigne_(r) {
  const o = {};
  COLS.forEach(function (c, i) {
    let v = r[i];
    if (v instanceof Date) v = v.toISOString();
    if (NUMERIQUES.indexOf(c) >= 0) o[c] = v === '' || v === null ? '' : Number(v) || 0;
    else o[c] = v === null || v === undefined ? '' : String(v);
  });
  return o;
}

function versLigne_(o) {
  return COLS.map(function (c) {
    const v = o[c];
    if (NUMERIQUES.indexOf(c) >= 0) return v === '' || v === null || v === undefined ? '' : Number(v);
    const s = v === null || v === undefined ? '' : String(v);
    // Force le texte : pas de formule (=, +, -, @) ni de conversion automatique des dates ISO.
    return /^[=+\-@]/.test(s) || /^[\d\s.,:\/TZ+-]+$/.test(s) ? "'" + s : s;
  });
}

function trouverLigne_(sh, id) {
  if (!id || sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let k = 0; k < ids.length; k++) {
    if (String(ids[k][0]) === String(id)) return k + 2;
  }
  return 0;
}

function prochaineRef_() {
  const props = PropertiesService.getScriptProperties();
  const seq = Number(props.getProperty('SEQ_DEMANDE') || 0) + 1;
  props.setProperty('SEQ_DEMANDE', String(seq));
  return 'B27-' + ('0000' + seq).slice(-4);
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function verrou_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function texte_(v, max) {
  return String(v === null || v === undefined ? '' : v).trim().slice(0, max);
}

function erreur_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
