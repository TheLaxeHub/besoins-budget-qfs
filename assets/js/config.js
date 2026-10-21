/*
 * Configuration de l'application — Expression des besoins Budget 2027 (QFS E-Money).
 * C'est le seul fichier à modifier pour adapter l'application.
 */
window.APP_CONFIG = {
  // URL de l'application Web Google Apps Script (voir README, « Mise en service »).
  // Vide = MODE DÉMONSTRATION : les données restent dans le navigateur (pour tester l'interface).
  API_URL: '',

  APP_TITRE: 'Expression des Besoins — Budget 2027',
  APP_SOUS_TITRE: 'QFS E-Money — Informatique, Mobilier & Achats',
  CAMPAGNE: 'Budget 2027',
  // Date limite de saisie affichée aux sites (format AAAA-MM-JJ, vide = pas de date limite).
  DATE_LIMITE: '',

  BACK_OFFICE: 'BACK OFFICE',

  // Sites de déploiement. Pour un nouveau site, ajoutez-le aussi dans l'onglet « Acces » de la feuille.
  SITES: [
    'SIEGE', 'CGI ABOBO', 'CGI ABOISSO', 'CGI AGBOVILLE', 'CGI ANGRE', 'CGI BONDOUKOU',
    'CGI BONGOUANOU', 'CGI BOUAKE', 'CGI BOUNA', 'CGI BOUNDIALI', 'CGI COSMOS', 'CGI DAOUKRO',
    'CGI DIMBOKRO', 'CGI DIVO', 'CGI FERKE', 'CGI GUIGLO', 'CGI KONG', 'CGI MANKONO',
    'CGI ODIENNE', 'CGI PHB', 'CGI SASSANDRA', 'CGI SEGUELA', 'CGI TOUBA', 'CGI VGE',
    'CGI YOPOUGON', 'FOURRIERE ABOBO', 'FOURRIERE BASSAM', 'BARRAGE GSR1', 'BARRAGE GSR2',
    'BARRAGE GSR3', 'BARRAGE PSSR1', 'BARRAGE PSSR2',
  ],

  TYPES_BESOIN: ['Nouvelle Acquisition', 'Remplacement Équipement Défectueux', 'Renouvellement'],

  // Catégories de besoins et articles proposés (« Autre (préciser) » est toujours ajouté).
  // À garder identique à CATEGORIES dans apps-script/Code.gs (codes uniquement).
  CATEGORIES: [
    {
      code: 'INFORMATIQUE', libelle: 'Informatique', ico: 'monitor', couleur: '#1d4ed8',
      aide: 'Ordinateurs, impression, réseau, téléphonie…',
      articles: [
        'Ordinateur Portable', 'Ordinateur de Bureau', 'Unité Centrale', 'Écran Ordinateur de Bureau',
        'Écran Télévision', 'Clavier', 'Souris', 'Batterie Ordinateur Portable',
        'Chargeur de Batterie Ordinateur Portable', 'Licence Microsoft Office', 'Imprimante',
        'Imprimante Multifonctions', 'Photocopieur', 'Scanner', 'Scanner à Feuilles', 'Scanner à Plat',
        "Tête d'Impression", 'Rouleau de Nettoyage', 'Tige de Rouleau de Nettoyage', 'Onduleur',
        'Multiprise', 'Rallonge USB', 'Splitter HDMI', 'Support Fixation Écran', 'Support',
        'Rouleau Câble Électrique', 'Rouleau Câble Réseau', 'Spirale de Protection Câble', 'Routeur',
        'Switch', 'Wibox Internet', 'Pocket Wifi', 'Puce Téléphonique', 'Serveur Rackable',
        'Serveur Non Rackable', 'Téléphone IP', 'Téléphone Portable', 'Téléphone Android', 'Tablette',
        'Protection Écran Téléphone', 'Protection Écran Tablette', 'Fourreau Téléphone',
        'Fourreau Tablette', 'Détecteur de Faux Billets', 'Souffleur', 'Tableau à Marqueur Effaçable',
        'Support et Maintenance',
      ],
    },
    {
      code: 'MOBILIER', libelle: 'Mobilier', ico: 'armchair', couleur: '#9333ea',
      aide: 'Fauteuils, bureaux, rangements, électroménager…',
      articles: [
        'Fauteuil analyste/agent', 'Fauteuil de direction', 'Fauteuil orthopédique',
        'Chaise visiteur PVC noir', 'Chaises Malaga', 'Chaises pliantes', 'Siège caissière',
        'Bureau analyste/agent', 'Bureau avec caisson fixe', 'Bureau avec retour', 'Box (bureau)',
        'Caisson', 'Armoire de rangement', 'Tiroirs agents avec clé', 'Caissette',
        'Réfrigérateur petit format', 'Micro-onde', 'Combiné téléphonique', "Bonbonne d'eau",
        'Paperboard',
      ],
    },
    {
      code: 'ACHATS', libelle: 'Achats', ico: 'shopping-cart', couleur: '#0891b2',
      aide: 'Sécurité, tenues, signalétique, accessoires…',
      articles: [
        'Détecteur de faux billets', 'Coffre-fort', 'Chasubles', 'Polos', 'Tee-shirts', 'Kakemono',
        'Affiches autocollantes A1', 'Affiches autocollantes grand format', 'Téléphone Android',
        'Tablette', 'Protection écran téléphone', 'Protection écran tablette', 'Fourreau téléphone',
        'Fourreau tablette',
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
