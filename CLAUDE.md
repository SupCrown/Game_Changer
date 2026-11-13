# RÉSONANCE — mémoire du projet

Visual novel adaptatif mené par une IA. Cahier des charges : `PROMPT_claude_code_visual_novel.md`. Choix techniques et flux d'un tour : `ARCHITECTURE.md`.

## État au 13/11/2026
Détail par étape dans `ROADMAP.md` (légende Fait / Écrit / À faire).

- **Vérifié** : 98 tests Vitest ; `tsc` propre ; `npm run smoke` lance le vrai jeu en mode démonstration (4 scènes, un jet, une nuit, tous les panneaux) sans erreur, captures relues.
- **Écrit mais jamais essayé contre un vrai service** : fournisseurs Claude, Ollama, compatible OpenAI ; ComfyUI, Automatic1111, API d'images ; détourage sur une vraie image ; installateur (`npm run dist`).
- **Jamais observé** : musique (jamais écoutée), voix, météo, interface de combat (la démo n'a pas de combat), épilogue à l'écran.

## Prochaines actions
1. Essayer Claude puis Ollama sur une vraie partie (il faut une clé ou un serveur) ; corriger ce qui casse ; vérifier le taux de cache dans Menu › Coûts.
2. Écouter la musique ; régler `NIVEAU_MUSIQUE` et les niveaux de `PARTITIONS` (`src/renderer/src/audio/`).
3. `npm run dist` ; corriger l'empaquetage si besoin (les `packs/` doivent partir en `extraResources`).
4. Sprite procédural : un personnage masculin sans le mot « homme » dans sa description est dessiné au féminin (`lireApparence` dans `procedural/sprite.ts`). Passer le genre depuis la fiche.
5. Alléger le paquet du renderer (937 Ko) : n'importer que les sous-ensembles latins des polices.
6. Extraire les messages français du cœur (erreurs, notifications) vers `t()` pour une vraie traduction.

## Commandes
- `npm test` — tests (sans clé, sans coût).
- `npm run typecheck` — vérification des types.
- `npm run dev` — développement ; `npm run jouer` — construire et lancer.
- `npm run smoke` — essai de bout en bout avec captures d'écran dans `smoke/` (dossier de données jetable, ne touche pas aux sauvegardes). Toujours relire quelques captures après un changement d'interface.

## Conventions
- Code, commentaires et identifiants en français. Interface : tout texte visible passe par `t('…')`.
- `src/core` est du TypeScript pur : ni Electron, ni DOM. Seul `storage/depot.ts` utilise Node (`node:sqlite`).
- Le renderer n'appelle jamais une IA et ne modifie jamais l'état : il envoie des intentions par `window.resonance`.
- L'IA propose, le moteur de règles dispose. Aucun chiffre de jeu n'est envoyé au Narrateur (libellés qualitatifs).
- Tout ce qui varie d'un tour à l'autre va dans le dernier message du Narrateur, jamais avant (cache des prompts). Test : « garde un préfixe identique d'un tour à l'autre » dans `tests/ia.test.ts`.

## Pièges connus
- **npm 11 bloque les scripts d'installation des dépendances** : le `postinstall` du projet télécharge le binaire Electron ; en cas d'échec, `node node_modules/electron/install.js`.
- **Dans le terminal de VS Code, `ELECTRON_RUN_AS_NODE=1` est défini** : Electron se lance alors comme un simple Node et plante sur `import { BrowserWindow }`. Lancer avec `env -u ELECTRON_RUN_AS_NODE …` (bash) ou depuis un terminal ordinaire.
- `webContents.capturePage()` sur une fenêtre inactive peut rendre l'image précédente : `smoke.ts` appelle `invalidate()` et capture deux fois.
- electron-vite : le preload est forcé en CommonJS (`index.cjs`) car le bac à sable est activé ; la CSP est posée par en-tête hors développement seulement (Vite a besoin de scripts en ligne en dev).
- **Le projet est dans un dossier OneDrive** : `node_modules` y est synchronisé (lent, risque de fichiers verrouillés). Idéalement, déplacer le dépôt hors de OneDrive.
- Claude Opus 5.5 / Sonnet 5.5 : `thinking` ne se désactive pas, pas de `temperature`, pas de `tool_choice` forcé ; les sorties structurées passent par `output_config.format`.
- Dans le faux fournisseur, l'index de scène vient de `meta.index` (nombre de scènes du chemin), pas de `stats.scenes`.
- Le détourage suppose des bitmaps Electron prémultipliés : à vérifier visuellement au premier essai.
- Les fournisseurs Claude, Ollama, OpenAI et les trois générateurs d'images **n'ont jamais été appelés pour de vrai** (ni clé ni serveur sur ce poste).

## Décisions prises
- Electron 45 + React 19 + Zustand + `node:sqlite` ; Tauri écarté (Rust requis).
- Modèles par défaut avec Claude : `claude-opus-5-5` (narration), `claude-haiku-5-5` (rapports, résumés) ; fournisseur par défaut : démonstration.
- Un seul appel léger après chaque scène (Greffier = Archiviste + Gardien + pistes) ; agents de personnages groupés en un appel par nuit.
- Combat résolu par le code, sans appel d'IA ; saisie vocale non prévue (pas de reconnaissance locale dans Electron).
- Coût : ne plus lancer de sous-agents sans modèle moins cher explicite ; ne pas recharger la compétence `claude-api` (le fournisseur Anthropic est écrit).
