# PROGRESS — Quilt Studio

> Pour reprendre après `/clear` : « lis PROGRESS.md, puis fais le M8 de PLAN.md (lis seulement les parties utiles de SPEC.md) ».
> Références : `SPEC.md` (validé), `QUESTIONS.md` (toutes les recommandations ➜ adoptées), `PLAN.md` (jalons acceptés), `MISSION.md`.

## Où en est-on

| Jalon | État | Date |
|---|---|---|
| Étape 0 — SPEC | ✅ validé | 2026-10-25 |
| M0 — Squelette, empaquetage, outillage | ✅ terminé | 2026-10-25 |
| M1 — Projets, carnet, annuler/rétablir, unités | ✅ terminé | 2026-10-26 |
| M2 — Éditeur de blocs EasyDraw (dessin) | ✅ terminé | 2026-10-26 |
| M3 — Détection des pièces, coloration, bibliothèque de blocs | ✅ terminé | 2026-10-26 |
| **M4 — Tissus, couleurs et fils** | ✅ terminé | 2026-10-26 |
| M5 — Quilts : dispositions, pose des blocs, coloration au quilt | ✅ terminé | 2026-10-26 |
| **M6 — Bordures** | ✅ terminé | 2026-10-26 |
| **M7 — Impression et PDF à l'échelle, export, métrage** | ✅ terminé | 2026-10-26 |
| **M8 — Applique, PolyDraw, blocs combinés, motifs, pochoirs et texte** | ✅ terminé | 2026-10-26 |
| M9 — Plan Image complet, photos, broderies, finitions, installateur | ⏭️ prochain | — |

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

## M4 — fait

**Cœur (TypeScript pur)**
- `color/color.ts` : hexadécimal, RVB ↔ TSV ↔ TSL, **OKLab** (aller et retour, retour dans l'écran à luminosité constante), distances RVB (Q-5.6) et perçue (OKLab × 100) ; gammes **Nuances & teintes**, **Tons**, **Dégradés** (4 à 16 couleurs, 8 au départ, extrémités exactes, Q-5.4), **Insérer** ; **tri automatique** par teinte, luminosité ou saturation, croissant ou décroissant, les gris à part (Q-5.3).
- `fabric/generator.ts` : **générateur de tissus** déterministe (graine mulberry32) : uni, rayures (verticales, horizontales, diagonales), pois (en quinconce ou non), damier, vichy, écossais (sergé), marbré (bruit périodique sans couture), ombré (aller-retour OKLab). Une tuile à l'**échelle réelle** (taille en pouces, rendue à 96 ppp, moins pour les motifs doux), suréchantillonnée ; paramètres lus prudemment (ils viennent d'un fichier).
- `library/fabrics.ts` : **150 tissus** (4 catégories, 8 styles), noms français ; `fabricAverages.ts` : **couleurs moyennes précalculées** (vérifiées par un test). `library/threads.ts` : **168 fils** (coton, polyester ; 7 familles × 4 teintes × 3 intensités), numéro « QS nnnn » dans la Référence. `library/search.ts` : recherche **par couleur** (les N plus proches) et **par texte** (sans casse ni accents, Q-8.2).
- `image/` : `raster.ts` (RVBA, couleur moyenne, empreinte), `png.ts` (**encodeur** PNG avec pHYs, **décodeur** des PNG non entrelacés), `info.ts` (type, taille et **ppp** : PNG pHYs, JPEG JFIF puis EXIF ; **75 ppp** à défaut, Q-7.1), `ops.ts` (recadrer, retourner, quarts de tour exacts, rotation libre avec fond et « recadrer après rotation », incliner ±45°, redimensionner normal / bilinéaire / bicubique, **redresser**, échelle par largeur entière ou **par mesure d'une zone** (Q-7.2), préréglages de recadrage Q-7.4), `editor.ts` (session du plan Image, historique borné à 30 pas).
- Modèle : `Paint` tissu + **`offset`** (coupe ciblée), `Coloring.threads` (**fil par section** : couleur, style continu/tirets/pointillés/point-tiret, épaisseur 1-5, Q-5.2) ; validation stricte de ces champs (facultatifs : le format reste v1). `draw/threads.ts` : sections = arêtes des contours des pièces (contour du bloc compris), **clé de section** géométrique indépendante du sens ; pinceau fil, bombe fil, propriétés cochées. `draw/coloring.ts` : `fussyCut` (pas 1/16 et 1/2 po, Q-5.1).
- `project/transfer.ts` : copier des éléments d'un carnet à un autre (un bloc emporte ses tissus, un tissu ou une photo son image ; un tissu identique déjà présent est réutilisé). `library/favorites.ts` : **Mes favoris** — un fichier `.qsl` = une archive `.qsp` (le carnet porteur) + `library.json` (type, nom, styles) ; créer (1 à 59 styles), coller (254 par style), supprimer, modifier, relire. `project/images.ts` : tissu ou photo tirés d'une image, Copier vers Tissus / vers Photos (un tissu généré est rendu en PNG), ajout de couleurs (une couleur déjà présente est ignorée). `qsp.ts` accepte des entrées JSON supplémentaires.
- Un **projet neuf** contient 12 tissus (le premier de chaque style + 4 marbrés).

**Interface**
- **Rendu des tissus** (`fabricTiles.ts`, `paintView.tsx`) : tuile répétée à l'échelle réelle et découpée à la pièce (Canvas : `createPattern` + `setTransform` ; SVG : `<pattern>`), décalée par la coupe ciblée ; images décodées en asynchrone (la couleur moyenne s'affiche en attendant). Vignettes du carnet, palette, « Récemment utilisés », aperçu et bibliothèques montrent les vraies textures.
- Onglet COLORATION : outil **Coupe ciblée** (tirer le tissu dans la pièce ; flèches 1/16 po, Ctrl+flèches 1/2 po ; un glissement = une étape d'annulation, les flèches successives aussi), **Pinceau fil** et **Bombe fil** avec le panneau **Propriétés du fil** (fils du carnet, style, épaisseur, cases « le clic change : couleur / style / épaisseur », au moins une cochée) ; la couture visée est mise en évidence. Fils et décalages sont enregistrés avec la coloration (et repris par « Modifier » et par les flèches de coloration).
- **Plan Image v1** (`ImageWorkspace.tsx`) : Importer une image (Fichier > Importer une image, Ctrl+I ; une à la fois ; une image modifiée est proposée à Photos avant d'être remplacée), Supprimer l'image, **règles** en po ou cm à l'échelle réelle, Taille réelle (1 px = 1 px), Ajuster, Panoramique, Ctrl+molette ; **Échelle du tissu** (largeur entière, flèches par ¼ po) et **Mesurer une zone** ; **Recadrer** (cadre à poignées, partie coupée voilée, X/Y/L/H dans l'unité, préréglages, ✓ Appliquer / ↺ Réinitialiser) ; **Redresser** (tracer une ligne, Appliquer) ; Pivoter ±90° et d'un angle, couleur de fond, « recadrer après rotation » ; Retourner H/V ; Incliner ; Redimensionner (px, po, cm ; proportions ; résolution ; rééchantillonnage) ; **Ajouter comme tissu** et **Enregistrer dans Photos**. Annuler/Rétablir agissent sur l'image quand le plan Image est affiché.
- **Bibliothèques** de blocs, de **tissus** et de **fils** (`Library.tsx` ; boutons Bibliothèque / Tissus / Fils, menu Bibliothèques, Ctrl+L, Ctrl+Maj+F, Ctrl+Maj+T) : bibliothèque intégrée, **Mes favoris** (+ créer, ✎ modifier nom et styles, 💾 enregistrer, × supprimer ; Copier puis Coller dans un style ; Supprimer des éléments ; **rappel** si l'on quitte une bibliothèque modifiée), Carnet courant, **Résultats de recherche** (par couleur moyenne : élément sélectionné ou couleur du carnet ; bibliothèques à fouiller ; au plus 1-999, 50 par défaut ; « Afficher la couleur moyenne » ; fils aussi par nom ou numéro), **Résultats d'import** (tissus : import d'images **multiples**). Fichiers : `Documents\Quilt Studio\Favoris\{Blocs,Tissus,Fils}\<nom>.qsl`.
- **Couleurs** : notre **sélecteur** (carré TSV + réglette de teinte, hexadécimal, RVB, TSL, TSV ; plusieurs couleurs d'affilée) ; **clic droit sur une couleur** (carnet ou palette) : Ajouter des couleurs, Nuances & teintes, Tons, Dégradés (seconde couleur prise dans la palette ; Insérer / Retirer ; ajout à la fin), Trier les couleurs > Manuel, Automatique, **Défaire le tri**.
- Carnet : « Modifier » une **photo** (vers le plan Image), **Copier vers Photos** (tissus), **Copier vers Tissus** (photos), vignettes des photos.

## Vérifications M4 (toutes vertes, 2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **204/204** (14 fichiers, + 1 test de régénération ignoré) — dont 51 nouveaux : **générateur déterministe** (même graine → même image, même empreinte), **damier 50/50 → 127,5 ± 1**, échelle de la tuile (cases de 96 px à 96 ppp), table des moyennes = générateur, 150 tissus / 168 fils ; **échelle** (300 × 150 px à 75 ppp = 4 × 2 po ; 6 po de large → 50 ppp ; mesure 120 px = 2 po → 60 ppp) ; ppp lus (PNG pHYs, JPEG JFIF en dpi et dpcm, simple rapport d'aspect → 75) ; PNG aller-retour exact et déterministe ; **redresser 3° → −3°** (et vers la verticale) ; recadrage, quarts de tour, rotation libre (toile agrandie ou recadrée), inclinaison, réduction (moyenne conservée), préréglages ; **dégradé de 8 pas : extrémités exactes, luminosité OKLab monotone** ; nuances, tons, Insérer, tri automatique ; coupe ciblée et fils (aller-retour du projet, style inconnu refusé, 24 sections d'un Nine Patch) ; Copier vers Tissus/Photos ; transfert d'un bloc avec ses tissus et images ; favoris (créer, coller, relire, supprimer, 254 par style) |
| `npm run e2e` | **32/32** — M0-M3 (28) + M4 (4) : **PNG damier de 1 po à 96 ppp → Ajouter comme tissu → pièce de 2 po : 2 cases** (échantillonnage du canvas) ; coupe ciblée (glisser, flèches, Ctrl+flèches, annuler/rétablir) ; pinceau fil et bombe fil (24 coutures) ; `.qsp` relu (image, ppp, décalage, fils) ; plan Image (Ctrl+I, échelle, flèches ¼ po, mesure, préréglage refusé, recadrage aux nombres, rotation, annuler, Enregistrer dans Photos, Copier vers Tissus, Modifier une photo, une seule image dans le projet) ; bibliothèque de tissus (ajout, recherche par couleur, couleur moyenne, Mes favoris : créer, copier, coller, enregistrer, supprimer, rappel, relecture) ; fils par numéro ; couleurs (sélecteur, dégradés 8 → 5, Insérer/Retirer, tri automatique, défaire le tri). Captures `m4-image.png`, `m4-coloration-tissu.png`, `m4-bibliotheque-tissus.png`, `m4-degrades.png` ; `m0` à `m3` réenregistrées (boutons Tissus et Fils dans la barre du haut) et vérifiées à l'œil |
| `npm run dist` | 2 exe (≈ 125 Mo chacun) |
| `npm run e2e:dist` | 3/3 |

## Décisions prises pendant M4

- **Tissu calé sur le coin du bloc** : la tuile part de (0, 0) du bloc ; la coupe ciblée est un **décalage par pièce** (`Paint.offset`, en pouces, retiré quand il revient à 0). Repeindre une pièce avec le même tissu garde son décalage ; la bombe et la pipette ignorent le décalage. Le glissement est libre (au pixel près), les flèches font 1/16 et 1/2 po.
- **Fils** : un fil est recopié (couleur, style, épaisseur), comme une couleur unie ; une couture sans fil garde l'aspect foncé par défaut. Une « section » est une arête du dessin planarisé (le dessin est déjà coupé à chaque intersection), contour du bloc compris. Épaisseur d'affichage en pixels d'écran (indépendante du zoom).
- **Format** : décalage et fils sont des champs **facultatifs** du format v1 (pas de migration) ; une version M3 qui lit un fichier M4 les ignore.
- **Tissus générés** : rendus à 96 ppp (marbrés 32, ombrés 16 : motifs doux) ; couleurs moyennes **précalculées** dans `fabricAverages.ts`. Régénération, si la bibliothèque ou le générateur change (le test de cohérence le signale) : `QS_REGEN=1 npx vitest run tests/unit/regen-fabric-averages.test.ts`.
- **Images importées** : on garde les **octets d'origine** (JPG ou PNG) tant que l'image n'a pas été retouchée ; après retouche, un PNG avec sa résolution. Les pixels sont décodés par le navigateur sans gestion de couleur. Le plan Image a son propre historique (30 pas) ; « Ajouter au carnet » y renvoie vers « Ajouter comme tissu » / « Enregistrer dans Photos ».
- **Échelle** : la valeur saisie est la largeur de l'image entière (Q-7.2) ; « Mesurer une zone » accroche les extrémités au pixel entier.
- **Couleurs** : la recherche par couleur utilise l'écart OKLab (perçu) ; la tolérance du futur outil Aléatoire gardera la distance RVB (Q-5.6). Une couleur déjà présente dans la palette (même RVB, quel que soit son nom) n'est pas ajoutée de nouveau par le sélecteur ou les gammes. « Défaire le tri » revient à l'ordre d'avant le dernier tri de la session (Ctrl+Z aussi).
- **Mes favoris** : un style ne contient pas deux fois le même élément (un doublon collé est ignoré) ; supprimer une bibliothèque efface son fichier (avec confirmation) ; renommer = écrire sous le nouveau nom puis effacer l'ancien.
- **Projet neuf** : 12 tissus par défaut (à rediscuter si vous préférez un carnet vide).
- `BlockLibrary.tsx` est remplacé par `Library.tsx` (générique) ; `NumberField` et `Check` sont passés dans `components/fields.tsx`.

## Reporté / limites connues (M4)

- La fiche des éléments de Mes favoris n'est pas modifiable dans la bibliothèque ; pas de « Couper » ni de tri dans Mes favoris ; pas de renommage d'un style dans l'interface (la fonction du cœur `renameStyle` existe).
- Pipettes tissu/couleur « la plus proche » et rotation du tissu : plan Quilt (M5). Les fils ne s'appliquent qu'aux contours des pièces de blocs (pochoirs et broderies : M8-M9).
- La couleur de fond des rotations se choisit avec la pastille de couleur du système (pas de dialogue TSL) ; pas de BMP, GIF, TIF ni WebP (P2).
- Une vignette de fil très clair (« Fil blanc clair ») se voit mal sur fond blanc.
- Après la fermeture du sélecteur de couleurs, Échap ne ferme plus le carnet (le focus est perdu) : cliquer « Fermer ».

## M5 — fait

**Cœur (`src/core/quilt/`, TypeScript pur)**
- `geom.ts` (matrices affines, cadres, découpe de polygones convexes, aires), `layout.ts` (paramètres, tailles finies, emplacements du calque 1 ; bornes Q-2.2), `strips.ts` (les 11 styles de bande, formules p. 47), `onepatch.ts` (carré, rectangle, losange, triangle, hexagone, hexagone allongé, pavé, octogone + carré, personnalisé à glissières = parallélogramme).
- Dispositions : **Horizontal** (lattis, cornerstones, bordure de lattis), **Sur la pointe**, **Pointe variable** (un seul constructeur de losanges ; triangles de bord et de coin par découpe du centre), **Bandes H et V**, **One Patch**, **Custom Set**. Maximum de blocs 24, réglable jusqu'à 100.
- `doc.ts` (quilt = disposition + blocs posés + éléments libres ; lecture défensive ; `placements` dérivés, résolus par la coloration pour survivre à « Scinder » ; groupe D4 et les 16 états de Symétrie), `scene.ts` (toutes les pièces des 3 calques, clés de coloration `emplacement/clé de pièce`, test de clic), `ops.ts` (pose, Ctrl/Alt, effacer, pivoter/miroir, Symétrie, éléments libres : ajouter, déplacer, supprimer, coller, empiler, centrer, découper, aligner, même taille, redimensionner le Custom Set avec/sans conservation), `adjust.ts` (poignées, redimensionnement, rotation, inclinaison), `paintops.ts` (pinceau 5 styles, bombe, échange, pipettes « la plus proche », coupe ciblée, rotation du tissu simple/avancée/aligner sur un bord, Aléatoire), `editor.ts` (historique illimité du brouillon).
- Modèle : `Paint` tissu accepte `rotation` (facultatif, format v1 inchangé) ; `fussyCut` la conserve.

**Interface**
- Plan Quilt : onglets NOUVEAU QUILT (choix du style), DISPOSITION (nombres, tailles avec champ + curseur, bandes ◄ ► Ajouter/Insérer/Supprimer/Cloner, formules, One Patch, Custom Set), DESIGN (outils de bloc, palette Blocs/Motifs/Pochoirs avec colorations et glisser-déposer, Ajuster avec X/Y/L/H/rotation/inclinaison/copier/coller/ordre/centrer/découpe/aligner/même taille, grille d'accrochage, outils de tissu + « Tissus & Couleurs du carnet », options : règles, rotation conservée, basculement automatique, maximum de blocs). Trois calques avec œil, contours masquables, mètre ruban, taille finie en bas à droite, zoom/panoramique. Ajouter au carnet (doublon reconnu), Modifier depuis le carnet, vignettes de quilts.
- Annuler/Rétablir de la barre : le quilt s'il a un historique, sinon le projet.

## Vérifications M5 (2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **248/248** (+ 1 ignoré) — dont 44 nouveaux : 37 × 46 po (4 × 5 de 8 po, lattis 1 po, bordure), pointe **48,790**, pointe variable **33 × 51,333**, chaque style de bande et chaque forme One Patch **pavent exactement** le centre, Damier 60/10/3 = 18, comptes de pièces par style (N = 4), rotation avancée (55, 100, 145 ; 60, 120, 180), **Symétrie : 16 états distincts, le 17ᵉ = origine**, Aléatoire (teinte circulaire, saturation et luminosité saturées, tolérance 0), Ctrl/Alt, coupe ciblée sous rotation, aller-retour .qsp |
| `npm run e2e` | **36/36** (m0 réenregistrées : le plan Quilt n'est plus un espace réservé) — dont 4 nouveaux : Ctrl+clic 20 emplacements, Alt+clic 10, annuler/rétablir, pinceau Ctrl (10 pièces) + capture `m5-quilt-horizontal.png` ; tailles de toutes les dispositions ; Custom Set (poser, X/Largeur, glisser, Suppr) ; Symétrie en pixels : 16 images distinctes puis retour |
| `npm run dist` / `e2e:dist` | 2 exe / 3/3 |

## Décisions prises pendant M5

- **Sur la pointe** : réseau en quinconce de losanges de pas (b+l)√2 ; centre = n × pas (formule du manuel) ; les triangles de bord et de coin sont les losanges coupés par le centre. **Le style « une couture » (Q-2.4) est enregistré mais dessine la même chose** : à valider avec une capture.
- Bandes à motifs complexes (Doubles losanges en quinconce) : décomposition en triangles de ma façon (Q-2.5) — à valider visuellement.
- **Effacer le bloc** sur un élément libre le supprime (pas de « contour vide » conservé).
- Bloc uni : 6 × 6 po (bouton « + » de la palette). Glisser sur le Custom Set : taille de conception, ou 6 po (option).
- Rotation avancée : « premier clic » = pièce dont la rotation est 0.
- Options du plan Quilt mémorisées dans le stockage local de l'interface.

## Reporté / limites connues (M5)

- Baby Blocks, Blocs variables, Photo Patchwork, Quilt à partir d'un bloc, bibliothèque de dispositions : non faits (P2). Fils/pochoirs/broderies du calque 3 : seul l'affichage des lignes ; pas de fil au quilt. Texte en applique : non.
- Les bordures sont venues avec M6. Le tissu d'une pièce déformée (pointe variable) n'est pas cisaillé : seule la rotation du bloc l'oriente.
- Pas de test e2e du glisser-déposer HTML5 depuis la palette (le clic dans le centre fait la même pose), ni de la rotation du tissu / Aléatoire à l'écran (couverts par les tests du cœur).

## M6 — fait

**Cœur (`src/core/quilt/`, TypeScript pur)**
- `borders.ts` : le modèle (`Border` = id stable `b1`, `b2`…, style, **taille par côté**, nombres de blocs `nh`/`nv`), les **22 styles** et leur géométrie exacte. Un côté est une bande (u le long, v de l'arête intérieure vers l'extérieur) remplie d'un motif périodique ; chaque pièce devient un **emplacement du calque 1** (clé `r<id>.<côté><n>`), avec un cadre où le bloc s'étire (rectangle ou losange) quand la forme s'y prête (les triangles sont des pièces à colorer). Coins : « Longue horizontale / verticale » et les styles à carreaux font courir deux côtés sur toute la longueur ; les autres ont des **carrés de coin**. « Onglet » = 4 trapèzes, sans bloc. Les « quinconces » décalent d'une demi-cellule ; les « doubles » empilent deux rangées. **Alignés** : les arêtes suivent la grille de la bordure intérieure (n + 2 blocs par côté ; quinconce = milieux des cellules). `buildBorders` renvoie les emplacements, l'anneau de chaque bordure (intérieur/extérieur) et le **quilt fini** (`bounds`) ; `finishedSize`.
- `borderops.ts` : Ajouter (à l'extérieur), Insérer (à l'intérieur de la sélection), **Cloner** (style, tailles, nombres — ni couleurs ni blocs), Supprimer, changer de style (efface le contenu, SPEC §3.9), **tailles avec verrouillage** (Tous / G+D / H+B / rien), nombres de blocs (pour les carreaux, l'autre nombre suit : carreaux carrés), « même nombre que la bordure intérieure ». `borderpresets.ts` : **10 bordures automatiques** faites maison (3 catégories) qui règlent la bordure et la colorent en couleurs unies.
- `doc.ts` : `QuiltDoc.borders` (lecture défensive ; un fichier d'avant M6 n'a pas de bordure ; **format v1 inchangé**, champ facultatif) ; un nouveau quilt a une bordure « Longue horizontale » de 1 po. `scene.ts` : les emplacements des bordures s'ajoutent à ceux du centre ; `scene.bounds`. `ops.ts` : `newLayout(draft, kind, keepBorders)` (**Garder les bordures actuelles** : réglages gardés, contenu effacé), `prune`, `placeBlock` (**les bordures reçoivent des blocs dans toutes les dispositions**, même Custom Set ; le centre seulement dans les dispositions standard), Ctrl/Alt dans une bordure = les emplacements de cette bordure.

**Interface**
- Onglet **BORDURES** : ruban des 22 styles (vignettes tirées de la vraie géométrie), CHOISIR UNE BORDURE (◀ « 3 sur 4 » ▶, ou clic sur le quilt), Ajouter / Insérer / Supprimer + « Cloner la bordure sélectionnée », quatre tailles (champ + curseur, pas de 0,25 po) avec verrous, BLOCS DANS LA BORDURE, « Garder les bordures actuelles » et « Style des nouvelles bordures » (mémorisés). La bordure sélectionnée est **grise** (si vide) et cernée. Le quilt est cadré sur le **quilt fini** ; la barre du bas donne la taille avec bordures.
- Onglet DESIGN : outil **Bordures automatiques** (catégorie, vignette, puis clic sur une bordure du quilt). Poser, pivoter, miroir et effacer fonctionnent dans les bordures. Vignettes de quilts avec bordures.

## Vérifications M6 (2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **311/311** (+ 1 ignoré) — dont 63 nouveaux : **52 × 61 po** (bordures 1 + 2,5 + 4, Tous) et **43 × 48 po** (G+D = 3, H+B = 1) ; pour **chacun des 22 styles** : somme des aires des pièces = aire de l'anneau (10⁻⁶, 5 jeux de tailles dont des côtés à 0) et **chaque point de l'anneau couvert par une seule pièce** (4 000 points aléatoires : ni trou ni recouvrement) ; comptes de pièces pour 4 × 5 blocs ; carreaux : quatre côtés forcés, pièces à 4 côtés ; **alignés** : arêtes de la bordure alignée = arêtes de la bordure intérieure (n + 2 blocs) ; ajouter / insérer / supprimer / cloner ; pose d'un bloc étiré (aire des pièces = aire de l'emplacement), Ctrl+clic limité à la bordure, Onglet sans bloc, Custom Set ; garder les bordures ; aller-retour du fichier et valeurs absurdes ; les 10 bordures automatiques |
| `npm run e2e` | **37/37** (+ 1 : Ajouter → 3 po (Tous) → Losanges → 4 × 5 blocs → clic pour choisir → bloc posé dans un losange → capture `m6-bordures.png` ; **Annuler/Rétablir** ; changer de style efface et s'annule ; cloner ; supprimer ; verrous G+D / H+B ; carreaux refusent 0 ; bordure automatique ; `.qsp` relu avec les bordures). `m0-*.png` et `m5-quilt-horizontal.png` réenregistrées (bordure de 1 po par défaut) et vérifiées à l'œil |
| `npm run dist` / `e2e:dist` | 2 exe / 3/3 |

## Décisions prises pendant M6

- **Géométrie reconstituée** (Q-3.1, à valider sur capture) d'après les illustrations p. 60-61 et 70 : en particulier **Grands et petits losanges** (grand losange par cellule ; chaque triangle du joint est coupé en un petit losange inscrit et deux petits triangles), **Grandes et petites pointes** (même découpage dans le triangle inverse), **Carrés espacés** (n carrés de côté t, bandes entre eux), **Doubles losanges** (deux rangées de t/2) et le « quinconce » (décalage d'une demi-cellule). Les styles Carreaux et Losanges ne diffèrent que par les coins et les côtés forcés ; **Carreaux carrés** = une rangée de carreaux sur tout le tour.
- **Pose de blocs** : seuls les **rectangles et les losanges** sont des emplacements de bloc ; les triangles et les bandes de fond se colorent. Les blocs ne sont pas tournés selon le côté de la bordure (toujours droits, étirés dans le cadre). Le bloc posé dans un losange est étiré dans son cadre en losange, comme « Sur la pointe ».
- **Clé des emplacements** `r<id>.…` : les identifiants de bordure sont stables (`b1`…, jamais réutilisés tant que la bordure existe) ; supprimer une bordure retire ses blocs et ses couleurs (les clés orphelines sont élaguées par `prune` à chaque changement de taille ou de style).
- **Taille à 0** : un côté à 0 disparaît, et ses blocs avec lui (Annuler les rend). Les styles Carreaux **refusent** 0 (le champ reste à sa valeur).
- **Compteurs** : ils ne s'appliquent qu'aux styles qui ont des emplacements (Q-3.2) ; à la création d'une bordure, ils sont proposés pour que les blocs soient à peu près carrés (peut donner 30+ blocs : réglable jusqu'à 100) ; pour les carreaux, modifier l'un recalcule l'autre.
- **Bordures automatiques** : des réglages + couleurs unies (pas de blocs de bibliothèque) ; elles s'appliquent à la bordure cliquée, remplacent son contenu, et changer le style ensuite les efface.
- **Garder les bordures** est mémorisé dans les options du plan Quilt (stockage local de l'interface), comme les autres options (Q-3.3).
- **Repère** : l'origine reste le coin haut-gauche du **centre** ; X/Y de l'outil Ajuster et le pointeur sont donnés depuis ce coin (les bordures sont à coordonnées négatives). Découpe d'un élément libre « au bord » = le bord du quilt fini.
- Les quilts d'avant M6 s'ouvrent **sans bordure** (leur taille finie ne change pas) ; tout nouveau quilt a une bordure de 1 po (les captures de référence et les nombres d'emplacements des tests e2e en tiennent compte).

## Reporté / limites connues (M6)

- Assistant « style par côté » (P3) non fait : on crée quatre bordures dont trois côtés valent 0. Pas de pivotement des blocs selon le côté d'une bordure.
- Les bordures automatiques ne posent pas de blocs de la bibliothèque (M8 pourra en ajouter) ; la liste est faite maison (Q-8.1).
- « Garder les bordures » ne s'applique qu'aux changements de disposition faits depuis NOUVEAU QUILT.
- Les règles et le pointeur ne partent pas du coin du quilt fini.
- Une bordure de style « alignés » ne prend pas automatiquement le nombre de blocs de la bordure intérieure : le bouton « Même nombre que la bordure intérieure » le fait.

## M7 — fait

**Cœur (`src/core/print/`, TypeScript pur)**
- `display.ts` : la **liste d'affichage unique** (pages en pouces, y vers le bas ; tracés avec arcs exacts et Béziers, textes à 5 rôles de police, groupes transformés et découpés ; remplissage couleur ou **tissu répété**). Transformation des contours (un arc reste un arc sous une similitude, sinon il est aplati), Béziers d'arcs ≤ 90°, boîtes, test « la fenêtre contient-elle quelque chose » (pages vides).
- `pdf.ts` : sortie **pdf-lib** à l'échelle 1:1 (matrice [72 0 0 −72 0 H], puis tout en pouces), polices système **intégrées par sous-ensemble** (fontkit), Helvetica sinon (métriques d'Arial : `measure.ts`) ; tissus = couleur moyenne + tuiles PNG/JPEG découpées à la pièce. `svg.ts` : la même chose en SVG (export, et page HTML d'impression).
- `paper.ts` : formats Lettre, A4, Légal, A3, Tabloïd ; orientation ; marges (0,25 à 2 po) ; **format par défaut selon le pays** (Q-9.11) ; **mosaïque** : recouvrement 0,5 po, trait pointillé de raccord, repères de coin, étiquette « L1-C2 », **plan d'assemblage**, pages vides non émises.
- `offset.ts` : marge de couture = décalage Clipper2 en **onglet** (écrêté au-delà de 4 × la marge). `source.ts` : le « bloc d'impression » depuis le plan Bloc (coloration, taille du plan ou personnalisée, miroir) ou depuis un **élément du quilt** (« Utiliser la taille du quilt », cadre redressé, blocs étirés compris ; droit-fil = sens du tissu posé).
- `shapes.ts` : **lettres** (même forme à une rotation près ; miroir = autre lettre « (A inversée) », Q-9.4) et comptes **par tissu ou couleur** ; reconnaissance des formes du cutter (Q-9.6 : carré, rectangle, demi-carré, quart de carré, parallélogramme 45°, losanges 45° et 60°, équilatéral, trapèze 45°).
- `templates.ts` (gabarits : coupe continue, couture en tirets, droit-fil, lettre, « Couper N », nom ; bloc clé Petit 2 po / Grand 3,5 po ; rangement à la suite, mosaïque des grands ; **retouches** supprimer / déplacer / pivoter de 30°), `rotary.ts` + `pages.ts` (découpe rotative arrondie au plus proche 1/8, 1/16, au millième ou au mm ; bande, recoupe, carrés à couper ; diagrammes ; **bloc** en 4 styles, « autant que la page en contient » ; **quilt** à l'échelle de la page ; **métrage**), `yardage.ts` (Q-9.9 : étagères triées par hauteur, rotation de 90°, raboutage des pièces plus longues que la laize, coupons 18 × 21, arrondi 1/8 yd et 10 cm, yards **et** mètres), `foundation.ts` (Q-9.5 : sections par coupes droites récursives, ordre de couture, numérotation A1…, contrôle d'un découpage manuel ; pages en 3 styles, marge autour de chaque section, unités séparées ou non).

**Interface**
- Onglet **IMPRIMER & EXPORTER** des plans Quilt et Bloc (`PrintPalette`) : Quilt, Métrage, Bloc, Gabarits, Fondation, Découpe rotative (grisés s'ils ne s'appliquent pas ; Photo et Broderie grisés, P2) ; Mise en page, Polices ; Exporter Image, Sélection, et Métafichier (SVG) au plan Bloc. Plan Quilt : un clic sur le calque choisi = élément **entouré de vert**, nom et taille finie affichés.
- `PrintDialog` : nom + **Appliquer** (met à jour la fiche du carnet), taille (du quilt / du plan, ou personnalisée), copies, options de chaque style, flèches de coloration au plan Bloc, vignette de la 1ʳᵉ page ; **Aperçu** plein écran (`PrintPreview` : zoom, une ou deux pages, Ctrl+molette, retouches des gabarits et fondations), **Exporter en PDF**, **Imprimer**. Sections manuelles de la fondation (clics dans l'ordre, Maj+clic, Grouper, Recommencer).
- **Impression** : pages SVG dans une fenêtre cachée, `webContents.print` avec le format exact et des marges nulles (taille réelle) ; page de test 1 po / 2 cm dans Mise en page. **Polices de l'imprimante** (5 rôles, 8 polices Windows). Épaisseur minimale des traits (1 à 4 px) dans Mise en page et dans les Préférences. Réglages enregistrés dans les préférences (`print`).
- **Export d'image** : PNG (avec ppp), JPG (qualité 50), SVG, PDF ; taille en po/cm avec les pixels affichés, proportions, 72 à 600 ppp (150) ; contours ; quilt entier ou bloc sélectionné. **Export d'une sélection** : rectangle tracé sur le quilt ou le bloc → Enregistrer (PNG), Copier, Imprimer.
- Processus principal : `src/main/print.ts` (polices système sur liste fermée, boîte Exporter dans `Documents\Quilt Studio\Exports`, impression, presse-papiers) ; menu Fichier : Mise en page…, Polices de l'imprimante….

## Vérifications M7 (2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **339/339** (+ 1 ignoré) — dont 28 nouveaux : **PDF 6 po = 432 × 432 pt**, **10 cm = 283,46 pt** (lecture du flux de contenu, `tests/unit/pdf-reader.ts`) ; gabarit sans marge 432 pt, **avec marge : coupe 468 pt** et couture en tirets 432 ; taille personnalisée et miroir ; **20 × 20 po en Lettre portrait = 3 × 3 pages** + plan ; pages vides non émises ; format par pays ; **triangle de 2 po + 1/4 = 2,85355 → 2 7/8** ; découpe **A 2 1/2, B 2 7/8, C 3 1/4** ; **7 × 5 sur 10 po = 1 7/8 × 2 1/2**, sans arrondi **1,929 × 2,5** ; 1/16 et mm ; 5 formes reconnues, courbe omise ; comptes par couleur sur **Ohio Star** et **Churn Dash** ; lettres miroir/rotation ; **métrage : 20 carrés de 4,5 sur 42 po = 3 rangées, 13,5 po, 3/8 yd** ; bordure raboutée ; rotation de 90° ; coupons ; métrique ; fondation (Flying Geese en une section, Ohio Star en sections cousables, Nine Patch en 3 bandes, bloc courbe → manuel) |
| `npm run e2e` | **39/39** — dont 3 nouveaux (`print.spec.ts`) : Ohio Star posé, élément cliqué (8 × 8 po), **Gabarits → Exporter en PDF** (1 page, lettres A et B, « Couper 5 », « Couper 16 », carré de 192 pt / coupe de 228 pt, pied de page, via `pdftotext`), découpe rotative (3 3/16 et 3 7/8 po) ; métrage, **impression du quilt** (dialogue remplacé par `QUILT_STUDIO_PRINT_TO_PDF`), fondation automatique, export PNG de 1200 px ; plan Bloc : gabarits de 144 pt puis 216 pt (taille 9 po), SVG de 6 po, sélection copiée (PNG de 450 px). Captures `m7-apercu-gabarits.png` et `m7-decoupe-rotative.png` vérifiées à l'œil. Un test du M2 (arc retourné par la barre d'espace) a échoué une fois puis passé 3 fois sur 3 : instable, sans lien avec le M7 |
| `npm run dist` / `e2e:dist` | 2 exe / 3/3 |

## Décisions prises pendant M7

- **Arrondi au plus proche** (et non au supérieur) : c'est la seule lecture compatible avec les exemples du manuel (2,85355 → 2 7/8 et 1,9286 → 1 7/8). Sans arrondi : au millième, affiché en décimales.
- **Ordre des lettres** : coin haut-gauche des pièces, de haut en bas puis de gauche à droite (les carrés d'Ohio Star sont A).
- **« Cross with a Cross »** (exemple p. 225) n'est pas dans notre bibliothèque : les comptes par couleur sont testés sur Ohio Star et Churn Dash, et les cotes A/B/C sur des pièces construites.
- **Rectangle** : bande = petit côté, recoupe = grand côté. **Quart de carré** reconnu quand l'hypoténuse suit le droit-fil, demi-carré quand ce sont les côtés droits.
- **Tissus dans le PDF** : la pièce vectorielle est remplie de la tuile réelle répétée (PNG du générateur ou octets de l'image), par-dessus la couleur moyenne ; au-delà de 4 000 tuiles par pièce, couleur moyenne seule.
- **Épaisseurs** en points, indépendantes du zoom des groupes ; 1 px d'épaisseur minimale = 0,75 pt (96 ppp).
- **Impression** : toujours depuis la même liste d'affichage, en SVG dans une page HTML au format exact, marges nulles (aucune mise à l'échelle) ; les **copies** ne s'appliquent qu'à l'impression (pas au PDF exporté).
- **Fondation** : miroir coché par défaut (on coud au verso) ; ordre de couture = on retire d'abord les plus petites pièces détachables ; découpage = le moins de sections possible (mémoïsé).
- **Métrage** : les pièces non colorées forment une ligne « Non coloré » ; calques 1 et 2 comptés, pochoirs non.
- **Bloc du plan** : imprimé avec sa coloration en cours (flèches : dessin au trait / coloration du plan) ; le nom vient du bloc d'origine, « Bloc du plan » sinon.
- `QuiltWorkspace.tsx` et `quiltDraw.ts` repassés en fins de ligne LF comme le reste (git les normalise de toute façon).

## Reporté / limites connues (M7)

- Sectionnement de fondation **non enregistré avec le bloc** (P1) : il dure le temps de la boîte. Pas d'onglet « Numérotation » séparé : l'ordre des clics dans une section donne la numérotation.
- Photo, Broderie, Mise en page de photos (P2), « Imprimer toute la bordure » (P2), TIF/BMP/EMF (P3) : non faits.
- Aperçu : pas de zoom par rectangle tracé (boutons et Ctrl+molette seulement). Bloc clé du tableau de découpe sans cercle autour des lettres.
- L'impression réelle par le dialogue de Windows n'est pas testée automatiquement (le même chemin l'est, en PDF) : à essayer une fois sur l'imprimante, avec la page de test.
- Les blocs déformés (pointe variable) ont leurs arcs aplatis (polylignes à 10⁻⁴ po).

## M8 — fait

**Cœur (TypeScript pur)**
- `core/draw/bezier.ts` (Béziers → droites et arcs à 10⁻⁴ po), `applique.ts` (formes à nœuds de 4 types, pièces fermées / fils ouverts, auto-intersection, sélection, édition des nœuds : ajouter, supprimer, couper, joindre, convertir ; couronne), `appliqueShapes.ts` (ellipse / pie / arc avec sections, rectangles arrondis, 18 formes, StarMaker, PosieMaker, StencilMaker, trait de pinceau, bande, main levée par ajustement de Béziers), `polydraw.ts` (6 grilles, PolyLigne / PolyArc, cloner et pivoter selon la grille, édition), `content.ts` (dessins `easydraw`, `polydraw`, `applique`, `combo` ; pièces, fils, dessin au trait ; format v1 inchangé, nouveaux types de dessin seulement), `trace.ts` (décalque).
- `core/text/` : glyphes (opentype.js) → pièces avec trous ; `registry` (polices chargées par l'interface), `sfnt` (noms des polices installées).
- `core/library/extra.ts` : bibliothèque de 46 éléments (blocs EasyDraw, LeMoyne Star et Dresden Plate en PolyDraw, 6 blocs d'applique, 5 motifs, 4 pochoirs) répartis dans Blocs / Motifs / Pochoirs.
- Quilt : texte en applique (`FreeItem.text`, `addTextItem`, `setItemText`), fils des motifs et pochoirs (`scene.strands`, tirets bleus au calque 3), conversions automatiques (bloc au calque 2 = motif, au calque 3 = pochoir), pinceau qui colore tout le texte.
- Impression : trous dans les pièces (contour + trou en couture et en coupe), gabarits **refusés avec un message** si une pièce d'applique se coupe elle-même ; le fond d'un bloc d'applique est une pièce comme une autre (supprimable dans l'aperçu).

**Interface**
- Plan Bloc : NOUVEAU BLOC propose les 6 styles ; onglets de calque Pièces / Applique pour les blocs combinés ; palettes PolyDraw (grille et compteurs, outils, miroirs, cloner / cloner-pivoter), applique (Sélection avec X/Y/taille/%/rotation/miroirs/centrer/cloner/ordre, Édition des nœuds, Dessin à 5 sous-outils, Ellipse, Rectangle, Formes, créateurs avec aperçu en direct, couronne), options d'accrochage de l'applique, remplissage auto crème, décalque (import, ajustement, clarté, recadrage numérique, masquer, supprimer).
- Plan Quilt : outil **Poser le texte** (Maj+glisser au calque 2) et palette TEXTE (police installée affichée dans sa police, taille, gras, italique, alignement). Polices lues par le processus principal (`listInstalledFonts` / `readInstalledFont`, liste fermée aux fichiers listés).

## Vérifications M8 (2026-10-26)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **398/398** (+ 1 ignoré) — dont 59 nouveaux : Béziers en arcs (4 cubiques = cercle à 3·10⁻⁴), lacet de Béziers fermé = pièce, ouvert = fil, huit = auto-intersection, couronne (8 groupes à 50 % : centres sur un cercle, 45° entre copies, centrée), grille Cercle 3 anneaux × 8 rayons (21 points), rotation propre Étoile 8 branches = 45°, PolyLigne 4 points = carré d'aire 9, secteur d'anneau à l'aire exacte, « A » avec un trou et « B » avec deux, taille 2 po → capitale ≈ 2 po (± 15 %), LeMoyne (16 pièces) et Dresden (21) remplissent le bloc sans recouvrement, 46 éléments de bibliothèque valides, relecture des 6 styles, conversions calques 2 et 3, gabarit de « AA » avec trous |
| `npm run e2e` | **44/44** à l'exception d'un arrêt de l'application parfois lent (voir ci-dessous) — dont 4 nouveaux (`applique.spec.ts`) : cœur dessiné avec Formes (capture `m8-applique-coeur.png`), fond + cœur = 2 pièces, Annuler/Rétablir, ajout au carnet ; PolyDraw (4 clics + fermeture = 25 % du bloc) ; motif en 4 sections + StencilMaker rangé dans les pochoirs ; texte « Quilt » au calque 2 (capture `m8-texte.png`, trous visibles). `m3-bibliotheque.png` réenregistrée (46 éléments) |
| `npm run dist` / `e2e:dist` | 2 exe / 3/3 |

## Décisions prises pendant M8

- **Pièces d'applique = contours de droites et d'arcs** : les Béziers sont approchés par des arcs (tolérance 10⁻⁴ po) pour garder un PDF / SVG exact avec peu de segments ; toutes les fonctions du M1-M7 (marges, gabarits, métrage…) marchent donc sans changement.
- **Formes paramétriques converties en tracés dès la création** (ellipse, pie, trait de pinceau, bande…) : pas de « forme modifiable jusqu'à sa conversion » ; on les retouche ensuite avec l'Édition des nœuds.
- **Q-6.4 (géométrie des grilles)** reconstituée : Cercle = centre + a − 1 anneaux + anneaux partiels des coins, b rayons ; Arc = quarts de cercle depuis le coin bas-gauche, b + 1 rayons ; Étoile 8 branches = grille LeMoyne (coins, pointes, losanges) + carré de coin divisé en a × b ; Kaléidoscope et Octogone = a anneaux, côtés divisés en b. À valider sur capture.
- **Q-6.5 (traits de pinceau)** : 5 contours (uniforme, fuseau, pointe départ, pointe arrivée, ondulé), 3 extrémités (plates, rondes, pointues), graisse = demi-largeur × 1/20 po.
- **Arrondi des texte** : « taille » = hauteur d'une capitale en pouces ; la boîte se recale sur l'encre à chaque modification (coin haut-gauche fixe).
- **Un clic de pinceau colore tout le texte** de la boîte ; le texte ne s'imprime qu'en gabarits.
- **Stencils** : StencilMaker bascule le motif vers l'onglet Pochoirs (case modifiable). Les pochoirs ne sont pas colorables en bloc (aucune coloration enregistrée).
- **PolyDraw** : pas d'obligation de remplir le bloc, mais la palette affiche le pourcentage couvert et signale un recouvrement.

## Reporté / limites connues (M8)

- Recadrage du décalque seulement par saisie de nombres (pas de poignées à l'œil) ; le décalque n'est pas enregistré avec le bloc.
- Rectangle de sélection d'un bloc PolyDraw : par boîtes englobantes ; pas de « Aligner les segments » pour les pièces PolyDraw.
- Serendipity : non fait (P2, M9 ou après-M9). Pas de bloc clé / numérotation de fondation pour les pièces d'applique.
- Dans l'interface, le texte au calque 2 : un clic dans le trou d'une lettre sélectionne quand même la lettre (la zone de clic du quilt est le contour extérieur).
- Test e2e `coloring.spec.ts` « bibliothèque : sélection multiple… » : l'arrêt de l'application a dépassé une fois 60 s en suite complète (bibliothèque de 46 vignettes ouverte) ; il passe seul en 9 s.

## Notes pratiques

- `npm run e2e` reconstruit `out/` avant de tester ; `npm run e2e:dist` suppose `npm run dist` déjà fait.
- Mettre à jour les captures de référence après un changement d'interface voulu : **supprimer** les PNG concernés (ou `npx playwright test --project=app --update-snapshots`) puis relancer — vérifier l'image avant de valider.
- La fenêtre modale masque la barre d'outils : dans les tests, annuler/rétablir se pilote par `menuCommand(app, "undo")` quand le carnet est ouvert.
- Rendu d'une page du manuel (pour lever un doute) : `.venv\Scripts\python.exe -I tools\render_pages.py refs\EQ8_Reference_Manual.pdf refs\img 110 <pages…>`.
- Pour lire un PDF produit : `pdftotext -enc UTF-8 -layout fichier.pdf -` (installé) ; `tests/unit/pdf-reader.ts` mesure les tracés en points.
- Versions figées et choix de M0 (Electron 44.7.0, React 19.3.0, Vite 8.3.4, TypeScript 7.0.2, electron-builder 26.17.0, clipper2-ts 2.0.1, pdf-lib 1.17.1, fflate 0.8.3, opentype.js 2.0.0) : inchangés.
