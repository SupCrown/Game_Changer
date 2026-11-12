# RÉSONANCE — mémoire du projet

Visual novel adaptatif mené par une IA. Cahier des charges : `PROMPT_claude_code_visual_novel.md`. Choix techniques et flux d'un tour : `ARCHITECTURE.md`.

## ÉTAT AU 12/11/2026 — TRAVAIL INTERROMPU EN COURS D'ÉTAPE

Arrêt demandé par l'utilisateur (coût de la session). **Rien n'est commité** (le dépôt n'a encore aucun commit). **L'application n'a encore jamais été construite ni lancée** : seuls le cœur et les tests ont été exécutés.

### Ce qui est écrit ET vérifié (92 tests Vitest verts, `tsc` propre sur le cœur)
- `src/shared/types.ts`, `src/shared/ipc.ts`, `src/shared/i18n.ts` — contrat de données, contrat IPC, i18n façon gettext (le texte français est la clé).
- `src/core/rules/` — `des.ts`, `moteur.ts` (bornes, Résonance, jalousie, paliers, réputation), `rythme.ts` (budget de mystère + calendrier), `combat.ts`, `regles.ts`.
- `src/core/ai/` — `schemas.ts` (schémas Zod + lecture tolérante), `prose.ts` (analyseur de la prose du Narrateur), `types.ts`, `prompts/fr.ts`, `fournisseurs/{anthropic,ollama,openai,mock}.ts`.
- `src/core/memory/` — `contexte.ts` (assemblage pour le cache des prompts, compaction), `vecteurs.ts`.
- `src/core/storage/depot.ts` — SQLite (`node:sqlite`), arbre de scènes, export/import.
- `src/core/game/` — `creation.ts` (état initial, succès), `session.ts` (tour complet, jets, cycle de nuit, combat, enquête, épilogue, arbre des sauvegardes).
- `tests/` — `regles.test.ts`, `ia.test.ts`, `session.test.ts`, `audio.test.ts`, `outils.ts`.
- `packs/demo/histoire.json` (« La Troisième Voix », 12 scènes + 4 génériques) et `packs/univers/*.json` (6 univers) — contrôlés par script.
- `src/renderer/src/audio/{moteur,partitions}.ts` — musique et effets procéduraux (testés, essayés dans Electron, **jamais écoutés**).

### Ce qui est écrit mais JAMAIS compilé ni lancé
- `src/core/images/` — `prompts.ts`, `detourage.ts`, `fournisseurs.ts` (ComfyUI, A1111, API OpenAI Images), `service.ts`.
- `src/main/` — `index.ts`, `application.ts`, `secrets.ts`, `smoke.ts` ; `src/preload/index.ts`.
- `src/renderer/` — `index.html`, `src/main.tsx`, `store.ts`, `styles.css`, `outils.tsx`, `essai.ts`, `voix.ts`, `ecrans/Titre.tsx`, `ecrans/NouvellePartie.tsx`, `jeu/De3D.tsx`, `jeu/Meteo.tsx`.

### Ce qui est INCOMPLET (agent arrêté en plein travail)
- `src/core/images/procedural/` : `alea.ts`, `decor.ts` (96 Ko), `sprite.ts` (61 Ko) existent, **non relus, non testés**. Il manque `illustration.ts`, `index.ts` et `tests/procedural.test.ts`. `service.ts` importe `./procedural` → **le projet ne compile pas tant que `index.ts` n'existe pas**.
  API attendue : `decorSvg({type, lumiere, graine, theme, nom?})`, `spriteSvg({graine, expression, couleur, apparence?, theme})`, `illustrationSvg({graine, titre, humeur, theme})`, type `ThemeArt`.

### Ce qui n'existe pas encore
- `src/renderer/src/ecrans/Jeu.tsx` (importé par `main.tsx`) : décor, sprites, boîte de dialogue, saisie, pistes, carte de jet, dé 3D, combat, notifications, transition, erreurs, épilogue, clavier.
- `src/renderer/src/panneaux/` : `Reglages.tsx` (importé par `Titre.tsx`), menu « grimoire » et panneaux fiche, liens, factions, journal, enquête, codex, emploi du temps, relations, sauvegardes, galerie, succès, coûts, dev, historique.
- `packs/regles/defaut.json` (facultatif, le code a ses valeurs par défaut).
- `ROADMAP.md`, `README.md`.

## PROCHAINES ACTIONS, DANS L'ORDRE
1. `src/renderer/src/jeu/De3D.tsx` — correctif en attente, non appliqué : remplacer le `color-mix()` passé à `ctx.fillStyle` par un mélange RGB calculé, et passer la prop `valeur` de `number` à `string` (étiquette de face).
2. Terminer `src/core/images/procedural/` : relire `decor.ts` et `sprite.ts`, écrire `illustration.ts` et `index.ts`, puis le test.
3. Écrire `Jeu.tsx` puis `panneaux/` (les classes CSS existent déjà dans `styles.css`).
4. `src/main/index.ts` : ajouter l'en-tête CSP hors développement (`session.webRequest.onHeadersReceived`).
5. `electron.vite.config.ts` : forcer le preload en CommonJS, fichier `index.cjs` (`main/index.ts` charge `../preload/index.cjs`, bac à sable activé).
6. `npx tsc --noEmit -p tsconfig.json`, puis `npm run build`, puis `npm run smoke` et regarder les captures dans `smoke/`.
7. `package.json` : ajouter `"postinstall": "node node_modules/electron/install.js"`.
8. `ROADMAP.md`, `README.md` (français simple), puis premier commit.
9. `ARCHITECTURE.md` §7 : retirer la table `journal_appels` (le journal du panneau dev est en mémoire, 150 entrées).

## Commandes
- `npm test` — tests (sans clé, sans coût).
- `npm run typecheck` — vérification des types.
- `npm run dev` — développement ; `npm run jouer` — construire et lancer.
- `npm run smoke` — essai de bout en bout avec captures d'écran (dossier jetable, ne touche pas aux sauvegardes).

## Conventions
- Code, commentaires et identifiants en français. Interface : tout texte visible passe par `t('…')`.
- `src/core` est du TypeScript pur : ni Electron, ni DOM. Seul `storage/depot.ts` utilise Node (`node:sqlite`).
- Le renderer n'appelle jamais une IA et ne modifie jamais l'état : il envoie des intentions par `window.resonance`.
- L'IA propose, le moteur de règles dispose. Aucun chiffre de jeu n'est envoyé au Narrateur (libellés qualitatifs).
- Tout ce qui varie d'un tour à l'autre va dans le dernier message du Narrateur, jamais avant (cache des prompts). Test : « garde un préfixe identique d'un tour à l'autre » dans `tests/ia.test.ts`.

## Pièges connus
- **npm 11 bloque les scripts d'installation** : après `npm install`, le binaire Electron manque → `node node_modules/electron/install.js`.
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
