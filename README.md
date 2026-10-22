# Expression des Besoins — Budget 2027 (QFS E-Money)

Application web de **saisie et de validation des besoins** des sites QFS E-Money pour le budget 2027, en trois catégories :

- **Informatique** : ordinateurs, impression, réseau, téléphonie…
- **Mobilier** : fauteuils, bureaux, rangements, électroménager…
- **Achats** : sécurité, tenues, signalétique, accessoires…

Chaque agent exprime ses besoins et suit leur validation. Les **Responsables** et les **Managers** valident les besoins selon le poste du demandeur et exportent en Excel les besoins validés.

Il s'agit d'un site statique (HTML/CSS/JS, Chart.js, SheetJS, icônes Lucide) publiable gratuitement sur **GitHub Pages**, avec la même charte que *Suivi des Incidents de Paiement* et iris (police Public Sans, thème Flowbite, logo QFS). Les données sont stockées dans une **feuille Google Sheets** via le script **Google Apps Script** fourni.

---

## Fonctionnalités

### Connexion
Le parcours compte toujours 3 étapes, indiquées en haut de la carte de connexion :

- **En agence** (Caissière ordinaire, Caissière E-money) : **Poste → Site → Identité**, accès direct.
  1. La caissière choisit son site parmi les 41 (ABATTA, ABOBO, ANGRE, BOUAKE, PONT FHB… COSMOS), avec une recherche.
  2. Si des caissières sont déjà enregistrées pour ce site et ce poste, elle touche son nom. Sinon, ou via « Je ne suis pas dans la liste », elle saisit son nom, qui sera proposé aux connexions suivantes (onglet `Agents`).
- **Au siège** (Opérateur, Assistant, Chef, Responsable, Manager) : **Poste → Identité → Code**. Le site est toujours le **SIEGE**, il n'y a donc pas d'étape « site ».
  1. La personne choisit son nom.
  2. Un **code à 4 chiffres** est envoyé à son adresse e-mail. Il est valable **5 minutes**, et 5 essais sont autorisés. Une fois le délai passé, le code expire et il faut en demander un nouveau. Sans le bon code, l'accès est refusé.

La session reste ouverte sur l'appareil jusqu'à « Se déconnecter » (6 h maximum d'inactivité côté serveur).

### Qui valide quoi

| Valideur | Valide les besoins de |
|---|---|
| **Zeinab Kone** (Responsable) | Caissières E-money, Aminata Sow, Anne Adjo, Axel Kouamenan |
| **Yaya Comara** (Responsable) | Caissières ordinaires, Kader Soro, Isaac Kone, Kady Bakayoko, Yasmine Kamagate |
| **Managers** (Issa Kone, Jansenus Koffi) | Tous les Responsables (dont Massandje Dagnoko et Rita Kessie) et les Managers eux-mêmes |

Massandje Dagnoko et Rita Kessie sont Responsables mais ne valident pas : elles expriment leurs besoins, qui sont validés par les Managers. Un responsable ne valide jamais ses propres besoins. Le réglage se trouve dans `VALIDEURS` (`config.js` et `Code.gs`) : une personne ajoutée dans l'onglet `Personnes` doit aussi y être rattachée à un valideur.

### Écrans

Chacun arrive directement sur ce qu'il vient faire :

| Écran | Pour qui | Contenu |
|---|---|---|
| **Exprimer un besoin** | Tous (écran d'accueil des agents) | Catalogue d'articles par catégorie (Informatique, Mobilier, Achats) avec recherche, et un repère « Choisir → Préciser → Envoyer ». Un clic sur un article ouvre sa **fiche** (panneau bas sur téléphone) : quantité, type de besoin, équipement actuel si besoin, motif (avec motifs proposés en un clic), caractéristiques facultatives. L'article n'entre dans **Ma demande** qu'une fois la fiche complète ; ce qui manque est indiqué au pied de la fiche. Un article déjà ajouté se rouvre pour être modifié ou retiré. « Tout retirer », le retrait d'un article déjà renseigné et l'envoi passent par une fenêtre de confirmation, et l'envoi se termine par une fenêtre récapitulative avec la référence. La demande en cours est conservée sur l'appareil. |
| **Mes besoins** / **Besoins du site** | Tous | Une synthèse (part des articles examinés, compteurs *Tous / En attente / Validés / Rejetés* qui servent aussi de filtres), puis une carte par demande : date d'envoi, référence, état global (*En attente*, *En cours*, *Validée*, *Rejetée*, *Traitée*) et, pour chaque article, quantité demandée et validée, statut, valideur et motif en cas de rejet. Un besoin encore en attente peut être retiré. |
| **À valider** | Zeinab Kone, Yaya Comara, Managers (écran d'accueil) | Un résumé (besoins en attente, demandeurs, besoins en attente depuis plus de `SEUIL_ATTENTE_JOURS`), puis les demandes regroupées par demandeur. Pour chaque ligne : motif, équipement actuel, quantité validée modifiable, boutons **Valider** et **Rejeter** (le motif du rejet est obligatoire). **Tout valider** traite une demande en un clic. L'onglet *Déjà traités* permet de revenir sur une décision. |
| **Tableau de bord** | Valideurs | Un sous-menu fixe mène à chaque section : vue d'ensemble (indicateurs, avancement), graphiques, registre complet avec décision groupée, synthèse par site, articles consolidés (avec la répartition validé / en attente / non retenu et une ligne de total). |

**Référence d'une demande** : à chaque envoi, le serveur attribue une référence `B27-0001`, `B27-0002`… (**B** = Besoins, **27** = Budget 2027, puis le numéro d'ordre). Chaque article de la demande reçoit un suffixe : `B27-0001-01`, `B27-0001-02`…

**Liens directs** : chaque écran a sa propre adresse, utilisable dans un e-mail ou un favori : `#nouveau`, `#mes`, `#valider`, `#tdb`, et les sections du tableau de bord `#sec-kpi`, `#sec-graph`, `#sec-reg`, `#sec-synth`, `#sec-art`. Après la connexion, la personne arrive directement sur l'écran demandé (si son poste y a accès). Le bouton « Précédent » du navigateur revient à l'écran précédent.

Pour un *Remplacement d'équipement défectueux* ou un *Renouvellement*, l'**année d'acquisition** et l'**état de l'équipement actuel** sont obligatoires (états : Hors service, En panne (réparable), Défectueux / fonctionne mal, Usé / vétuste, Fonctionnel).

### Export Excel (valideurs)
- **Responsable** : les besoins qu'**il a validés**.
- **Manager** : les besoins validés par **les responsables et les managers** (dont lui-même).
- **Rita Kessie** (exportatrice, sans validation) : comme les managers, tous les besoins validés par Zeinab Kone, Yaya Comara et les managers — bouton « Exporter les besoins validés » dans *Mes besoins*. Réglage : `EXPORTEURS` (`config.js` et `Code.gs`).
- L'export est toujours complet (sans tenir compte des filtres de l'écran). Il contient trois onglets : Besoins validés, Articles consolidés, Synthèse par site.

### Pour tous
- Utilisable sur ordinateur et sur téléphone. Sur téléphone, une barre d'onglets en bas d'écran donne accès aux écrans principaux.

### Statuts

| Statut | Signification |
|---|---|
| **En attente** | Envoyé par le site, pas encore examiné |
| **Validé** | Retenu par le valideur (avec la quantité validée) |
| **Rejeté** | Non retenu, avec un commentaire obligatoire |

---

## Avant la mise en service

L'application ne contient aucune donnée : tout est enregistré dans la feuille Google Sheets. Tant que `API_URL` est vide dans `assets/js/config.js`, l'écran de connexion affiche « Application pas encore reliée à sa base de données » et personne ne peut se connecter.

## Mise en service

### 1. Publier le site (GitHub Pages)

Créez un dépôt (par ex. `besoins-budget-qfs`) et poussez-y ce dossier. Ensuite : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
Le site est alors disponible à `https://<compte>.github.io/besoins-budget-qfs/`.

### 2. Créer la base partagée (Google Sheets + Apps Script), environ 5 minutes

1. Avec le compte Google de l'entreprise, créez une feuille **Google Sheets** vide (par ex. « Besoins Budget 2027 »).
2. Menu **Extensions → Apps Script**. Remplacez le contenu de `Code.gs` par celui de [`apps-script/Code.gs`](apps-script/Code.gs), puis enregistrez.
3. Dans la liste des fonctions, choisissez **`setup`**, cliquez sur **Exécuter** et acceptez les autorisations.
   Les onglets `Besoins`, `Personnes`, `Agents` et `Synthese` sont créés.
4. **Déployer → Nouveau déploiement**, type **Application Web** :
   - *Exécuter en tant que* : **Moi**
   - *Qui a accès* : **Tout le monde**

   Copiez l'**URL de l'application Web** (elle se termine par `/exec`).
5. Collez-la dans [`assets/js/config.js`](assets/js/config.js) :
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
   Publiez ensuite la modification (commit + push). L'écran « Qui êtes-vous ? » apparaît alors à la connexion.

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
| `VALIDEURS`, `POSTES_MANAGER` | Qui valide les besoins de qui (à garder identique dans `Code.gs`). |
| `TYPES_EQUIPEMENT_ACTUEL`, `ETATS_EQUIPEMENT` | Types de besoin qui demandent l'équipement actuel, et états proposés. |
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
assets/js/store.js       Accès aux données (API Google Apps Script)
assets/js/app.js         Interface : connexion, statistiques, registre, saisie, validation
apps-script/Code.gs      Backend Google Apps Script (à coller dans la feuille Google Sheets)
```

## À savoir

- Le site GitHub Pages est public. L'accès des postes du siège est protégé par le code envoyé par e-mail. Les caissières se connectent sans code, avec leur site et leur nom. Ne partagez la feuille Google Sheets qu'avec les administrateurs.
- L'onglet `Synthese` de la feuille donne les totaux par article et par site directement dans Google Sheets.
- La feuille reste consultable et exportable par ses administrateurs. Évitez de modifier à la main les colonnes `id` et `statut` de l'onglet `Besoins`.
