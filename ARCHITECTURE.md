# RÉSONANCE — Architecture

Visual novel adaptatif mené par une IA. Ce document fixe les choix techniques, le découpage en modules, le modèle de données et le déroulé d'un tour de jeu.

## 1. Choix techniques (et pourquoi)

| Besoin du cahier des charges | Choix | Raison |
|---|---|---|
| Application de bureau Windows (+ macOS, Linux) | **Electron 45** | Un seul code pour les trois systèmes, installateur Windows en une commande (`electron-builder`), aucun outil lourd à installer chez le joueur. Tauri a été écarté : il exige Rust et les outils de compilation Microsoft sur la machine de développement. |
| Lancement simple pour un non-développeur | Installateur NSIS + version portable | Double-clic. En développement : `npm install` puis `npm run jouer`. |
| Sauvegardes locales | **SQLite intégré à Node** (`node:sqlite`) | Fourni avec Electron 45 (Node 24) : aucun module natif à compiler, aucune dépendance. Un fichier unique dans le dossier utilisateur. |
| Interface fluide et soignée | **React 19 + TypeScript + Zustand**, CSS maison | Écosystème stable ; pas de framework CSS : le thème change selon l'univers (variables CSS). |
| Jouer sans Internet | **Ollama** (texte) + **mode procédural** (images, musique, voix) | Les décors, sprites, musiques et dés sont générés par le code : le jeu complet fonctionne hors ligne et sans aucun coût. |
| Clés API en sécurité | `safeStorage` d'Electron | S'appuie sur le trousseau du système (DPAPI Windows, Trousseau macOS, libsecret Linux). Les clés ne quittent jamais le processus principal et ne sont jamais journalisées. |
| Tests sans clé ni coût | **Vitest** + fournisseur « mock » | Le cœur du jeu est du TypeScript pur, sans Electron ni DOM. |
| Build | **electron-vite 6 / Vite 8** | Rechargement à chaud en développement, un seul fichier de configuration. |

Versions vérifiées sur le registre npm le 12/11/2026 (Electron 45.3, SDK Anthropic 1.8, Zod 4.6, React 19.3, Vitest 5.1, TypeScript 7.0).

### IA de texte
- **Claude (API Anthropic)** via le SDK officiel `@anthropic-ai/sdk` : streaming, cache des prompts, sorties structurées (`output_config.format`).
- **Ollama** via son API HTTP locale (`/api/chat`, flux NDJSON, `format` = schéma JSON).
- **Compatible OpenAI** (`/v1/chat/completions`, flux SSE) : LM Studio, OpenRouter, Mistral, etc.
- **Mock** : histoire de démonstration enregistrée, pour essayer le jeu et lancer les tests sans rien configurer.

Modèles par défaut avec Claude : `claude-opus-5-5` pour le « grand » modèle (narration, mise en scène, création du monde), `claude-haiku-5-5` pour le « léger » (rapport de scène, résumés, agents). Trois préréglages dans les réglages : Qualité / Équilibré (`claude-sonnet-5-5`) / Économique (tout en Haiku).

## 2. Vue d'ensemble

```
┌────────────────────────── Fenêtre (renderer, React) ───────────────────────────┐
│ Écrans : titre · nouvelle partie · scène · menu (fiche, Résonance, factions,   │
│ journal, codex, emploi du temps, relations, enquête, sauvegardes, galerie,     │
│ coûts, réglages, panneau dev)                                                  │
│ Moteur d'affichage VN · dés 3D · musique procédurale · voix (Web Speech)       │
└───────────────▲──────────────────────────────────────────────┬─────────────────┘
                │ événements (texte en direct, état, images)   │ demandes (IPC typé)
┌───────────────┴──────────────── Preload (pont sécurisé) ─────▼─────────────────┐
└───────────────▲──────────────────────────────────────────────┬─────────────────┘
┌───────────────┴──────────── Processus principal (Node) ──────▼─────────────────┐
│ src/main : fenêtre, IPC, trousseau (clés), protocole d'images, export/import   │
│                                                                                │
│ src/core (TypeScript pur, testable sans Electron)                              │
│  ├─ game/     Session : orchestre un tour, calendrier, cycle de nuit           │
│  ├─ rules/    Dés, jets, bornes, Résonance, réputation, combat (déterministe)  │
│  ├─ ai/       Fournisseurs (Claude, Ollama, OpenAI, mock) + rôles + prompts    │
│  ├─ memory/   Fenêtre de contexte, résumés, bible, recherche par similarité    │
│  ├─ images/   Fournisseurs (procédural, ComfyUI, A1111, API en ligne), détourage│
│  ├─ storage/  SQLite : parties, arbre de scènes, souvenirs, images, usage      │
│  └─ packs/    Chargement des univers et des règles (fichiers JSON)             │
└────────────────────────────────────────────────────────────────────────────────┘
```

Règle d'or : **le renderer n'appelle jamais une IA et ne modifie jamais l'état.** Il envoie des intentions (« le joueur écrit ceci », « le joueur a fait 14 au dé ») ; le processus principal décide, applique et renvoie le nouvel état.

## 3. Les rôles d'IA

| Rôle | Modèle | Quand | Sortie |
|---|---|---|---|
| **Narrateur** | grand, en streaming | à chaque tour | Prose libre, avec une convention de théâtre minimale (voir §5) |
| **Greffier** (Archiviste + Gardien) | léger | après chaque scène | Rapport structuré : résumé, changements d'état *proposés*, faits canoniques, souvenirs des personnages, pistes d'action, contrôle de cohérence |
| **Agents de personnages** | léger, un seul appel groupé | chaque nuit du jeu | Actions hors champ, nouvelle opinion du héros, résumé de la journée |
| **Metteur en scène** | grand | chaque nuit du jeu | Plan du lendemain : type de scène par créneau + consigne courte |
| **Générateur de monde** | grand | nouvelle partie | Monde, factions, distribution, vérité cachée, actes |
| **Juge des déductions** | léger | tableau d'enquête | Verdict sur une hypothèse du joueur |
| **Épilogue** | grand | fin de partie | Révélation de la vérité et des bascules |

### Les quatre leçons du prototype, traduites en mécanismes

1. **Rythme lent garanti par le code, pas par la bonne volonté de l'IA.** `rules/pacing.ts` tient un budget d'indices par chapitre et un nombre minimal de scènes entre deux révélations. À chaque scène, le *code* décide si le mystère est autorisé ; si non, la consigne envoyée au Narrateur l'interdit explicitement (« scène de quotidien, aucune allusion au mystère »). Le Metteur en scène propose, le code plafonne. Le journal d'indices n'est jamais obligatoire : le Greffier renvoie une liste vide la plupart du temps.
2. **Prose séparée de l'état.** Le Narrateur n'écrit que du texte. La comptabilité est extraite ensuite par le Greffier (second appel, modèle léger, sortie structurée validée par Zod).
3. **Mémoire.** Voir §6.
4. **Les nombres appartiennent au moteur.** Le Greffier *propose* (« Résonance de X +4, motif… ») ; `rules/engine.ts` valide, borne (+15 max par scène…), applique ou refuse, et journalise la décision. Le texte du joueur n'atteint jamais le moteur de règles : il n'est qu'une intention transmise au Narrateur.

## 4. Flux d'un tour de jeu

```
Joueur : « Je demande à Séraphine de m'aider à réviser. »
  │
  ▼ 1. Session.jouer(action)
  │    - refuse si un jet est en attente ou si le plafond de coût est atteint
  │    - construit le contexte (memory/context.ts)
  ▼ 2. NARRATEUR (streaming) ──► le texte s'affiche pendant qu'il s'écrit
  │    - analyse ligne à ligne : narration / réplique + expression / [[LIEU]] / [[JET]]
  │    - garde-fous déterministes (personnage mort qui parle, héros qu'on fait parler)
  ▼ 3. La scène est enregistrée (transcription) — rien n'est perdu si la suite échoue
  │
  ├─ Si la scène se termine par [[JET: D20 | agilité | 14 | motif]] :
  │     le moteur valide la demande, le joueur lance (dés réels saisis ou dés 3D),
  │     le moteur calcule réussite/échec, et le résultat devient l'entrée du tour suivant.
  │
  ▼ 4. GREFFIER (léger, JSON) ──► rapport de scène
  ▼ 5. MOTEUR DE RÈGLES : valide, borne, applique → notifications
  ▼ 6. MÉMOIRE : résumé de scène, faits, souvenirs par personnage, index de similarité
  ▼ 7. CALENDRIER : la scène consomme-t-elle le créneau ? (3 scènes max par créneau)
  │     └─ fin de journée → CYCLE DE NUIT : agents hors champ + résumé du jour (léger),
  │        puis plan du lendemain par le Metteur en scène (grand), compaction de la mémoire
  ▼ 8. INSTANTANÉ : état complet enregistré sur le nœud de scène (arbre des sauvegardes)
  ▼ 9. IMAGES en arrière-plan : décor du lieu, sprites des nouveaux venus, illustration
```

Chaque étape émet un événement vers l'interface (`phase`, `ligne`, `etat`, `notifications`, `pistes`, `erreur`). Une erreur à l'étape 2 ne change rien ; une erreur à l'étape 4 laisse la scène jouable (rapport rejouable). La partie n'est jamais corrompue : tout changement d'état passe par une transaction SQLite.

## 5. Convention de sortie du Narrateur

Du texte libre, avec trois conventions légères, naturelles pour un modèle de langage :

```
[[LIEU: Bibliothèque de l'Aile Nord]]          ← seulement quand le lieu change

La pluie tambourine contre les vitraux…        ← narration : paragraphes ordinaires

Séraphine (gêne) : « Tu es encore là ? »       ← réplique : Nom (expression) : « … »
Séraphine (neutre) : *« Ne le répète à personne. »*   ← chuchotement : entre astérisques

[[JET: D20 | agilité | 14 | rattraper le grimoire avant qu'il ne tombe]]   ← dernière ligne, si incertain
```

L'analyseur (`core/ai/prose.ts`) est tolérant : une ligne mal formée devient de la narration, jamais une erreur.

## 6. Mémoire

- **Transcription complète** : table `scenes`, jamais tronquée.
- **Résumés hiérarchiques** : scène (Greffier) → journée (cycle de nuit) → chapitre (fin de semaine) → chronique globale.
- **Bible** : monde, règles, factions, distribution, vérité cachée (fixe, placée dans le prompt système donc en cache) + faits canoniques, promesses narratives, fiches vivantes (évolutifs).
- **Recherche par similarité** : chaque scène est découpée, vectorisée et stockée dans SQLite (`souvenirs`). Vectoriseur par défaut intégré (n-grammes hachés, hors ligne, gratuit) ; vectoriseur neuronal optionnel via Ollama (`bge-m3`, `nomic-embed-text`). À chaque tour, les passages anciens les plus proches de l'action du joueur sont réinjectés.
- **Mémoire propre à chaque personnage** : souvenirs écrits de son point de vue, opinion du héros mise à jour chaque nuit.

### Assemblage du contexte du Narrateur (pensé pour le cache des prompts)

```
system   [consignes du Narrateur + bible fixe]                      ◄ cache n°1 (ne change jamais)
user     [MÉMOIRE : chronique, résumés de chapitres/journées, faits] ◄ cache n°2 (change une fois par journée de jeu)
…        [scènes récentes en entier : action du joueur / prose]      ◄ cache n°3 (grandit, lecture incrémentale)
user     [volatile : état, consigne du Metteur en scène, souvenirs retrouvés, action du joueur]
```

Tout ce qui varie d'un tour à l'autre est **après** le dernier point de cache. Résultat : à chaque tour, seuls la dernière scène et le bloc volatile sont facturés plein tarif ; le reste est lu en cache (1/20ᵉ du prix sur Opus 5.5). La taille de la fenêtre « scènes en entier » est un réglage (Économe / Équilibré / Riche).

## 7. Modèle de données

SQLite, un fichier `resonance.db` dans le dossier de données utilisateur.

| Table | Contenu |
|---|---|
| `parties` | id, titre, univers, dates, `tete` (scène courante), méta |
| `scenes` | **arbre** : id, partie, `parent`, index, jour, créneau, lieu, action du joueur, prose, rapport (JSON), **état complet après la scène** (JSON) |
| `souvenirs` | scène, texte, vecteur (BLOB Float32) |
| `images` | partie, clé (`sprite:<perso>:<expression>`, `decor:<lieu>:<lumière>`, `cg:<id>`), fichier, prompt, graine, fournisseur |
| `usage` | horodatage, partie, rôle, fournisseur, modèle, jetons (entrée, sortie, cache), coût estimé |
| `reglages` | clé / valeur JSON |
| `journal_appels` | panneau de développement : prompts et réponses brutes (clés exclues) |

L'**arbre des sauvegardes** découle de la table `scenes` : chaque scène porte l'état complet qui la suit. « Revenir à un embranchement » = déplacer `tete` sur une scène plus ancienne ; continuer crée une branche sœur. La transcription d'une partie est le chemin de la racine à `tete`.

`GameState` (voir `src/shared/types.ts`) : héros, monde, personnages, factions, lieux, journal, calendrier, mémoire, rythme, plan du jour, jet en attente, combat, enquête, succès.

Export / import : un fichier `.resonance` (JSON compressé gzip) contenant la partie, son arbre et ses images.

## 8. Images

Interface `ImageProvider` : `generer({ genre, prompt, negatif, graine, reference?, taille }) → PNG | SVG`.

| Fournisseur | Demande | Coût |
|---|---|---|
| **Procédural** (défaut) | rien | gratuit, instantané, hors ligne |
| **ComfyUI** (local) | carte graphique ≥ 8 Go VRAM, ComfyUI lancé | gratuit |
| **Automatic1111 / Forge** (local) | idem, lancé avec `--api` | gratuit |
| **API compatible OpenAI Images** | compte + clé | payant, affiché dans le tableau des coûts |
| **Import** | une image du joueur | gratuit |

Cohérence : style artistique fixé à la création, graine fixe par personnage, portrait de référence réutilisé pour les expressions quand le fournisseur le permet. Les sprites sont générés sur fond uni puis **détourés** par le code (`images/detourage.ts` : remplissage depuis les bords + adoucissement), sans dépendance. Règles de contenu appliquées deux fois : dans le prompt (adulte, habillé) et dans le prompt négatif ; les demandes d'image passent par un filtre de mots interdits avant envoi.

## 9. Sécurité et confidentialité

- `contextIsolation` activé, `nodeIntegration` désactivé, CSP stricte, navigation externe bloquée.
- Les clés API vivent chiffrées dans `secrets.bin` (trousseau du système) ; le renderer ne peut que demander « une clé existe-t-elle ? » et reçoit une version masquée.
- Aucun appel réseau en dehors des fournisseurs choisis par le joueur. Pas de télémétrie.

## 10. Maîtrise des coûts (décisions)

1. Cache des prompts structuré (§6).
2. Un seul appel léger après chaque scène au lieu de trois (Archiviste + Gardien + pistes).
3. Agents de personnages groupés en un appel par nuit de jeu.
4. Pas de rapport pour une scène suspendue à un jet de dés : il est fusionné avec la scène suivante.
5. Garde-fous gratuits en code avant tout appel de vérification.
6. Longueur de scène réglable ; effort de réflexion bas par défaut pour la narration.
7. Plafonds par session et par partie, avec alerte à 80 % et blocage propre à 100 %.
8. Images, musique, voix et dés : procéduraux par défaut (zéro coût).

## 11. Internationalisation

Tous les textes d'interface passent par `src/shared/i18n` (`t('cle')`, dictionnaire `fr.ts`). Les consignes d'IA sont dans `core/ai/prompts/fr.ts`. Ajouter une langue = ajouter un dictionnaire et un jeu de consignes.
