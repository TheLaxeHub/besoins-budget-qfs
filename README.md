# Expression des Besoins — Budget 2027 (QFS E-Money)

Application web de **saisie et de validation des besoins** des sites QFS E-Money pour le budget 2027, en trois catégories :

- **Informatique** : ordinateurs, impression, réseau, téléphonie…
- **Mobilier** : fauteuils, bureaux, rangements, électroménager…
- **Achats** : sécurité, tenues, signalétique, accessoires…

Chaque agent exprime ses besoins et suit leur validation. Les **Responsables** et les **Managers** valident les besoins selon le poste du demandeur et exportent en Excel les besoins validés.

Il s'agit d'un site statique (HTML/CSS/JS, Chart.js, SheetJS, icônes Lucide) publiable gratuitement sur **GitHub Pages**, avec la même charte que *Suivi des Incidents de Paiement* et iris (police Public Sans, thème Flowbite, logo QFS). Les données sont stockées dans une **feuille Google Sheets** via le script **Google Apps Script** fourni.

---

## Fonctionnalités

### Connexion : poste → site → accès
1. **Poste** : Caissière ordinaire, Caissière E-money (en agence) ou Opérateur, Assistant, Chef, Responsable, Manager (au siège).
2. **Site** : les caissières choisissent leur site parmi les 32. Les postes du siège sont rattachés au **SIEGE**.
3. **Accès** :
   - **Caissières** : elles saisissent leur nom et prénom, l'accès est direct.
   - **Postes du siège** : la personne choisit son nom. Un **code à 4 chiffres** est envoyé à son adresse e-mail. Il est valable **5 minutes**, et 5 essais sont autorisés. Une fois le délai passé, le code expire et il faut en générer un nouveau. Sans le bon code, l'accès est refusé.

La session reste ouverte sur l'appareil jusqu'à « Se déconnecter » (6 h maximum d'inactivité côté serveur).

### Qui valide quoi

| Demandeur | Validé par |
|---|---|
| Caissière ordinaire, Caissière E-money | Responsables |
| Chef, Assistant, Opérateur | Responsables |
| Responsable | Managers |
| Manager | Managers (y compris ses propres besoins) |

Un responsable ne valide jamais ses propres besoins : c'est un manager qui s'en charge. Le réglage se trouve dans `VALIDATION` (`config.js` et `Code.gs`).

### Saisie (tous les postes)
- **Exprimer un besoin** avec un assistant en 4 étapes :
  1. **Catégorie** : Informatique, Mobilier ou Achats.
  2. **Article** : type de besoin, article (ou « Autre (préciser) »), quantité, caractéristiques.
  3. **Justification** : service bénéficiaire, personne bénéficiaire, **motif**, commentaires.
  4. **Panier et envoi** : on ajoute autant de lignes que nécessaire, puis on envoie tout en une fois. Le nom, le poste et le site viennent de la connexion. Chaque envoi reçoit une référence (`B27-0001`).
- **Suivi** : les caissières voient les besoins des caissières de leur site, les autres postes voient leurs propres besoins. Un besoin encore en attente peut être retiré par son auteur.

### Validation (Responsables et Managers)
- **Affichage** : besoins que je valide, besoins validés par moi, mes propres besoins, ou tous les besoins visibles.
- **Décision** : Valider (quantité validée modifiable), Rejeter (commentaire obligatoire) ou Remettre en attente. La décision est enregistrée au nom de la personne connectée.
- **Décision groupée** : cocher plusieurs lignes, puis les valider ou les rejeter en une fois.
- **Synthèse par site** et **articles consolidés**.
- **Export Excel** :
  - **Responsable** : les besoins qu'**il a validés**.
  - **Manager** : les besoins validés par **les responsables et les managers** (dont lui-même).
  - Le fichier contient trois onglets : Besoins validés, Articles consolidés, Synthèse par site.

### Pour tous
- Impression / **PDF** du tableau de bord.
- Utilisable sur ordinateur et sur téléphone.

### Statuts

| Statut | Signification |
|---|---|
| **En attente** | Envoyé par le site, pas encore examiné |
| **Validé** | Retenu par le valideur (avec la quantité validée) |
| **Rejeté** | Non retenu, avec un commentaire obligatoire |

---

## Essayer tout de suite (mode démonstration)

Tant que `API_URL` est vide dans `assets/js/config.js`, l'application fonctionne en **mode démonstration** : tout marche, mais les données restent dans le navigateur. Ouvrez `index.html` ou servez le dossier (`npx serve .`) pour tester tous les postes. En démo, le code de connexion s'affiche à l'écran au lieu d'être envoyé par e-mail.

---

## Mise en service

### 1. Publier le site (GitHub Pages)

Créez un dépôt (par ex. `besoins-budget-qfs`) et poussez-y ce dossier. Ensuite : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
Le site est alors disponible à `https://<compte>.github.io/besoins-budget-qfs/`.

### 2. Créer la base partagée (Google Sheets + Apps Script), environ 5 minutes

1. Avec le compte Google de l'entreprise, créez une feuille **Google Sheets** vide (par ex. « Besoins Budget 2027 »).
2. Menu **Extensions → Apps Script**. Remplacez le contenu de `Code.gs` par celui de [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistrez.
3. Dans la liste des fonctions, choisissez **`setup`**, cliquez sur **Exécuter** et acceptez les autorisations.
   Les onglets `Besoins`, `Personnes` et `Synthese` sont créés.
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

### 3. Personnes et envoi des codes

L'onglet **`Personnes`** de la feuille contient les agents du siège : `nom`, `poste`, `email`. Il est pré-rempli par `setup`. Pour ajouter, retirer ou corriger une personne, modifiez directement cet onglet : la liste de connexion est mise à jour sans redéploiement.

- Les codes partent du compte Google qui a déployé le script. Le quota est d'environ 100 e-mails par jour pour un compte Gmail, et 1 500 pour Google Workspace.
- Si les messages n'arrivent pas, vérifiez les courriers indésirables et demandez à l'informatique d'autoriser l'expéditeur pour le domaine `cgi.ci`.
- La première exécution de `setup` demande l'autorisation « Envoyer des e-mails en votre nom » : acceptez-la.

## Personnalisation

Tout se règle dans [`assets/js/config.js`](assets/js/config.js) :

| Réglage | Rôle |
|---|---|
| `SITES` | Sites proposés aux caissières (à garder identique à `SITES` dans `Code.gs`). |
| `CATEGORIES` | Catégories (libellé, icône, couleur) et **articles proposés**. Les codes doivent rester identiques à `CATEGORIES` dans `Code.gs`. |
| `CATEGORIES[].types` | Types de besoin proposés pour chaque catégorie (`TYPES_BESOIN` = liste complète pour les filtres). |
| `POSTES` | Postes proposés à la connexion (en agence / au siège). |
| `VALIDATION` | Qui valide les besoins de quel poste (à garder identique dans `Code.gs`). |
| `OTP_MINUTES` | Durée de validité du code envoyé par e-mail (affichage ; la valeur serveur est dans `Code.gs`). |
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

- Le site GitHub Pages est public. L'accès des postes du siège est protégé par le code envoyé par e-mail. Les caissières se connectent sans code, avec leur site et leur nom. Ne partagez la feuille Google Sheets qu'avec les administrateurs.
- L'onglet `Synthese` de la feuille donne les totaux par article et par site directement dans Google Sheets.
- La feuille reste consultable et exportable par ses administrateurs. Évitez de modifier à la main les colonnes `id` et `statut` de l'onglet `Besoins`.
