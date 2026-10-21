# Expression des Besoins — Budget 2027 (QFS E-Money)

Application web de **saisie et de validation des besoins** des sites QFS E-Money pour le budget 2027, en trois catégories :

- **Informatique** : ordinateurs, impression, réseau, téléphonie…
- **Mobilier** : fauteuils, bureaux, rangements, électroménager…
- **Achats** : sécurité, tenues, signalétique, accessoires…

Chaque site exprime ses besoins et suit leur validation. Le **Back Office** valide ou rejette chaque ligne (avec la quantité retenue), et dispose de la synthèse par site et de la **liste d'achat consolidée** par article.

Il s'agit d'un site statique (HTML/CSS/JS, Chart.js, SheetJS, icônes Lucide) publiable gratuitement sur **GitHub Pages**, avec la même charte que *Suivi des Incidents de Paiement* et iris (police Public Sans, thème Flowbite, logo QFS). Les données sont stockées dans une **feuille Google Sheets** via le script **Google Apps Script** fourni.

---

## Fonctionnalités

### Connexion : « Qui êtes-vous ? »
À l'ouverture, l'utilisateur choisit son **site**, ou le **Back Office**. Les 32 sites sont ceux des fichiers de besoins d'origine : SIEGE, les CGI, les fourrières et les barrages. Un code d'accès peut être exigé pour chaque profil (facultatif). Le profil reste connecté sur l'appareil jusqu'à « Se déconnecter ».

### Site
- **Exprimer un besoin** avec un assistant en 4 étapes :
  1. **Catégorie** : Informatique, Mobilier ou Achats.
  2. **Article** : type de besoin (Nouvelle acquisition, Remplacement d'un équipement défectueux, Renouvellement), article choisi dans la liste ou « Autre (préciser) », quantité, caractéristiques.
  3. **Justification** : service bénéficiaire, personne bénéficiaire, **motif** (avec des motifs proposés en un clic), commentaires.
  4. **Panier et envoi** : on peut ajouter autant de lignes que nécessaire, puis tout envoyer en une fois. Chaque envoi reçoit une référence (`B27-0001`).
- Le panier non envoyé est conservé sur l'appareil : rien n'est perdu si la page est fermée.
- **Mes besoins** : registre avec le statut et la quantité validée. Un besoin encore en attente peut être retiré.
- **Points d'attention** : besoins rejetés (avec le motif du Back Office), lignes en attente, dernières décisions.

### Back Office
- **Registre de tous les besoins** : filtres par période, site, catégorie et type, recherche libre, tri.
- **Décision par ligne** : Valider (quantité validée modifiable), Rejeter (commentaire obligatoire) ou Remettre en attente.
- **Décision groupée** : cocher plusieurs lignes, puis les valider ou les rejeter en une fois.
- **Synthèse par site** : quantités par catégorie, lignes en attente, validées et rejetées, taux de traitement, date de la dernière saisie. Les sites **sans aucune saisie** sont signalés.
- **Articles consolidés** : quantités demandées, validées et en attente par article, ainsi que le nombre de sites concernés. C'est la liste d'achat.
- **Points d'attention** : sites à relancer, lignes en attente depuis plus de 7 jours, dernières décisions.

### Pour tous
- Export **Excel** des données filtrées (onglets Besoins, Articles consolidés et, pour le Back Office, Synthèse par site) et impression / **PDF**.
- Utilisable sur ordinateur et sur téléphone.

### Statuts

| Statut | Signification |
|---|---|
| **En attente** | Envoyé par le site, pas encore examiné |
| **Validé** | Retenu par le Back Office (avec la quantité validée) |
| **Rejeté** | Non retenu, avec un commentaire obligatoire |

---

## Essayer tout de suite (mode démonstration)

Tant que `API_URL` est vide dans `assets/js/config.js`, l'application fonctionne en **mode démonstration** : tout marche, mais les données restent dans le navigateur. Ouvrez `index.html` ou servez le dossier (`npx serve .`) pour tester les parcours site et Back Office.

---

## Mise en service

### 1. Publier le site (GitHub Pages)

Créez un dépôt (par ex. `besoins-budget-qfs`) et poussez-y ce dossier. Ensuite : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
Le site est alors disponible à `https://<compte>.github.io/besoins-budget-qfs/`.

### 2. Créer la base partagée (Google Sheets + Apps Script), environ 5 minutes

1. Avec le compte Google de l'entreprise, créez une feuille **Google Sheets** vide (par ex. « Besoins Budget 2027 »).
2. Menu **Extensions → Apps Script**. Remplacez le contenu de `Code.gs` par celui de [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistrez.
3. Dans la liste des fonctions, choisissez **`setup`**, cliquez sur **Exécuter** et acceptez les autorisations.
   Les onglets `Besoins`, `Acces` et `Synthese` sont créés.
4. **Déployer → Nouveau déploiement**, type **Application Web** :
   - *Exécuter en tant que* : **Moi**
   - *Qui a accès* : **Tout le monde**

   Copiez l'**URL de l'application Web** (elle se termine par `/exec`).
5. Collez-la dans [`assets/js/config.js`](assets/js/config.js) :
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
   Publiez ensuite la modification (commit + push). Le bandeau « Mode démonstration » disparaît.

> Après toute modification de `Code.gs` : **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer**. L'URL ne change pas.

### 3. Codes d'accès (recommandé)

Dans l'onglet **`Acces`** de la feuille, la colonne `code` contient un code par profil :

- code **vide** : accès direct en cliquant sur le profil ;
- code **renseigné** : l'application le demande à la connexion.

Mettez **au moins un code au Back Office**. La vérification se fait côté serveur : un site ne reçoit jamais les besoins des autres sites.

---

## Personnalisation

Tout se règle dans [`assets/js/config.js`](assets/js/config.js) :

| Réglage | Rôle |
|---|---|
| `SITES` | Sites affichés à la connexion. Pour un nouveau site, ajoutez-le aussi dans l'onglet `Acces`. |
| `CATEGORIES` | Catégories (libellé, icône, couleur) et **articles proposés**. Les codes doivent rester identiques à `CATEGORIES` dans `Code.gs`. |
| `TYPES_BESOIN` | Types de besoin proposés. |
| `MOTIFS_RAPIDES` | Motifs ajoutés en un clic. |
| `DATE_LIMITE` | Date limite de saisie (`AAAA-MM-JJ`), affichée aux sites avec un compte à rebours. |
| `SEUIL_ATTENTE_JOURS` | Délai au-delà duquel une ligne en attente est signalée. |
| `ACTUALISATION_SECONDES` | Rafraîchissement automatique des données (mode en ligne). |

## Structure

```
index.html               Page unique (connexion + tableau de bord + assistant de saisie)
assets/css/style.css     Charte iris (identique au suivi des incidents)
assets/css/besoins.css   Compléments propres aux besoins
assets/img/logo-qfs.png  Logo QFS
assets/js/config.js      Configuration (URL de l'API, sites, catégories, articles…)
assets/js/store.js       Accès aux données (API Apps Script ou mode démonstration)
assets/js/app.js         Interface : connexion, statistiques, registre, saisie, validation
apps-script/Code.gs      Backend Google Apps Script (à coller dans la feuille Google Sheets)
```

## À savoir

- Le site GitHub Pages est public : protégez l'accès avec les **codes d'accès** et ne partagez la feuille Google Sheets qu'avec le Back Office.
- L'onglet `Synthese` de la feuille donne les totaux par article et par site directement dans Google Sheets.
- La feuille reste consultable et exportable par le Back Office. Évitez de modifier à la main les colonnes `id` et `statut` de l'onglet `Besoins`.
