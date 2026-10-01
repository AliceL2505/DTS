# PI Planning : capacité UX / UI

Outil web pour préparer et suivre un PI Planning côté design : il calcule la capacité à faire de l'équipe UX et UI, répartit automatiquement les sujets sur les sprints et alerte quand la charge dépasse la capacité.

L'outil fonctionne entièrement dans le navigateur : pas de serveur, pas de base de données, pas d'installation de dépendances.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure de la page (en-tête, onglets, zones d'affichage) |
| `style.css` | Mise en forme, thème clair et sombre |
| `app.js` | Toute la logique : calcul de capacité, dispatch, rendu des onglets, sauvegarde |
| `README.md` | Ce document |

Les quatre fichiers doivent rester dans le même dossier.

## Installation

### Option 1 : en local, sans GitHub

1. Placer les quatre fichiers dans un même dossier.
2. Double-cliquer sur `index.html` : l'outil s'ouvre dans le navigateur.

### Option 2 : via GitHub (dépôt et GitHub Pages)

1. Sur [github.com](https://github.com), créer un nouveau dépôt (bouton **New**), par exemple `pi-planning`. Il peut être privé.
2. Dans le dépôt, cliquer sur **Add file**, puis **Upload files**, et déposer les quatre fichiers à la racine. Valider avec **Commit changes**.
3. Pour l'ouvrir sur le PC :
   - soit cloner le dépôt avec GitHub Desktop (**Code**, puis **Open with GitHub Desktop**) et ouvrir `index.html` depuis le dossier cloné ;
   - soit télécharger le dépôt (**Code**, puis **Download ZIP**), le décompresser et ouvrir `index.html`.
4. Facultatif, pour y accéder par une adresse web : dans **Settings**, puis **Pages**, choisir **Deploy from a branch**, la branche `main` et le dossier `/ (root)`, puis **Save**. Après une ou deux minutes, l'outil est disponible à l'adresse `https://<identifiant>.github.io/pi-planning/`.

   GitHub Pages publie le site publiquement, même si le dépôt est privé (sauf offres GitHub Entreprise). Les données saisies restent malgré tout dans le navigateur de chaque personne (voir plus bas).

## Données et sauvegarde

- Les données sont enregistrées automatiquement dans le **stockage local du navigateur** (localStorage), sur le PC utilisé.
- Elles ne sont **pas partagées** : chaque navigateur, chaque PC et chaque adresse (fichier local ou GitHub Pages) a ses propres données.
- Vider le cache ou les données de navigation du navigateur **efface les PI saisis**. Une navigation privée ne conserve rien.
- Plusieurs PI peuvent être enregistrés et parcourus avec « Précédent », « Suivant » et la liste déroulante en haut de la page.

### Exporter et importer

- **Exporter** (en haut de la page, ou dans l'onglet Sprints, section Sauvegarde) télécharge le PI affiché dans un fichier `.json`. « Exporter tous les PI » enregistre tous les PI dans un seul fichier.
- **Importer** ajoute les PI d'un fichier `.json` à ceux déjà présents. Si un PI du fichier existe déjà, l'outil propose de le remplacer ou de l'importer comme un nouveau PI.
- Exportez régulièrement : c'est la seule sauvegarde en dehors du navigateur, et le moyen de transmettre un PI à quelqu'un.

Pour reprendre un PI saisi dans la version publiée sur claude.ai : l'ouvrir dans cette version, cliquer sur « Exporter », puis cliquer sur « Importer » dans l'outil installé et choisir le fichier téléchargé.

## Fonctionnalités

### Sprints
- Génération des sprints à partir d'une date de début, d'une durée et d'un nombre de sprints.
- Sprint **PIP** (PI Planning) en premier et sprint **IP** (innovation) en dernier, chacun avec sa durée, exclus du dispatch.
- Sprints toujours rangés par date, renumérotation automatique.
- Jours fériés, avec ajout automatique des jours fériés français.
- Réunions : règle par défaut (2 j par ETP pour un sprint de 3 semaines, au prorata de la durée), modifiable sprint par sprint.

### Équipe, congés et évènements
- Équipe UX et UI avec ETP.
- Congés en journées ou demi-journées, avec calendrier de plage. Ils sont retirés de la capacité au prorata de l'ETP.
- Évènements d'équipe (séminaire, formation…) pour toute l'équipe, un profil ou des personnes choisies.
- Équipe Produit (PO, PM…) et ses congés. Ils n'entrent pas dans la capacité, mais allongent les attentes et sont signalés sur le plan.

### Capacité à faire
Pour chaque personne et chaque sprint :

```
capacité à faire = jours ouvrés × ETP − congés × ETP − évènements × ETP − réunions × ETP
```

Un jour posé en congé n'est pas retiré une deuxième fois s'il y a aussi un évènement ce jour-là.

### Sujets
- Charge UX et UI en jours, priorité P1 à P4, statut (à faire, en cours, terminé, hors PI).
- Contact produit par sujet.
- Répartition : **UI après UX** (par défaut), **simultanés**, ou **tâche de fond** lissée sur le PI pour combler les trous.
- Sous-tâches réordonnables, avec dépendances entre elles (sans boucle possible).
- **Attentes** sans charge (retour PO, recrutement d'utilisateurs…), avec une durée en jours ouvrés qui décale les sous-tâches dépendantes.
- Import par copier-coller depuis un tableur : `nom ; charge UX ; charge UI ; priorité ; répartition`.

### Dispatch automatique
1. Les placements faits à la main passent en premier.
2. Les sujets sont placés selon l'ordre choisi : la priorité prime (puis l'ordre de la liste), ou l'ordre de la liste prime.
3. Chaque sujet ou sous-tâche va dans le premier sprint qui a de la capacité, et se découpe sur plusieurs sprints si besoin, en respectant les dépendances et l'enchaînement UX puis UI.
4. Les tâches de fond sont placées en dernier, au prorata de la capacité restée libre.

### Affichage et alertes
- **Plan** : colonnes par sprint avec jauges UX et UI (capacité à faire, capacité utilisée, reste), détail du calcul, glisser-déposer des sujets, colonnes « Non planifiés » et « Hors PI ».
- **Planning** : frise chronologique avec congés, évènements, sujets, sous-tâches et attentes.
- Alertes : dépassement de capacité, sujets non planifiés, dépendances non respectées, charge du PI supérieure à la capacité.
- Remarques : sprints chargés à plus de 90 %, impacts des congés de l'équipe Produit.

## Remarques techniques

- Aucune dépendance à installer. Seule la police (Schibsted Grotesk) est chargée depuis Google Fonts. Sans connexion internet, une police système la remplace.
- Le code contient une sauvegarde partagée propre à l'environnement Claude, où l'outil a été conçu. Hors de cet environnement, elle est ignorée et l'outil utilise automatiquement le stockage local du navigateur.
- Navigateurs testés : Chrome, Edge et Firefox récents.
