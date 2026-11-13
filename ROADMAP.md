# RÉSONANCE — feuille de route

Légende : **Fait** = écrit et vérifié (tests ou lancement réel). **Écrit** = code présent, jamais essayé contre un vrai service. **À faire** = absent.

## Étape 0 — Conception · Fait
`ARCHITECTURE.md`, `ROADMAP.md`, `CLAUDE.md`, squelette qui se lance.

## Étape 1 — Moteur de visual novel · Fait
Scène, boîte de dialogue, sprites avec expressions, décors, historique, réglages, sauvegardes, faux fournisseur d'IA.
Validé par `npm run smoke` : le jeu réel joue 4 scènes, un jet et une nuit, sans erreur.

## Étape 2 — Le MJ
| Élément | État |
|---|---|
| Séparation prose / état, moteur de règles, fiche, dés (réels et 3D), Résonance, factions, journal | Fait (tests) |
| Streaming, gestion d'erreurs, reprise après panne | Fait (tests avec pannes simulées) |
| Fournisseur Claude (cache des prompts, sorties structurées, repli sur refus) | **Écrit** — à essayer avec une clé |
| Fournisseurs Ollama et compatible OpenAI | **Écrit** — à essayer avec un serveur |

**Critère restant :** jouer dix scènes avec Claude et dix avec Ollama ; vérifier dans Menu › Coûts que la part lue en cache dépasse 70 % dès le troisième tour.

## Étape 3 — Mémoire et mise en scène
| Élément | État |
|---|---|
| Transcription, résumés scène / jour / chapitre, chronique, bible, faits, promesses | Fait (tests) |
| Recherche par similarité (vectoriseur intégré) | Fait (tests) ; vectoriseur Ollama **écrit** |
| Budget de mystère garanti par le code, Metteur en scène, agents hors champ, Gardien | Fait pour la mécanique (tests) ; **qualité des consignes à juger sur de vraies parties** |

**Critère restant :** sur une vraie partie de trois jours, aucune allusion au mystère avant la scène autorisée, et un détail du jour 1 qui revient au jour 3.

## Étape 4 — Images
| Élément | État |
|---|---|
| Mode procédural : 15 types de décor × 3 lumières, sprites × 6 expressions, illustrations | Fait (tests + captures) |
| Cache par partie, préchargement, import, galerie, filtres de contenu | Fait |
| Détourage automatique | Fait sur image de synthèse (test) ; **à vérifier sur une vraie image** |
| ComfyUI, Automatic1111, API d'images en ligne, cohérence par image de référence | **Écrit** — à essayer |

Défaut connu : en mode procédural, un personnage masculin peut être dessiné avec une silhouette féminine si sa description ne contient pas « homme ».

## Étape 5 — Profondeur
| Élément | État |
|---|---|
| Générateur de nouvelles histoires (6 univers, univers ajoutables par fichier) | Fait pour la mécanique ; **qualité à juger avec une vraie IA** |
| Calendrier, emploi du temps, activités de temps libre, codex | Fait |
| Tableau d'enquête (déductions jugées par le MJ) | Fait (test) |
| Arcs personnels (avancés par le cycle de nuit) | Fait pour la mécanique |
| Combat au tour par tour, résolu sans IA | Fait (tests) ; **interface jamais vue en jeu** (la démo n'a pas de combat) |
| Carte des relations | Fait |

## Étape 6 — Finition
| Élément | État |
|---|---|
| Musique et effets procéduraux | Fait (tests, essai technique) ; **jamais écoutés** : réglages à faire à l'oreille |
| Voix (synthèse du système), effets visuels, météo | Écrit, non observé |
| Accessibilité (vitesse, auto, taille, dyslexie, contraste, clavier) | Fait |
| Succès, statistiques, tableau des coûts avec plafonds et alerte à 80 %, épilogue | Fait (tests pour la logique) |
| Panneau de développement | Fait |
| Saisie vocale | **Coupée** : pas de reconnaissance vocale locale dans Electron |

## Étape 7 — Livraison
| Élément | État |
|---|---|
| Tests (98) et essai de bout en bout | Fait |
| `README.md` pas à pas | Fait |
| Installateur Windows (`npm run dist`) | **Configuré, jamais lancé** |
| macOS et Linux | Configurés, jamais essayés |

## Prochaines priorités
1. Essayer Claude puis Ollama sur une vraie partie ; corriger ce qui casse.
2. Écouter la musique et régler les niveaux.
3. Construire l'installateur Windows.
4. Essayer un générateur d'images réel et le détourage.
5. Alléger le paquet de l'interface (937 Ko) et n'embarquer que les polices latines.
