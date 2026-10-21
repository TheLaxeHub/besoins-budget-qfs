/**
 * Expression des besoins — Budget 2027 (QFS E-Money)
 * Backend Google Apps Script : la feuille Google Sheets sert de base de données.
 *
 * Mise en service : voir README.md (section « Mise en service »).
 *   1. Coller ce fichier dans Extensions > Apps Script de la feuille Google Sheets.
 *   2. Exécuter une fois la fonction setup() (autorisations + création des onglets).
 *   3. Déployer > Nouveau déploiement > Application Web
 *      (Exécuter en tant que : Moi — Qui a accès : Tout le monde).
 *   4. Copier l'URL /exec dans assets/js/config.js (API_URL).
 *
 * Onglets créés :
 *   - Besoins  : une ligne par besoin exprimé (une demande = plusieurs lignes, même réf.).
 *   - Acces    : un code d'accès facultatif par profil (vide = pas de code).
 *   - Synthese : tableaux récapitulatifs (formules, mis à jour automatiquement).
 */

const BACK_OFFICE = 'BACK OFFICE';

const SITES = [
  'SIEGE', 'CGI ABOBO', 'CGI ABOISSO', 'CGI AGBOVILLE', 'CGI ANGRE', 'CGI BONDOUKOU',
  'CGI BONGOUANOU', 'CGI BOUAKE', 'CGI BOUNA', 'CGI BOUNDIALI', 'CGI COSMOS', 'CGI DAOUKRO',
  'CGI DIMBOKRO', 'CGI DIVO', 'CGI FERKE', 'CGI GUIGLO', 'CGI KONG', 'CGI MANKONO',
  'CGI ODIENNE', 'CGI PHB', 'CGI SASSANDRA', 'CGI SEGUELA', 'CGI TOUBA', 'CGI VGE',
  'CGI YOPOUGON', 'FOURRIERE ABOBO', 'FOURRIERE BASSAM', 'BARRAGE GSR1', 'BARRAGE GSR2',
  'BARRAGE GSR3', 'BARRAGE PSSR1', 'BARRAGE PSSR2',
];

// À garder identique aux codes de CATEGORIES dans assets/js/config.js.
const CATEGORIES = ['INFORMATIQUE', 'MOBILIER', 'ACHATS'];
const STATUTS = ['EN_ATTENTE', 'VALIDE', 'REJETE'];

const COLS = [
  'id', 'ref', 'cree_le', 'site', 'demandeur', 'categorie', 'type_besoin', 'libelle', 'quantite',
  'caracteristiques', 'service', 'personne', 'motif', 'commentaires', 'statut', 'quantite_validee',
  'commentaire_bo', 'traite_par', 'maj_le',
];
const NUMERIQUES = ['quantite', 'quantite_validee'];

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

/** À exécuter une fois depuis l'éditeur : crée les onglets et mémorise la feuille. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Africa/Abidjan');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  const db = base_();
  synthese_(ss);
  const defaut = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (defaut && defaut.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaut);
  ss.setActiveSheet(db.besoins);
  Logger.log('Onglets prêts. Déployez maintenant le script en Application Web.');
}

/* ------------------------------------------------------------------ */
/* Routage et authentification                                         */
/* ------------------------------------------------------------------ */

function route_(req) {
  const sess = auth_(req.profil, req.code);
  switch (req.action) {
    case 'login':
      return { ok: true, profil: sess.profil, isBO: sess.isBO };
    case 'list':
      return { ok: true, besoins: lister_(sess) };
    case 'create':
      return Object.assign({ ok: true }, creer_(sess, req.data || {}));
    case 'decide':
      return Object.assign({ ok: true }, decider_(sess, req.data || {}));
    case 'cancel':
      return Object.assign({ ok: true }, retirer_(sess, req.data || {}));
    default:
      throw erreur_('ACTION_INCONNUE', 'Action inconnue.');
  }
}

function auth_(profil, code) {
  const p = String(profil || '').trim().toUpperCase();
  if (!p) throw erreur_('PROFIL_INCONNU', 'Profil manquant.');
  const acces = base_().acces.getDataRange().getValues().slice(1);
  const ligne = acces.find(function (r) { return String(r[0]).trim().toUpperCase() === p; });
  if (!ligne) throw erreur_('PROFIL_INCONNU', 'Profil « ' + p + ' » inconnu.');
  const attendu = String(ligne[1] || '').trim();
  if (attendu) {
    if (!code) throw erreur_('CODE_REQUIS', "Code d'accès requis.");
    if (String(code).trim() !== attendu) throw erreur_('CODE_INVALIDE', "Code d'accès incorrect.");
  }
  return { profil: p, isBO: p === BACK_OFFICE };
}

/* ------------------------------------------------------------------ */
/* Métier                                                              */
/* ------------------------------------------------------------------ */

function lister_(sess) {
  const tous = lire_(base_().besoins);
  return sess.isBO ? tous : tous.filter(function (b) { return b.site === sess.profil; });
}

function creer_(sess, data) {
  if (sess.isBO) throw erreur_('INTERDIT', 'Seul un site peut exprimer des besoins.');
  const demandeur = texte_(data.demandeur, 80);
  if (!demandeur) throw erreur_('VALIDATION', 'Indiquez le nom du demandeur.');
  const items = (data.items || []).map(valider_);
  if (!items.length) throw erreur_('VALIDATION', 'Aucun besoin à enregistrer.');
  if (items.length > 100) throw erreur_('VALIDATION', 'Maximum 100 lignes par envoi.');

  return verrou_(function () {
    const db = base_();
    const ref = prochaineRef_();
    const now = new Date().toISOString();
    const crees = items.map(function (it, k) {
      return Object.assign(it, {
        id: ref + '-' + ('0' + (k + 1)).slice(-2), ref: ref, cree_le: now, site: sess.profil,
        demandeur: demandeur, statut: 'EN_ATTENTE', quantite_validee: '', commentaire_bo: '',
        traite_par: '', maj_le: now,
      });
    });
    const lignes = crees.map(function (b) { return versLigne_(b); });
    db.besoins.getRange(db.besoins.getLastRow() + 1, 1, lignes.length, COLS.length).setValues(lignes);
    return { ref: ref, besoins: crees };
  });
}

function decider_(sess, data) {
  if (!sess.isBO) throw erreur_('INTERDIT', 'Réservé au Back Office.');
  const statut = String(data.statut || '');
  if (STATUTS.indexOf(statut) < 0) throw erreur_('VALIDATION', 'Décision inconnue.');
  const ids = (data.ids || []).map(String);
  if (!ids.length) throw erreur_('VALIDATION', 'Aucun besoin sélectionné.');
  const commentaire = texte_(data.commentaire, 1000);
  if (statut === 'REJETE' && !commentaire) throw erreur_('VALIDATION', 'Un commentaire est obligatoire pour un rejet.');
  const agent = texte_(data.agent, 80);
  if (!agent) throw erreur_('VALIDATION', "Indiquez le nom de l'agent.");

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
      b.statut = statut;
      if (statut === 'VALIDE') {
        const q = ids.length === 1 && data.quantite_validee !== undefined && data.quantite_validee !== '' ? Number(data.quantite_validee) : b.quantite;
        if (!(q >= 0)) throw erreur_('VALIDATION', 'Quantité validée invalide.');
        b.quantite_validee = Math.round(q);
      } else {
        b.quantite_validee = '';
      }
      b.commentaire_bo = commentaire;
      b.traite_par = agent;
      b.maj_le = now;
      sh.getRange(k + 2, 1, 1, COLS.length).setValues([versLigne_(b)]);
      maj++;
    });
    if (!maj) throw erreur_('INTROUVABLE', 'Besoin introuvable.');
    return { maj: maj };
  });
}

function retirer_(sess, data) {
  if (sess.isBO) throw erreur_('INTERDIT', 'Réservé aux sites.');
  return verrou_(function () {
    const sh = base_().besoins;
    const ligne = trouverLigne_(sh, data.id);
    if (!ligne) throw erreur_('INTROUVABLE', 'Besoin introuvable.');
    const b = depuisLigne_(sh.getRange(ligne, 1, 1, COLS.length).getValues()[0]);
    if (b.site !== sess.profil) throw erreur_('INTERDIT', "Besoin d'un autre site.");
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
    service: texte_(d.service, 80),
    personne: texte_(d.personne, 80),
    motif: texte_(d.motif, 1000),
    commentaires: texte_(d.commentaires, 1000),
  };
  const l = 'Ligne ' + (k + 1) + ' : ';
  if (CATEGORIES.indexOf(it.categorie) < 0) throw erreur_('VALIDATION', l + 'catégorie invalide.');
  if (!it.type_besoin) throw erreur_('VALIDATION', l + 'type de besoin manquant.');
  if (!it.libelle) throw erreur_('VALIDATION', l + 'libellé manquant.');
  if (!(it.quantite > 0)) throw erreur_('VALIDATION', l + 'la quantité doit être supérieure à 0.');
  if (!it.service) throw erreur_('VALIDATION', l + 'service bénéficiaire manquant.');
  if (!it.motif) throw erreur_('VALIDATION', l + 'motif manquant.');
  return it;
}

/* ------------------------------------------------------------------ */
/* Accès à la feuille                                                  */
/* ------------------------------------------------------------------ */

function base_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  const besoins = onglet_(ss, 'Besoins', COLS);
  const acces = onglet_(ss, 'Acces', ['profil', 'code']);
  if (acces.getLastRow() < 2) {
    const lignes = [[BACK_OFFICE, '']].concat(SITES.map(function (p) { return [p, '']; }));
    acces.getRange(2, 1, lignes.length, 2).setValues(lignes);
  }
  return { besoins: besoins, acces: acces };
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
    '=IFERROR(QUERY(Besoins!A1:S, "select F, H, count(A), sum(I), sum(P) where A is not null and O <> \'REJETE\' ' +
    'group by F, H order by F, sum(I) desc label F \'Catégorie\', H \'Article\', count(A) \'Lignes\', sum(I) \'Qté demandée\', sum(P) \'Qté validée\'", 1), "Aucune donnée")');
  sy.getRange('H1').setValue('Quantités demandées par site et catégorie (hors rejets)');
  sy.getRange('H2').setFormula(
    '=IFERROR(QUERY(Besoins!A1:S, "select D, sum(I) where A is not null and O <> \'REJETE\' group by D pivot F label D \'Site\'", 1), "Aucune donnée")');
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
