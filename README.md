# RÉSONANCE

Un visual novel dont l'histoire s'écrit pendant que vous jouez. Vous décrivez librement ce que fait votre personnage ; un Maître du Jeu piloté par une IA fait vivre le monde autour de lui. Deux parties ne se ressemblent jamais.

> **État du projet (version 0.1)** — Le jeu se lance et se joue de bout en bout en **mode démonstration** (histoire enregistrée, sans clé ni coût). Les branchements vers Claude, Ollama et les générateurs d'images sont écrits mais **n'ont pas encore été essayés avec un vrai service** : attendez-vous à des ajustements au premier essai. Détail dans [ROADMAP.md](ROADMAP.md).

## 1. Installer et lancer

Il vous faut **Node.js version 22 ou plus récente** ([nodejs.org](https://nodejs.org), bouton « LTS »). Sur un ordinateur professionnel, demandez d'abord l'accord de votre service informatique avant d'installer un logiciel.

1. Ouvrez un terminal dans le dossier du jeu (dans l'Explorateur Windows : clic droit dans le dossier › « Ouvrir dans le terminal »).
2. Tapez `npm install` et attendez la fin (quelques minutes la première fois).
3. Tapez `npm run jouer`.

Le jeu s'ouvre. Cliquez sur **Nouvelle histoire**, puis **Créer le monde** : vous jouez tout de suite l'histoire de démonstration, « La Troisième Voix ».

Si la fenêtre ne s'ouvre pas après l'installation, tapez `node node_modules/electron/install.js`, puis de nouveau `npm run jouer`.

**Conseil :** si le dossier du jeu se trouve dans OneDrive, déplacez-le ailleurs (par exemple `C:\Jeux\Resonance`). OneDrive synchronise des milliers de petits fichiers techniques, ce qui ralentit tout et peut bloquer l'installation.

## 2. Comment on joue

- **Cliquez** ou appuyez sur **Espace** pour avancer dans le texte.
- Quand la scène s'arrête, **écrivez ce que fait votre personnage** puis Entrée. Vous pouvez aussi cliquer sur une des trois pistes proposées (touches 1, 2, 3).
- Parfois le jeu demande un **jet de dé**. Lancez le dé virtuel, ou lancez un vrai dé et tapez votre résultat.
- **Menu** (touche Échap) : fiche, Résonance, factions, journal, tableau d'enquête, codex, emploi du temps, carte des relations, sauvegardes, galerie, succès, coûts, réglages.
- Chaque scène est sauvegardée toute seule. Dans **Sauvegardes**, vous pouvez revenir à n'importe quelle scène et essayer une autre voie.

Raccourcis : Espace ou Entrée (avancer) · Ctrl (tout afficher) · A (mode automatique) · H (historique) · F5 (sauvegarde rapide) · F11 (plein écran).

Vous décrivez ce que votre personnage **tente**. Écrire « je trouve mille pièces d'or » ne vous enrichit pas : le monde et les dés décident.

## 3. Brancher une IA pour une histoire unique

Tout se règle dans **Réglages › IA de texte**. Trois possibilités.

### A. Claude (recommandé pour la qualité d'écriture, payant à l'usage)
1. Créez un compte sur [platform.claude.com](https://platform.claude.com) et ajoutez un peu de crédit.
2. Dans la console, créez une **clé API** et copiez-la.
3. Dans le jeu : « Qui raconte l'histoire ? » › **Claude (Anthropic)**, collez la clé, **Enregistrer**, puis **Tester la connexion**.
4. Choisissez un préréglage : **Qualité**, **Équilibré** ou **Économique**.

Votre clé est chiffrée par Windows et ne quitte jamais votre ordinateur, sauf pour appeler Anthropic. Le jeu affiche ce que vous dépensez (Menu › Coûts) et s'arrête de lui-même au plafond que vous fixez (2 $ par session et 20 $ par partie par défaut). Ces montants sont des estimations.

### B. Ollama (gratuit, sans Internet)
1. Installez Ollama depuis [ollama.com](https://ollama.com) (accord du service informatique nécessaire sur un poste professionnel).
2. Installez un modèle : dans un terminal, `ollama pull <nom-du-modèle>`. Le site d'Ollama liste les modèles ; prenez-en un qui tient dans la mémoire de votre carte graphique.
3. Dans le jeu : **Ollama (local)** › **Tester la connexion** › choisissez le modèle dans la liste.

L'écriture d'un modèle local est moins fine que celle de Claude. Le jeu lui envoie des consignes plus courtes pour compenser.

### C. Un autre service
**Service compatible OpenAI** : indiquez son adresse (elle se termine souvent par `/v1`), sa clé si besoin, et le nom du modèle.

## 4. Les images

Par défaut, décors et personnages sont **dessinés par le jeu** : gratuit, instantané, hors ligne. Rien à faire.

Pour des images générées par IA (Réglages › Images) :

| Option | Ce qu'il faut | Coût |
|---|---|---|
| ComfyUI | Carte graphique avec 8 Go de mémoire ou plus, ComfyUI lancé, un modèle installé | Gratuit |
| Automatic1111 / Forge | Même matériel, lancé avec l'option `--api` | Gratuit |
| API d'images en ligne | Un compte et une clé chez le fournisseur | Quelques centimes par image |

Tant qu'une image n'est pas prête, ou si sa génération échoue, le jeu garde l'image dessinée : vous n'attendez jamais. Dans **Galerie**, vous pouvez remplacer n'importe quelle image par la vôtre.

## 5. Où sont mes sauvegardes ?

Réglages › Avancé › **Ouvrir le dossier des sauvegardes**. Tout est sur votre ordinateur. Pour transmettre une partie ou la mettre à l'abri : écran titre › **Exporter** (un seul fichier `.resonance`), puis **Importer une partie** sur l'autre ordinateur.

« Supprimer » sur l'écran titre efface la partie et ses images. « Recommencer cette histoire » (Menu › Sauvegardes) repart du début en gardant le monde et les images.

## 6. Règles de contenu

Tous les personnages sont adultes. Séduction et tendresse sont possibles ; aucune scène explicite, aucune nudité. Ces règles sont imposées aux IA de texte et d'image et ne se désactivent pas.

## 7. Pour aller plus loin

- **Ajouter un univers** : copiez un fichier de `packs/univers/`, changez son `id` et son contenu. Il apparaît au prochain lancement.
- **Changer les règles** (plafonds, rythme du mystère…) : `packs/regles/defaut.json`.
- **Créer un installateur Windows** : `npm run dist` (résultat dans `dist/`). Non essayé à ce jour.
- **Vérifier que tout marche** : `npm test` (98 tests, sans clé ni coût) et `npm run smoke` (lance le vrai jeu et enregistre des captures d'écran dans `smoke/`).
