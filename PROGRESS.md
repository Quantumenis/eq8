# PROGRESS — Quilt Studio

> Pour reprendre après `/clear` : « lis PROGRESS.md, puis fais le M4 de PLAN.md (lis seulement les parties utiles de SPEC.md) ».
> Références : `SPEC.md` (validé), `QUESTIONS.md` (toutes les recommandations ➜ adoptées), `PLAN.md` (jalons acceptés), `MISSION.md`.

## Où en est-on

| Jalon | État | Date |
|---|---|---|
| Étape 0 — SPEC | ✅ validé | 2026-10-25 |
| M0 — Squelette, empaquetage, outillage | ✅ terminé | 2026-10-25 |
| M1 — Projets, carnet, annuler/rétablir, unités | ✅ terminé | 2026-10-26 |
| M2 — Éditeur de blocs EasyDraw (dessin) | ✅ terminé | 2026-10-26 |
| **M3 — Détection des pièces, coloration, bibliothèque de blocs** | ✅ terminé | 2026-10-26 |
| M4 — Tissus, couleurs et fils | ⏭️ prochain | — |
| M5 … M9 | à faire | — |

## M1 — fait

**Cœur (`src/core/`, TypeScript pur, sans DOM)**
- `hash.ts` : SHA-256 synchrone (vecteurs officiels + comparaison à `node:crypto`).
- `project/model.ts` : le projet et les **7 sections** du carnet (Blocs = blocs, motifs, pochoirs), fiches (nom, référence, notes, verso), colorations empilées, `Paint` = tissu ou uni, `settings.maxColorings` (1 à 10, 2 par défaut), couleurs de cadre par section.
- `project/validate.ts` : validation stricte d'un fichier lu (types, bornes, identifiants uniques, références résolues) — le projet est reconstruit champ par champ.
- `project/migrate.ts` : migrations `n → n+1` ; v0 (ébauche interne) → v1 ; refus d'une version plus récente avec un message clair.
- `project/qsp.ts` + `assets.ts` : archive ZIP `project.json` + `assets/<sha256>.<ext>` ; images dédupliquées, empreinte vérifiée à la lecture, entrées étrangères ignorées, tailles décompressées plafonnées, écriture déterministe.
- `project/history.ts` : pile d'annulation **illimitée** (états immuables à structure partagée ; fusion des saisies successives dans un champ).
- `project/commands.ts` : ajouter au carnet (doublon détecté), colorations empilées (règle du Quick Start p. 30 : empile / nouveau bloc « 1 sur 1 » / dépilage des blocs de bibliothèque), scinder, suppression avec règles d'usage (§1.13), effacer l'inutilisé, tri par clics, glisser-déposer, fiches, réglages.
- `project/session.ts` : la session d'édition (projet + historique + images + « modifié »), abonnable par l'interface.
- `project/names.ts` : noms de projet sûrs (caractères interdits, noms réservés Windows, 100 caractères) ; `defaults.ts` : contenu d'origine (24 couleurs, 12 fils) et palette par défaut ; `units.ts` : `formatLength` (« 15,24 cm »).

**Application**
- Processus principal : `store.ts` (préférences, récents, sauvegarde automatique, palette par défaut — écritures atomiques), `projects.ts` (liste, création sans écrasement, ouverture, enregistrement, Enregistrer sous, Créer une copie, boîte « Enregistrer les modifications ? »), `ipc.ts` (seul l'interface locale peut appeler), menus français (Fichier : Nouveau, Ouvrir, Récents, Enregistrer, Enregistrer sous, Créer une copie, Ajouter au carnet, Carnet, Palette par défaut, Préférences), titre de fenêtre `Quilt Studio — <projet>[ *]`, confirmation à la fermeture.
- Interface : **Assistant projet** (Créer / Ouvrir ; « quilt rapide » grisé), **carnet** redimensionnable (7 sections, vignettes de 4 tailles, fiche recto/verso, Supprimer avec confirmation, Trier par clics, glisser-déposer, couleur du cadre, effacer l'inutilisé, ajout de couleurs), **préférences** (unités po/cm, colorations max, palette par défaut, Restaurer), barre du haut (Enregistrer, Annuler, Rétablir, Carnet, Ajouter au carnet), barre d'état (modifié/enregistré, unités, messages).
- **Sauvegarde automatique** toutes les 2 min si le projet a changé ; après un plantage la relance **propose de restaurer** (ou d'ignorer).

## Vérifications (toutes vertes, 2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **57/57** (6 fichiers) — aller-retour profond d'un projet riche, déduplication des images, migration v0 → v1, 500 opérations aléatoires × 4 graines (annuler tout / rétablir tout, projet valide à chaque pas), colorations (max 2 et max 1), suppression, doublons, tri, palette, noms, unités (6 po = 15,24 cm) |
| `npm run e2e` | **18/18** — M0 (5) + M1 (13) : créer « Test » → ajouter → quitter → relancer → rouvrir ; **arrêt forcé (taskkill /T) puis restauration** ; « Ignorer » ; fermeture Annuler / Ne pas enregistrer / Enregistrer ; annuler-rétablir ; doublon ; noms invalides ; tri, glisser-déposer, suppression ; fiches ; préférences conservées ; palette par défaut ; captures du carnet clair et sombre (`tests/e2e/__screenshots__/m1-*.png`) |
| `npm run dist` | 2 exe (≈ 120 Mo chacun) |
| `npm run e2e:dist` | 3/3 — l'exe portable ouvre sa fenêtre |

## Décisions prises pendant M1

- **Annuler/rétablir par instantanés** d'un état immuable (et non par commandes inverses) : correct par construction, mémoire faible grâce au partage de structure, et c'est ce que vérifie le test de propriété.
- **Un habillage est un tissu ou un uni recopié** : une couleur posée ne dépend pas de la palette, donc supprimer une couleur ne touche aucune pièce ; supprimer un tissu utilisé le remplace par sa couleur moyenne (`averageColor`, calculée en M4).
- **Maximum de colorations** : réglage du projet (`settings.maxColorings`), avec une valeur par défaut mémorisée pour les nouveaux projets ; le dialogue de préférences modifie les deux. Réduire le maximum ne défait pas les piles existantes.
- **« Ajouter au carnet » enregistre le projet** (SPEC §1.4) ; si le projet n'a pas de nom : avertissement puis « Enregistrer sous ». Les autres modifications (fiches, tri, suppression) attendent Ctrl+S, la sauvegarde automatique ou la fermeture.
- **Raccourcis** : Ctrl+S = Enregistrer (en M0 il était réservé à « Ajouter au carnet »), Ctrl+Maj+A = Ajouter au carnet, Ctrl+B = carnet, Ctrl+, = préférences.
- **Ctrl+Z** défait la saisie dans un champ ordinaire ; dans la fiche du carnet (chaque frappe est déjà une étape d'historique) il défait le projet.
- **Sauvegarde automatique** : la session courante écrit `recovery\session.*` ; au démarrage celle d'une session interrompue passe en `previous.*` jusqu'à ce que l'utilisateur la restaure ou l'ignore. Échap sur la boîte de restauration ne supprime rien. Après restauration, le travail est aussitôt remis en sûreté avant d'abandonner la copie précédente.
- **Sécurité des fichiers** : l'interface ne fournit jamais un chemin arbitraire (dossier des projets, récents, fichiers choisis dans une boîte de dialogue) ; création en mode « wx » (jamais d'écrasement) ; écritures atomiques.
- **Format v0** : défini par M1 comme l'« ébauche interne » qui précède le format publié (listes à la racine, `name`/`notes`, couleurs `#RRGGBB`, blocs carrés) afin d'exercer le mécanisme de migration demandé par le plan.
- **Tests isolés** : variables `QUILT_STUDIO_DATA_DIR`, `QUILT_STUDIO_DOCUMENTS_DIR`, `QUILT_STUDIO_AUTOSAVE_MS` ; aucun test n'écrit dans les vrais Documents ni dans les données de l'utilisateur.
- **Captures M0 réenregistrées** : la tolérance de 1 % des pixels (`playwright.config.ts`) laissait passer la nouvelle barre d'outils ; j'ai supprimé et réenregistré `m0-*.png`. À garder en tête : cette tolérance est large pour détecter de petits changements d'interface.

## Reporté / limites connues (M1)

- Le carnet ne crée encore que des **couleurs** : blocs, quilts, tissus et photos n'ont pas d'éditeur avant M2-M5 ; leur logique (colorations, doublons, suppression) est couverte par les tests du cœur, mais pas encore visible dans l'interface. « Modifier » est grisé ; les vignettes sont des pictogrammes (aperçus réels avec les éditeurs). L'interface de navigation des colorations (flèches, « 2 sur 5 », Scinder) est prévue en M3.
- Les blocs et tissus par défaut d'un projet neuf arrivent avec les bibliothèques (M3, M4) ; pour l'instant seuls Couleurs et Fils sont pré-remplis.
- Non faits (P2, hors plan M1) : renommer et supprimer un projet depuis l'assistant, quilts rapides, compresser un projet. « Créer une copie » et « Enregistrer sous » passent par une boîte native, non pilotée par les tests (leur logique d'écriture est la même que celle de « Enregistrer »).
- Le thème reste dans le stockage local de l'interface.
- Une fois, le premier `npm run e2e:dist` suivant la construction a dépassé les 60 s d'attente de la fenêtre du portable (exe de 125 Mo fraîchement écrit, probablement analysé par l'antivirus) ; relancé aussitôt, il passe en ≈ 10 s. Si cela se reproduit, relancer le test.

## M2 — fait

**Cœur (`src/core/draw/`, TypeScript pur)**
- `geometry.ts` : points, segments (`line` / `arc`), **arc de cercle défini par ses extrémités et sa flèche signée** (sagitta ; |flèche| = corde/2 = demi-cercle), centre, rayon, balayage, longueur, boîte englobante exacte, projection, sous-arc, tracé SVG exact.
- `intersect.ts` : intersections droite-droite, droite-arc, arc-arc (avec le paramètre sur chaque segment).
- `snap.ts` : accrochage **nœud > grille > ligne**, tolérance en pixels écran convertie en pouces selon le zoom.
- `draft.ts` : le brouillon d'un bloc (taille, points d'accrochage, papier millimétré, options d'accrochage, segments, **repères**) et ses opérations pures : ajouter (retire les superpositions de droites, refuse ce qui sort du bloc), supprimer, déplacer, déplacer un nœud (toutes les extrémités coïncidentes suivent), régler la flèche, convertir en repères, redimensionner le bloc (le dessin suit), `toDrawing` / `fromDrawing`.
- `nodes.ts` : partitionner en N (i/N), décaler en N ((i − ½)/N, deux demi-parts aux extrémités — Q-6.2), moitié, tiers, aux intersections (le segment et ceux qu'il croise sont coupés).
- `transform.ts` : miroirs (G-D, H-B, deux diagonales) **par rapport aux axes du bloc**, rotation 90/180/270 exacte et angle libre, redimensionnement en % **autour du centre de la sélection**, avec ou sans « Cloner ».
- `tools.ts` : ligne, demi-cercle (inversable), grille colonnes × lignes (lignes intérieures + côtés du rectangle hors contour), recherche du segment sous la souris. `view.ts` : zoom (niveaux fixes 10 % à 4000 %, Ctrl+molette continu), défilement, ajustement. `editor.ts` : session d'édition d'un bloc avec **son propre historique**.

**Interface**
- Plan Bloc : onglet NOUVEAU BLOC (« Nouveau bloc EasyDraw »), onglet DESSIN avec la palette d'outils **Sélection, Édition, Ligne, Arc, Grille**, la **barre de précision** (taille du bloc dans l'unité choisie, points d'accrochage H/V avec contrôle « égale ou multiple », papier millimétré + divisions, accrochage grille/nœuds/lignes, convertir en repères / effacer les repères) et la zone Canvas (haute densité de pixels, thème clair/sombre, coordonnées du pointeur, boutons − / % / + / Ajuster).
- Sélection : clic, Maj+clic, Ctrl+A, glisser pour déplacer avec accrochage, Suppr, **barre d'espace = resélectionner le(s) dernier(s) segment(s) dessiné(s)** ; symétrie avancée dans la palette. Édition : nœuds à l'emplacement (clic), aux intersections, moitié, tiers, partitionner N, décaler N ; glisser un nœud ; **tente et point chaud** d'un arc (l'arc reste dans le bloc). Barre d'espace pendant le tracé d'un arc = l'inverse.
- Raccourcis : Ctrl++ / Ctrl+− / Ctrl+0, Ctrl+molette, Ctrl+A, Suppr / Retour arrière, Échap.
- **Ajouter au carnet** depuis le plan Bloc (`addColoredBlock`, doublon reconnu, bloc vide refusé, puis enregistrement du projet) ; **Modifier** un bloc du carnet reprend son dessin dans l'éditeur ; les vignettes du carnet dessinent désormais le vrai tracé (SVG, arcs exacts).
- Annuler / Rétablir (barre, menu, Ctrl+Z) agissent sur le dessin en cours quand le plan Bloc est affiché sans le carnet ouvert, sur le projet sinon.

## Vérifications M2 (toutes vertes, 2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **93/93** (8 fichiers) — dont 36 nouveaux : arc (demi-cercle, extrémités gardées, longueur et boîte à 10⁻⁹), intersections, accrochage (grille de 0,25 po, priorité nœud > grille, tolérance px → po selon le zoom), nœuds (i/5, (i − ½)/5, intersections d'un cas connu droite + arc), outils (grille 3 × 3 = 4 segments intérieurs, grille dans une grille, superpositions), transformations (rotation 90° exacte, 4 rotations = identité, miroirs, refus hors bloc), repères persistants, taille du bloc, zoom |
| `npm run e2e` | **24/24** — M0 (5) + M1 (13) + M2 (6) : diagonale glissée = segment (0,0)-(6,6) puis annulée ; accrochage ; grille 3 × 3 et arc retourné par la barre d'espace ; sélection, miroir cloné, Ctrl+A, Suppr, partition en 5, déplacement d'un nœud ; ajout au carnet (fichier `.qsp` relu), doublon, Modifier ; annuler/rétablir par le menu. Captures `m2-bloc-100.png` et `m2-bloc-400.png` |
| `npm run dist` | 2 exe (≈ 125 Mo chacun) |
| `npm run e2e:dist` | 3/3 |

## Décisions prises pendant M2

- **Arc = arc de cercle par flèche signée** (réponse à Q-6.3 : arc de cercle, pas de Bézier). Les sous-arcs gardent leur cercle ; l'arc ne peut pas dépasser le bloc ni devenir une droite (|flèche| ≥ 10⁻⁴ po).
- **Un nœud est une extrémité** : « ajouter un nœud » coupe le segment. La planarisation complète (intersections de tout le dessin) est celle de M3 ; « Aux intersections » coupe seulement le segment choisi et ceux qui le croisent.
- **Symétries** : les miroirs se font par rapport aux **axes du bloc** (les diagonales exigent un bloc carré) ; la rotation et le redimensionnement se font **autour du centre de la sélection**. Un résultat qui sortirait du bloc est refusé avec un message (rien n'est modifié). Redimensionnement non uniforme : les extrémités suivent, la flèche d'un arc est proportionnelle à sa nouvelle corde (l'arc reste un arc de cercle).
- **Pas de lignes superposées** : une droite tracée sur une droite existante est réduite à la partie nouvelle ; un arc identique est ignoré.
- **Le brouillon n'est pas dans le projet** tant qu'on n'a pas fait « Ajouter au carnet » : il a son propre historique (illimité) et n'est **pas** couvert par la sauvegarde automatique ni la confirmation à la fermeture. Les **repères** vivent dans l'éditeur (ils survivent à « Nouveau bloc » mais pas à la fermeture de l'application).
- **Accrochage** : grille active = toujours un point de grille (priorité à un nœud dans 10 px) ; « aux lignes » ne joue que si la grille est coupée. Le nombre de points d'accrochage doit égaler la taille (dans l'unité affichée) ou en être un multiple quand la taille est entière ; sinon le champ est signalé (on garde l'ancienne valeur à la saisie).
- **Zoom** : 100 % = 96 px par pouce ; boutons et Ctrl+± suivent des niveaux fixes (… 300, 400, 600 …), Ctrl+molette est continu. Tant qu'on n'a pas zoomé ni défilé, le bloc suit la taille de la zone.
- **Aucune API globale de test** : le canvas expose `data-scale`, `data-origin-x/y` et la liste des segments (`data-segments`) pour Playwright.

## Reporté / limites connues (M2)

- Pas de sélection au lasso, pas de copier-coller de segments (hors plan M2).
- Les styles PolyDraw, Applique, Serendipity et l'image de décalque ne sont pas faits ; les onglets COLORATION et IMPRIMER & EXPORTER du plan Bloc sont vides jusqu'à M3 / M7.
- Le contour du bloc n'est pas un segment ; « bloc vide » ne regarde que les segments dessinés. Le **nettoyage** des segments pendants, la détection des pièces et le test « tout est fermé » sont l'objet de M3.
- L'ajout au carnet enregistre le dessin brut (sans nettoyage) ; M3 appliquera le nettoyage au passage à COLORATION et à l'ajout.
- Le brouillon en cours n'est pas restauré après un plantage (voir décisions).

## M3 — fait

**Cœur (TypeScript pur)**
- `draw/pieces.ts` : **planarisation** du dessin et du contour (intersections droite-droite, droite-arc, arc-arc ; extrémités posées sur un segment ; droites superposées et arcs d'un même cercle), **fusion des sommets à 10⁻⁶ po** (extrémités d'origine prioritaires, intersections arrondies à 10⁻⁹), découpe des segments, doublons retirés (une ligne tracée sur le contour disparaît). **Nettoyage Q-6.1** : arêtes pendantes retirées de proche en proche, puis seule la composante connexe du contour est gardée (un îlot qui touche le reste par un sommet reste). **Faces** par demi-arêtes triées autour de chaque sommet (angle de départ, puis courbure pour les tangences) : chaque face bornée est une pièce avec son contour exact (arcs compris), son aire et son centre de gravité **exacts** (formule de Green, segments circulaires), sa boîte, un polygone aplati à 10⁻³ po pour les clics, et ses **voisines**. `pieceAt`, `interiorPoint`, `piecePath` (SVG / Path2D).
- **Clé de pièce** (`Coloring.fills`, SPEC §5.11) : `p` + 16 caractères hexadécimaux du SHA-256 de l'écriture canonique du contour (sommets arrondis à 10⁻⁹, flèches des arcs, rotation de plus petite écriture). Elle ne dépend ni de l'ordre, ni du sens, ni des identifiants des segments : retoucher une autre partie du dessin garde la couleur des pièces inchangées.
- `draw/draft.ts` : le brouillon porte sa coloration (`fills`) ; `cleanDrawing` (nettoyage du passage à COLORATION et de l'ajout, idempotent : renvoie le même objet si rien ne change), `setFills`.
- `draw/coloring.ts` : `samePaint`, `paintPieces` (pinceau), `similarPieces` (bombe : même habillage, pièces non colorées comprises), `pruneFills`, entrées de palette (`paletteEntries`, `findPaletteEntry` pour la pipette), `displayColor` (un tissu s'affiche avec sa couleur moyenne jusqu'au M4), `pushRecent`.
- `library/builder.ts` + `library/blocks.ts` : **25 blocs** du domaine public construits par « unités » sur une grille (carré, demi-carré, quart de carré, oie volante, bandes, Snowball, coin, carré sur pointe, Economy, quart de cercle, pelure d'orange). Chaque pièce reçoit un rôle de couleur ; **coloration 1 en gris** (même luminance) et **coloration 2 en couleur**. Catégories : 01 Classiques en pièces (Carrés et bandes, Log Cabin, Triangles), 02 Étoiles (Étoiles simples), 03 Courbes (Quarts de cercle). Fiche : nom, référence « Bibliothèque Quilt Studio — catégorie », notes, verso (style, catégories).
- `project/commands.ts` : « même dessin » compare désormais **sans les identifiants** (avant, « Modifier » puis recolorer n'empilait jamais).

**Interface**
- Onglet **COLORATION** du plan Bloc : à l'entrée, le dessin est nettoyé (étape d'historique « Nettoyer le dessin ») et un **avertissement liste les segments retirés ou raccourcis** (avec leurs coordonnées) ; Ctrl+Z les rend. La zone de dessin montre les pièces remplies (coutures toujours foncées, quel que soit le thème), sans grille ni papier millimétré.
- Palette : **Pinceau**, **Bombe**, **Sélectionner & vaporiser** (semblables entourées de vert ; chaque clic dans la palette les essaie ; **flèches du clavier** pour faire défiler ; tous les essais = une seule étape d'annulation ; changer d'outil ou cliquer hors du bloc désélectionne), **Pipette** (la palette saute à l'habillage, puis l'outil précédent revient). « **Tissus & Couleurs du carnet** » : bande **Récemment utilisés** (grise si vide), onglets Tissus / Couleurs, taille des vignettes (− / +), RVB au survol, **aperçu de la sélection détachable** (fenêtre flottante déplaçable et redimensionnable, × pour la rattacher). L'état de la palette vit dans `renderer/paintStore.ts` (à partager avec le plan Quilt).
- **Colorations** : flèches début (dessin au trait) / précédente / suivante / dernière, indicateur « 2 sur 5 », clic droit (ou clic) sur l'indicateur = **Choisir une coloration** (bande de vignettes). Dans le plan Bloc elles parcourent la pile du bloc d'origine ; dans le carnet, celle du bloc sélectionné, avec **Scinder**. « Modifier » reprend la coloration affichée (et ouvre directement COLORATION si c'en est une).
- **Ajouter au carnet** depuis le plan Bloc : nettoyage (avec avertissement), puis dessin + coloration (règles d'empilement de M1) ; message « Coloration empilée… » le cas échéant.
- **Bibliothèque de blocs** (bouton « Bibliothèque », menu **Bibliothèques > Blocs…**, Ctrl+L) : arbre Bibliothèque intégrée (catégories dépliables, styles avec leur nombre), Mes favoris (grisé), Carnet courant ; sélection **clic, Ctrl+clic, Maj+clic, Tout sélectionner** ; **Ajouter au carnet** (dépilage si le maximum vaut 1, doublons reconnus, les éléments « disparaissent » un instant) ; fiche en lecture seule avec flèches de coloration ; nombre d'éléments en bas.
- Vignettes du carnet : le bloc est dessiné **avec sa coloration** (la première, ou celle affichée).

## Vérifications M3 (toutes vertes, 2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **153/153** (10 fichiers) — dont 60 nouveaux : corpus (Four Patch 4, Nine Patch 9, diagonale 2, Ohio Star 21, Log Cabin 13, Drunkard's Path 2, Churn Dash 17, Flying Geese 3) ; **invariant d'aire** sur les 25 blocs (10⁻⁶) ; quart de cercle = πr²/4 et centre 4r/3π (10⁻⁸ : le dessin est arrondi à 10⁻⁹) ; arcs croisés ; nettoyage (ligne flottante, îlot du Log Cabin p. 120, îlot relié par un sommet gardé, bout qui dépasse, pendants en chaîne, ligne sur le contour, jonctions en T) ; idempotence et clés indépendantes de l'ordre, du sens et des identifiants ; **Euler sur 200 grilles aléatoires** (F = E − V + 1 + C, et pièces = cases + diagonales) ; bombe, pipette, récents ; bibliothèque (2 colorations couvrant toutes les pièces, gris réel) ; empilement après « Modifier » |
| `npm run e2e` | **28/28** — M0 (5) + M1 (13) + M2 (6) + M3 (4) : Nine Patch à la Grille → COLORATION (9 pièces, 12 segments après coupe) → 5 pièces au pinceau → annuler/rétablir → ajout → « 1 sur 1 » dans le plan et le carnet, `.qsp` relu (1 coloration, 5 habillages) ; avertissement de nettoyage puis Ctrl+Z ; bibliothèque → Modifier la coloration 2 → bombe, pipette (retour à la bombe), Sélectionner & vaporiser + flèches, un seul pas d'annulation, flèche « début » ; sélection multiple, doublons, Tout sélectionner, Choisir une coloration, Scinder. Captures `m3-coloration.png`, `m3-carnet-coloration.png`, `m3-bibliotheque.png` ; `m0-*.png` réenregistrées (nouveau bouton Bibliothèque) et vérifiées à l'œil |
| `npm run dist` | 2 exe (≈ 125 Mo chacun) |
| `npm run e2e:dist` | 3/3 |

## Décisions prises pendant M3

- **Clé de pièce géométrique** (ci-dessus) plutôt qu'un numéro d'ordre : stable, indépendante de l'ordre de calcul, et une coloration survit aux retouches qui ne touchent pas la pièce.
- **Tolérance de fusion 10⁻⁶ po** (la même `EPS` que tout l'éditeur M2) au lieu des 10⁻⁷ évoqués dans les risques du PLAN : un nœud « touche » pour l'éditeur exactement quand il touche pour la planarisation.
- **Le dessin nettoyé remplace le dessin** (SPEC §6.2 : « un nœud est ajouté à chaque intersection ») : après COLORATION, les segments sont coupés à chaque croisement (un Nine Patch passe de 4 à 12 segments). C'est une étape d'annulation ordinaire.
- **Blocs de bibliothèque** : noms traditionnels anglais (usage courant chez les patchworkeuses francophones), 25 blocs pour « une vingtaine » ; la liste Q-8.1 se complète en M8. Variable Star = deux demi-carrés par pointe sur une grille de 4. Tailles : grille 2-3 → 6 po, 4 → 8 po, 6 → 6 po, 7 → 7 po, Flying Geese 6 × 3 po.
- **Pas de blocs par défaut dans un projet neuf** : on les prend dans la bibliothèque (à rediscuter si vous le souhaitez).
- **Pièce non colorée** : affichée en couleur de feuille ; la bombe la traite comme « même couleur » que les autres pièces non colorées.
- **Aucune pièce colorée** : « Ajouter au carnet » ajoute le seul dessin au trait (règles M2 inchangées).
- **Scinder** est dans le carnet (là où l'on voit la pile) ; dans le plan Bloc, les flèches chargent une coloration (étape d'annulation « Choisir une coloration »).
- **Aides e2e** : `pagePoint`, `drag`, `segments`, `openBlockEditor` sont passées dans `tests/e2e/helpers.ts` ; la zone de dessin expose `data-pieces` et `data-filled` en mode coloration.

## Reporté / limites connues (M3)

- Les tissus s'affichent avec leur **couleur moyenne** et aucun tissu n'existe encore dans un projet : l'onglet Tissus de la palette est vide jusqu'au M4 (motifs, coupe ciblée, bibliothèque de tissus).
- « Modifier » reste réservé au sous-onglet Blocs (motifs et pochoirs en M8). « Mes favoris », la recherche et l'import de la bibliothèque ne sont pas faits. Pas de suppression d'une seule coloration depuis l'interface (la fonction du cœur existe).
- Pas d'avertissement visuel « pièce non fermée » pendant le dessin (le nettoyage prévient au passage à COLORATION).
- La bibliothèque et le carnet montrent la coloration 1 (grise) par défaut ; les flèches montrent la 2.

## Reste à faire — M4 (voir PLAN.md)

Générateur de tissus avec graine (~150 tissus, couleur moyenne précalculée), rendu à l'échelle réelle découpé à la pièce (remplacer `displayColor` par un motif dans `blockDraw.ts` et `Thumb.tsx`), coupe ciblée, import JPG/PNG et plan Image v1, sélecteur de couleurs et gammes OKLab, fils (bibliothèque + outils Fil), recherche par couleur, Mes favoris. La palette « Tissus & Couleurs » (`ColoringPalette.tsx`, `paintStore.ts`) et les habillages `{ kind: "fabric" }` sont déjà en place.

## Notes pratiques

- `npm run e2e` reconstruit `out/` avant de tester ; `npm run e2e:dist` suppose `npm run dist` déjà fait.
- Mettre à jour les captures de référence après un changement d'interface voulu : **supprimer** les PNG concernés (ou `npx playwright test --project=app --update-snapshots`) puis relancer — vérifier l'image avant de valider.
- La fenêtre modale masque la barre d'outils : dans les tests, annuler/rétablir se pilote par `menuCommand(app, "undo")` quand le carnet est ouvert.
- Rendu d'une page du manuel (pour lever un doute) : `.venv\Scripts\python.exe -I tools\render_pages.py refs\EQ8_Reference_Manual.pdf refs\img 110 <pages…>`.
- Versions figées et choix de M0 (Electron 44.7.0, React 19.3.0, Vite 8.3.4, TypeScript 7.0.2, electron-builder 26.17.0, clipper2-ts 2.0.1, pdf-lib 1.17.1, fflate 0.8.3, opentype.js 2.0.0) : inchangés.
