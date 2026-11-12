# Projet RÉSONANCE : un visual novel adaptatif mené par une IA

## Ta mission

Tu vas concevoir et développer, de bout en bout, un **vrai jeu** : un visual novel adaptatif, différent à chaque partie, dont l'histoire, les personnages, les dialogues, les sprites et les décors sont générés par IA pendant le jeu. Le joueur écrit librement ce que fait son personnage, et un Maître du Jeu (MJ) piloté par IA fait vivre le monde autour de lui.

Un prototype existe déjà sous forme de page web. Il a validé le concept et révélé ses limites (décrites plus bas). Ton travail n'est pas de le recopier mais de construire le jeu complet, au niveau d'un produit fini : solide, beau, agréable à jouer, et nettement plus ambitieux que le prototype.

Tu choisis librement les technologies. Justifie tes choix dans `ARCHITECTURE.md` selon ces critères : application de bureau qui tourne sur Windows (et idéalement macOS et Linux), lancement simple pour quelqu'un qui n'est pas développeur, sauvegardes locales, fonctionnement possible sans Internet avec une IA locale, interface fluide et soignée. Vérifie la documentation à jour des bibliothèques et des API que tu utilises plutôt que de te fier à ta mémoire.

Le joueur et toute l'interface sont en **français**. Prépare quand même le code pour d'autres langues.

## Comment tu travailles

1. **Commence par l'étape 0** (voir la feuille de route) : lis tout ce document, puis rédige `ARCHITECTURE.md` (choix techniques, schéma des modules, modèle de données, flux d'un tour de jeu) et `ROADMAP.md` (étapes, critères de validation). Pose-moi au maximum trois questions si un point bloque vraiment ; sinon, fais des choix raisonnables et note-les.
2. Avance **étape par étape**. À la fin de chaque étape, le jeu doit se lancer et être jouable dans son état actuel. Résume-moi ce qui marche, comment l'essayer, et ce qui reste.
3. Tiens à jour un `CLAUDE.md` à la racine : conventions du projet, commandes utiles, pièges connus, décisions prises. C'est ta mémoire d'une session à l'autre.
4. Écris des tests pour tout ce qui est déterministe (règles, dés, sauvegardes, calculs de réputation et de Résonance, lecture des réponses de l'IA). Pour l'IA, prévois un faux fournisseur (« mock ») qui renvoie des réponses enregistrées, afin de tester le jeu sans clé ni coût.
5. Fais des commits Git clairs et fréquents.
6. Je ne suis pas développeur : tout ce que je dois faire moi-même (installer, configurer, lancer) doit être expliqué pas à pas dans un `README.md` en français simple.

## Le concept de jeu

### Point de départ par défaut
Le héros (prénom et âge choisis par le joueur, 18 ans minimum) est un roturier pauvre et méprisé qui intègre, par un concours de circonstances, la plus prestigieuse académie royale de magie et de combat. L'IA prend ce cliché et le subvertit : intrigues politiques, secrets d'État, mystères qui prennent le joueur au dépourvu. À chaque nouvelle partie, le joueur peut garder ce point de départ ou en décrire un autre, et choisir un univers (fantasy classique, gothique, orientale, steampunk, moderne, libre), un ton, ce qu'il veut et ce qu'il ne veut pas. Le jeu génère alors un monde, une distribution et une vérité cachée entièrement nouveaux.

### Les héroïnes et le harem
Le joueur peut nouer des relations avec plusieurs héroïnes majeures (nobles hautaines, professeures mystérieuses, parias, génies incomprises, ou des archétypes adaptés à l'univers généré). Chacune a ses secrets, ses ambitions, son caractère, sa voix et sa vie hors champ. Elles peuvent se jalouser et entrer en conflit. Les romances se construisent lentement et doivent se mériter. Un harem est possible, jamais acquis.

**Règles de contenu, non négociables :** tous les personnages sont adultes (18 ans ou plus) et doivent paraître adultes dans les images. Séduction, tension et tendresse sont bienvenues ; aucune scène sexuelle explicite et aucune nudité (ellipse ou fondu au noir). Applique ces règles à la fois dans les consignes de l'IA de texte et dans celles de l'IA d'image (prompts négatifs, filtres, vérifications).

### Les systèmes à reprendre du prototype (tous)
- **Fiche de personnage** : PV, mana, statistiques avec modificateurs, capacités spéciales, états, inventaire, or.
- **Résonance** (0 à 100) avec chaque héroïne : la confiance et l'affection débloquent des paliers. À 25, un bonus passif ; à 50, une technique magique combinée ; à 75, un levier politique ; à 100, une capacité unique. Certaines Résonances s'opposent.
- **Pression sociale** : réputation de -100 à +100 auprès de quatre factions adaptées à l'univers. Sous -50, la faction agit contre le héros ; au-dessus de +50, elle le protège.
- **Dés réels** : pour les actions incertaines, le jeu demande au joueur de lancer un D20 ou un D100 et de saisir son résultat. Propose aussi un lancer virtuel animé (dés 3D) pour qui n'a pas de dés.
- **Journal** : objectifs, indices, rumeurs.
- **Historique** complet des scènes (« backlog »).
- **Portraits** : à la première apparition d'un personnage important, le joueur peut importer sa propre image ou la faire générer.
- **Décors** par lieu, avec variantes selon le moment de la journée.
- **Nouvelle histoire** (efface tout, y compris images) et **Recommencer cette histoire** (garde les images).
- **Pistes d'action** proposées, désactivables, en plus de la saisie libre.

## Leçons du prototype (à respecter absolument)

1. **Le MJ en faisait trop.** Des consignes du type « sois machiavélique, surprends le joueur » et l'obligation de remplir un journal d'indices à chaque tour l'ont poussé à glisser du mystère dans chaque réplique : avertissements énigmatiques, organisation secrète dès la première scène. Résultat : un récit enfantin. Le jeu doit garantir un **rythme lent et maîtrisé** : le quotidien de l'académie (cours, entraînements, repas, examens, rivalités, amitiés, humour, romance) occupe l'essentiel des scènes, et le grand mystère n'affleure que rarement. Les personnages parlent naturellement ; leurs secrets se trahissent par leurs actes et leurs silences.
2. **Un format de sortie rigide dégrade la prose.** Quand l'IA devait écrire la scène en petits morceaux dans un format de données strict, en tenant la comptabilité en même temps, l'écriture devenait mécanique. **Sépare la prose de l'état** : l'IA narratrice écrit librement, et la mise à jour de l'état passe par un mécanisme structuré distinct (appel d'outil, sortie structurée, ou second appel léger).
3. **La mémoire fait la qualité.** Le MJ doit avoir accès à toute la partie pour rester cohérent et faire revenir des détails anciens. Une fenêtre de quelques tours ne suffit pas.
4. **La comptabilité ne doit pas dépendre de l'IA seule.** Les nombres (PV, Résonance, réputation, or) doivent être calculés et bornés par le code ; l'IA propose, le moteur de règles valide.

## Architecture de l'IA

### Fournisseurs interchangeables
Crée une couche d'abstraction pour le texte, avec au minimum :
- **Claude via l'API d'Anthropic** (clé API saisie par le joueur), fournisseur recommandé pour la narration ;
- **Ollama** en local, pour jouer sans Internet et sans coût ;
- en option, tout service compatible avec l'API OpenAI.

Le joueur choisit son fournisseur et ses modèles dans un écran de réglages, avec un bouton « Tester la connexion ». Permets d'affecter des modèles différents selon les tâches : un grand modèle pour la narration et la mise en scène, un modèle léger pour les résumés, la mise à jour de l'état et les vérifications. Dégrade proprement quand un modèle local est plus faible (consignes plus courtes, sorties plus guidées). Utilise le streaming pour que le texte s'affiche pendant qu'il s'écrit. Avec l'API d'Anthropic, utilise la mise en cache des prompts pour l'historique, afin de réduire le coût et la latence des longues parties.

**Clés API :** jamais dans le code ni dans le dépôt. Stocke-les dans le trousseau sécurisé du système d'exploitation, ne les écris jamais dans les journaux, et affiche-les masquées.

### Plusieurs rôles d'IA plutôt qu'un seul MJ
- **Le Narrateur** écrit les scènes : prose vivante, voix distinctes, détails sensoriels, humour, jamais le héros à la place du joueur. Il termine chaque scène sur un moment où le joueur peut agir.
- **Le Metteur en scène** pilote le rythme. Il tient l'arc de l'histoire (actes, tension, respirations), un **budget d'indices** (combien de vraies révélations par chapitre), et décide entre deux scènes de ce qui doit se passer : quotidien, scène de relation, événement, progression du mystère. Il produit des consignes courtes pour le Narrateur.
- **Les agents de personnages** : chaque héroïne et chaque personnage majeur a sa fiche, ses objectifs, ses secrets, son opinion du héros et sa propre mémoire de ce qu'elle a vécu avec lui. Entre deux journées, ils agissent hors champ (intrigues, rapprochements, conflits) et ces actions ont des conséquences visibles plus tard.
- **L'Archiviste** tient la mémoire : résumés, bible de l'histoire, faits canoniques.
- **Le Gardien de la cohérence** vérifie qu'une scène ne contredit pas le canon (un mort qui reparle, un secret révélé deux fois, une incohérence de lieu) et demande une correction si besoin.

### Mémoire
- **Transcription complète** de la partie, conservée intégralement.
- **Résumés hiérarchiques** : par scène, par journée, par chapitre, et une chronique globale.
- **Bible de l'histoire** : personnages, lieux, factions, objets, règles du monde, vérité cachée, promesses narratives non tenues. Mise à jour après chaque scène.
- **Recherche par similarité** (embeddings, base vectorielle locale) pour retrouver les moments passés pertinents à chaque tour : « la dernière fois qu'il a parlé à X », « ce qu'il a promis ».
- À chaque tour, le contexte envoyé au Narrateur combine : consignes, bible, chronique, scènes récentes en entier, souvenirs retrouvés, état du jeu, consignes du Metteur en scène, action du joueur.

### Moteur de règles déterministe
Les dés, les jets, les modificateurs, les paliers de Résonance, les seuils de réputation, les PV et l'inventaire sont gérés par le code. L'IA propose des changements (« Résonance de Séraphine +4, motif : … ») dans un format structuré ; le moteur les valide, les borne (par exemple +15 maximum par scène), les applique, et refuse ce qui est incohérent. Le texte libre du joueur ne doit jamais pouvoir modifier directement l'état (« je me donne 1000 pièces d'or » ne marche pas).

## Génération d'images

### Fournisseurs interchangeables
Comme pour le texte, une couche d'abstraction, avec :
- une option **locale** (par exemple ComfyUI ou une autre interface Stable Diffusion avec API), pour qui a une carte graphique suffisante ;
- une ou plusieurs options **en ligne** via API, au choix ;
- un **mode sans génération** : formes stylisées générées par le code, ou images importées par le joueur.

Présente clairement au joueur ce que chaque option demande (matériel, compte, coût approximatif).

### Sprites
- Un **style artistique** défini à la création de la partie (anime, aquarelle, peinture à l'huile…) et appliqué à toutes les images, pour une cohérence visuelle.
- Pour chaque personnage important : un portrait de référence, puis des **variantes d'expression** (neutre, sourire, colère, gêne, tristesse, surprise, au minimum) qui gardent le même visage et la même tenue. Utilise les techniques de cohérence disponibles (image de référence, graine fixe, adaptateurs de style ou de visage selon le fournisseur).
- **Détourage automatique** pour obtenir des sprites à fond transparent.
- Le Narrateur indique l'expression de chaque réplique ; le jeu affiche la bonne variante.
- Le joueur peut régénérer, retoucher le prompt ou remplacer par sa propre image.

### Décors et illustrations
- Un décor par lieu marquant, avec variantes jour, crépuscule et nuit, décrit par le Narrateur et généré en arrière-plan pendant que le joueur lit.
- Des **illustrations d'événement** (« CG ») pour les moments forts, débloquées dans une galerie.
- **Préchargement** : génère à l'avance les décors des lieux où le joueur risque d'aller.
- Tout est mis en cache par partie et sauvegardé avec elle.

## Idées pour aller beaucoup plus loin

Intègre-les dans la feuille de route ; propose-moi d'en couper si une étape devient trop lourde.

- **Calendrier et emploi du temps** : l'année scolaire avance par jours et par semaines, avec cours, clubs, temps libre, examens, fêtes et événements. Le temps libre se dépense pour passer du temps avec quelqu'un, s'entraîner, enquêter ou se reposer. Cela donne une structure au quotidien et oblige à faire des choix.
- **Carte des relations** vivante (constellation), avec l'historique des moments clés de chaque lien et les tensions entre héroïnes.
- **Arcs personnels** : chaque héroïne a sa propre intrigue, que le joueur peut découvrir et influencer.
- **Tableau d'enquête** : les indices deviennent des cartes que le joueur relie entre elles pour formuler des hypothèses ; le MJ juge les déductions, et une bonne déduction fait avancer l'histoire.
- **Codex** qui se remplit au fil des découvertes : personnages, lieux, factions, histoire du monde.
- **Combats** : système au tour par tour lisible, avec dés, techniques combinées débloquées par la Résonance et alliées qui interviennent.
- **Voix** : synthèse vocale par personnage (locale ou en ligne), activable, avec une voix cohérente pour chacun. **Saisie vocale** des actions, en option.
- **Musique et ambiance adaptatives** : bibliothèque de musiques libres de droits classées par humeur, choisies selon la tension de la scène, et effets sonores.
- **Mise en scène** : transitions, fondus, tremblements d'écran, flash, léger mouvement des sprites, effets météo.
- **Ligne du temps des sauvegardes** : sauvegardes automatiques à chaque choix important, avec un arbre qui permet de revenir à un embranchement et d'explorer une autre voie.
- **Épilogue du MJ** : en fin de partie, révélation de la vérité cachée et des moments où tout aurait pu basculer.
- **Réglages de contenu et de ton** : romance activée ou non, niveau de violence, difficulté des jets, rythme du mystère.
- **Tableau de bord des coûts** : consommation de l'IA de texte et d'image par session, avec plafonds réglables et alertes.
- **Panneau de développement** (masqué par défaut) : état du jeu, prompts envoyés, réponses brutes, journal des appels, pour comprendre et corriger.
- **Modularité** : univers, règles et packs de personnages décrits dans des fichiers lisibles, pour pouvoir en ajouter sans toucher au code.
- **Accessibilité** : vitesse du texte, mode automatique, avance rapide, taille de police, police adaptée à la dyslexie, contrastes, navigation au clavier.
- **Succès** et statistiques de partie.

## Interface et expérience

- Écran titre, nouvelle partie (avec les préférences d'univers et de ton), chargement, réglages, galerie, codex.
- Scène : décor, sprites avec expressions, boîte de dialogue avec plaque du nom, narration distincte des répliques, chuchotements en italique, avance au clic ou au clavier, historique accessible à tout moment.
- Zone de réponse du joueur avec saisie libre, pistes d'action et demande de jet quand il le faut.
- Menu : fiche, Résonance, factions, journal, codex, emploi du temps, carte des relations, sauvegardes, réglages.
- Notifications discrètes quand une Résonance, une réputation ou un objet change.
- Affichage en direct du texte pendant sa génération, et indicateur clair quand l'IA réfléchit ou génère une image.
- Gestion des erreurs lisible : clé invalide, fournisseur injoignable, limite atteinte, réponse illisible. La partie n'est jamais corrompue par un échec, et le joueur peut réessayer.
- Un design soigné et cohérent avec l'univers généré (palette et typographie adaptées au style choisi).

## Sauvegardes et données

- Base locale (par exemple SQLite) : parties, transcription, résumés, bible, état, images, réglages.
- Plusieurs emplacements, sauvegarde automatique, sauvegarde rapide, arbre des embranchements.
- Export et import d'une partie dans un seul fichier.
- Rien n'est envoyé ailleurs que vers les fournisseurs d'IA choisis par le joueur.

## Feuille de route attendue

- **Étape 0 : conception.** `ARCHITECTURE.md`, `ROADMAP.md`, `CLAUDE.md`, squelette du projet qui se lance.
- **Étape 1 : moteur de visual novel.** Scènes, bulles, sprites, décors, historique, réglages, sauvegardes, avec le faux fournisseur d'IA.
- **Étape 2 : le MJ.** Fournisseurs Claude et Ollama, streaming, séparation prose et état, moteur de règles, fiche, dés, Résonance, factions, journal.
- **Étape 3 : la mémoire et la mise en scène.** Transcription, résumés, bible, recherche par similarité, Metteur en scène, agents de personnages, Gardien de la cohérence.
- **Étape 4 : les images.** Sprites avec expressions, détourage, décors, illustrations, cohérence du style, cache, préchargement, mode sans génération.
- **Étape 5 : la profondeur.** Générateur de nouvelles histoires, calendrier, codex, tableau d'enquête, arcs personnels, combats.
- **Étape 6 : la finition.** Voix, musique, effets, accessibilité, succès, tableau des coûts, épilogue.
- **Étape 7 : la livraison.** Tests, installateur pour Windows (et les autres systèmes si possible), `README.md` pas à pas : obtenir une clé API, installer Ollama et un modèle, configurer la génération d'images, lancer le jeu.

## Critère de réussite

Une personne lance le jeu, choisit un univers en deux minutes, et vit une histoire qui lui semble écrite pour elle : des personnages qui se souviennent, un quotidien qui donne envie de rester, un mystère qui se dévoile au bon rythme, des images cohérentes, et des choix qui comptent. Deux parties ne se ressemblent jamais.

Commence par l'étape 0.
