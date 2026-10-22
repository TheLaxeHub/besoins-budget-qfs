/*
 * Configuration de l'application — Expression des besoins Budget 2027 (QFS E-Money).
 * C'est le seul fichier à modifier pour adapter l'application.
 */
window.APP_CONFIG = {
  // URL de l'application Web Google Apps Script (voir README, « Mise en service »).
  // Vide = MODE DÉMONSTRATION : les données restent dans le navigateur (pour tester l'interface).
  API_URL: 'https://script.google.com/macros/s/AKfycbymsMxmwX9OYciYQNv43SNPPwma4ZNCfLXfAQtGH9WMqvocCJWoaeferfG3bGBinl6X/exec',

  APP_TITRE: 'Expression des Besoins — Budget 2027',
  APP_SOUS_TITRE: 'QFS E-Money — Informatique, Mobilier & Achats',
  CAMPAGNE: 'Budget 2027',
  // Date limite de saisie affichée aux sites (format AAAA-MM-JJ, vide = pas de date limite).
  DATE_LIMITE: '',

  // Sites de déploiement (choisis par les caissières). Les postes du siège sont rattachés à SITE_SIEGE.
  // À garder identique à SITES dans apps-script/Code.gs.
  SITE_SIEGE: 'SIEGE',
  SITES: [
    'ABATTA', 'ABOBO', 'ANGRE', 'BOUAKE', 'PONT FHB', 'VGE', 'YAOU', 'YOPOUGON', 'DABOU', 'DALOA',
    'DIVO', 'GAGNOA', 'KORHOGO', 'MAN', 'SAN-PEDRO', 'SOUBRE', 'YAKRO', 'ABENGOUROU', 'ABOISSO',
    'GUIGLO', 'BONDOUKOU', 'BOUAFLE', 'ADZOPE', 'DAOUKRO', 'FERKE', 'SEGUELA', 'ODIENNE',
    'BOUNDIALI', 'KATIOLA', 'KONG', 'AGBOVILLE', 'SASSANDRA', 'DUEKOUE', 'TOUMODI', 'MINIGNAN',
    'MANKONO', 'BONGOUANOU', 'DIMBOKRO', 'TOUBA', 'BOUNA', 'COSMOS',
  ],

  // Postes proposés à la connexion (1re étape).
  //  - siege: false → l'agent choisit son site puis saisit son nom (pas de code).
  //  - siege: true  → site SIEGE, l'agent choisit son nom et reçoit un code à 4 chiffres par e-mail.
  // `personnes` ne sert qu'au MODE DÉMONSTRATION : en ligne, la liste (avec les e-mails) vient de
  // l'onglet « Personnes » de la feuille Google Sheets.
  POSTES: [
    { libelle: 'Caissière ordinaire', siege: false, ico: 'user-round', aide: 'Besoins de mon site' },
    { libelle: 'Caissière E-money', siege: false, ico: 'smartphone', aide: 'Besoins de mon site' },
    { libelle: 'Opérateur', siege: true, ico: 'headset', aide: 'Mes besoins', personnes: ['Isaac Kone', 'Yasmine Kamagate', 'Anne Adjo'] },
    { libelle: 'Assistant', siege: true, ico: 'clipboard-list', aide: 'Mes besoins', personnes: ['Aminata Sow', 'Kady Bakayoko'] },
    { libelle: 'Chef', siege: true, ico: 'user-cog', aide: 'Mes besoins', personnes: ['Axel Kouamenan', 'Kader Soro'] },
    { libelle: 'Responsable', siege: true, ico: 'shield-check', aide: 'Besoins et validation', personnes: ['Zeinab Kone', 'Yaya Comara', 'Massandje Dagnoko', 'Rita Kessie'] },
    { libelle: 'Manager', siege: true, ico: 'crown', aide: 'Validation des responsables', personnes: ['Issa Kone', 'Jansenus Koffi'] },
  ],

  // Responsables valideurs : chacun valide les besoins d'un poste en agence et de personnes du siège.
  // Les autres responsables ne valident pas. Les Managers valident les besoins des Responsables et des Managers.
  // À garder identique à VALIDEURS dans apps-script/Code.gs.
  VALIDEURS: {
    'Zeinab Kone': { postes: ['Caissière E-money'], personnes: ['Aminata Sow', 'Anne Adjo', 'Axel Kouamenan'] },
    'Yaya Comara': { postes: ['Caissière ordinaire'], personnes: ['Kader Soro', 'Isaac Kone', 'Kady Bakayoko', 'Yasmine Kamagate'] },
  },
  POSTES_MANAGER: ['Responsable', 'Manager'], // postes dont les besoins sont validés par les Managers
  // Personnes du siège qui exportent en Excel tous les besoins validés, sans les valider elles-mêmes.
  // À garder identique à EXPORTEURS dans apps-script/Code.gs.
  EXPORTEURS: ['Rita Kessie'],

  // Types de besoin pour lesquels on demande l'année d'acquisition et l'état de l'équipement actuel.
  TYPES_EQUIPEMENT_ACTUEL: ['Remplacement Équipement Défectueux', 'Renouvellement'],
  ETATS_EQUIPEMENT: ['Hors service', 'En panne (réparable)', 'Défectueux / fonctionne mal', 'Usé / vétuste', 'Fonctionnel'],

  OTP_MINUTES: 5,                // validité du code envoyé par e-mail

  // Tous les types de besoin (filtres, graphiques). Chaque catégorie précise ceux qu'elle propose.
  TYPES_BESOIN: ['Nouvelle Acquisition', 'Remplacement Équipement Défectueux', 'Renouvellement'],

  // Catégories de besoins, types proposés et articles (« Autre (préciser) » est toujours ajouté).
  // À garder identique à CATEGORIES dans apps-script/Code.gs (codes uniquement).
  CATEGORIES: [
    {
      code: 'INFORMATIQUE', libelle: 'Informatique', ico: 'monitor', couleur: '#1d4ed8',
      aide: 'Ordinateurs, impression, réseau, stockage…',
      types: ['Nouvelle Acquisition', 'Remplacement Équipement Défectueux'],
      articles: [
        'Batterie Ordinateur Portable', 'Chargeur de Batterie Ordinateur Portable', 'Clavier',
        'Disque de stockage', 'Écran Ordinateur de Bureau', 'Imprimante', 'Multiprise', 'Onduleur',
        'Ordinateur Portable', 'Pocket Wifi', 'Scanner', 'Serveur', 'Souris',
        'Support Ordinateur Portable', 'Unité Centrale Ordinateur de Bureau',
      ],
    },
    {
      code: 'MOBILIER', libelle: 'Mobilier', ico: 'armchair', couleur: '#9333ea',
      aide: 'Sièges, bureaux, caissons, caissettes…',
      types: ['Nouvelle Acquisition', 'Remplacement Équipement Défectueux', 'Renouvellement'],
      articles: ['Bureau', 'Caisson', 'Caissette', 'Siège'],
    },
    {
      code: 'ACHATS', libelle: 'Achats', ico: 'shopping-cart', couleur: '#0891b2',
      aide: 'Sécurité, téléphonie, tenues, accessoires…',
      types: ['Nouvelle Acquisition', 'Remplacement Équipement Défectueux', 'Renouvellement'],
      articles: [
        'Chasubles', 'Coffre-fort', 'Détecteur de faux billets', 'Fourreau tablette',
        'Fourreau téléphone', 'Protection écran tablette', 'Protection écran téléphone', 'Tablette',
        'Téléphone Android',
      ],
    },
  ],

  // Motifs proposés en un clic (le site peut toujours écrire son propre motif).
  MOTIFS_RAPIDES: [
    'Équipement défectueux',
    'Renouvellement (vétusté)',
    'Nouveau poste / nouvel agent',
    "Extension de l'activité",
    'Équipement manquant sur le site',
  ],

  SEUIL_ATTENTE_JOURS: 7,        // lignes « En attente » depuis plus longtemps = point d'attention
  ACTUALISATION_SECONDES: 60,    // rafraîchissement automatique (mode Google Sheets)
};
