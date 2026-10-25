# PLAN — Quilt Studio, jalons M0 à M9

> Source de vérité fonctionnelle : `SPEC.md` (validé), complété par les décisions de `QUESTIONS.md`.
> Effort : **petit** (≈ 1 session), **moyen** (2-3 sessions), **gros** (4 sessions ou plus). Une session correspond à peu près à un contexte de travail avant `/clear`.
> Les P0 sont tous couverts par M0-M7 (sauf l'applique, en M8). Les P1 sont répartis sur M2-M9. Les P2 et P3 restants vont dans un **après-M9** optionnel.

## 1. Architecture retenue

### Pile technique
- **Electron + TypeScript + React + Vite**, empaquetés avec **electron-builder** (installateur NSIS + version portable).
- Tests : **Vitest** (logique pure) et **Playwright** (pilotage de l'application Electron, captures).

### Découpage du code
- `src/core/` : **TypeScript pur, sans DOM**. Il contient le modèle, la géométrie, les dispositions, les bordures, le métrage, la découpe rotative, les gabarits et la sérialisation. C'est le code le plus testé.
- `src/render/` : une **liste d'affichage** unique, construite depuis le modèle, avec **trois sorties** : Canvas 2D (écran), SVG (export) et PDF (impression). L'écran, l'export et l'impression dessinent donc exactement la même géométrie.
- `src/main/` : le processus principal Electron (fichiers, dialogues, impression, menus).
- `src/renderer/` : l'interface React (ruban, palettes, carnet, boîtes de dialogue). Les textes français sont centralisés dans `src/renderer/i18n/fr.ts`.

### Choix du moteur de dessin (D-1) : un moteur maison sur Canvas 2D
Je l'écarte de Konva et Paper.js pour quatre raisons :
1. Les tests de sélection doivent porter sur des **pièces** exactes, arcs compris, calculés par notre géométrie.
2. Les tissus sont des **motifs transformés** (échelle, rotation, *fussy cut*) découpés à la forme de la pièce : c'est natif en Canvas (`createPattern` + `setTransform` + `clip`).
3. Un quilt peut avoir **des milliers de pièces** : une liste d'affichage plate se dessine plus vite qu'un graphe d'objets.
4. La **même liste d'affichage** alimente le SVG et le PDF, ce qui garantit l'échelle 1:1.

### Géométrie
- **Clipper2** (port JS ou WASM) : unions, différences, découpe et **décalage des marges de couture**, en coordonnées entières avec un facteur d'échelle de 10⁻⁵ po.
- **Maison** : planarisation (droites et arcs de cercle), extraction des faces, arcs et Béziers exacts, aplatissement contrôlé.

### Unités et format
- **Unité interne : le pouce** (float64). Le cm n'est qu'un affichage et une saisie (1 po = 2,54 cm), et le PDF est en points (1 po = 72 pt).
- **Format de projet** : `.qsp`, une archive ZIP qui contient `project.json` (avec un `formatVersion` et des migrations) et `assets/` (les images importées, nommées par leur empreinte SHA-256, sans doublon). Le projet est autonome et transportable.
- **Favoris utilisateur** : `Documents\Quilt Studio\Favoris\`, dans le même format.

## 2. Paquets à installer au M0 (D-2, demande d'accord)

| Rôle | Paquets |
|---|---|
| Application | `electron`, `react`, `react-dom` |
| Construction | `vite`, `typescript`, `electron-builder`, `@vitejs/plugin-react` |
| Tests | `vitest`, `@playwright/test` (le mode Electron de Playwright **ne télécharge pas de navigateur**) |
| PDF | `pdf-lib` (+ `@pdf-lib/fontkit` pour intégrer les polices) |
| Géométrie | un port de **Clipper2** (le paquet exact sera choisi au M0, selon sa licence et sa maintenance) |
| Archive | `fflate` (ZIP) |
| Polices (M8) | `opentype.js` (contours des glyphes pour le texte en applique) |

- Les versions seront **épinglées** (exactes, publiées depuis au moins deux semaines).
- L'intégrité est vérifiée par le `package-lock.json` (empreintes **SHA-512** contrôlées par npm à chaque installation). Le binaire Electron est vérifié par son fichier **SHASUMS256**.
- Rien n'est installé globalement, et les caches de téléchargement temporaires sont envoyés à la corbeille.

## 3. Règles communes à tous les jalons (« définition de terminé »)
1. `npm run typecheck`, `npm test` (Vitest) et `npm run e2e` (Playwright) passent.
2. `npm run dist` produit `dist\Quilt Studio Setup x.y.z.exe` et `dist\Quilt Studio x.y.z.exe` (portable). Un test de fumée lance l'exe portable.
3. Un **commit git** par jalon (message « M<n> : … »).
4. `PROGRESS.md` est mis à jour : fait, reste, décisions, et la commande pour reprendre.
5. Les captures Playwright de référence sont ajoutées sous `tests/e2e/__screenshots__/`.
6. Aucun contenu d'EQ8 n'est utilisé ; toutes les icônes sont dessinées par nous (SVG).

---

## M0 — Squelette, empaquetage, outillage · effort **petit**

**Contenu**
- `git init` ; un `.gitignore` qui exclut `node_modules/`, `dist/`, `.venv/` et **`refs/`** (le manuel est sous droit d'auteur et reste local).
- L'échafaudage Electron, Vite, React et TypeScript ; la fenêtre « Quilt Studio » ; les trois boutons de plan (Quilt, Bloc, Image) ; le ruban vide ; la barre d'état.
- Le thème **clair et sombre** (et « système ») ; les textes en français.
- Les scripts `typecheck`, `test`, `e2e`, `dist` ; la configuration electron-builder (NSIS + portable) ; une icône de l'application faite par nous.
- `PROGRESS.md` et un `README.md` minimal.

**Critères de réussite testables**
- Vitest : un test de fumée de `src/core` passe.
- Playwright : l'application démarre, le titre de la fenêtre contient « Quilt Studio », les trois boutons de plan sont présents, et un clic sur chacun change la classe de la zone de travail. Deux captures (clair et sombre) sont prises.
- `npm run dist` produit les **deux** exe. Le portable, lancé par Playwright (`executablePath`), affiche la fenêtre en moins de 10 s.
- Le dépôt git contient le commit « M0 », et `refs/` n'y figure pas (`git ls-files refs` est vide).

## M1 — Projets, carnet, annuler/rétablir, unités · effort **moyen**
*SPEC §0.6, §1, §5.11 (le modèle des colorations), §13*

**Contenu**
- Le modèle du projet : les **7 sections** du carnet (Q-1.1), les fiches (Nom, Référence, Notes, verso), les colorations empilées (au plus 2 par défaut, selon la règle du Quick Start).
- Le format `.qsp` avec `formatVersion: 1` et un mécanisme de migration.
- Les commandes Nouveau, Ouvrir, Enregistrer, Enregistrer sous, **Créer une copie** ; l'Assistant projet (onglets Créer, Ouvrir, Quilt rapide en attente) ; les récents ; le dossier `Documents\Quilt Studio\Projets`.
- « Ajouter au carnet » enregistre (et signale un doublon) ; on demande s'il faut enregistrer à la fermeture.
- La **pile d'annulation illimitée** (commandes réversibles) ; la **sauvegarde automatique** toutes les 2 min, avec une **restauration** proposée après un plantage.
- La fenêtre du carnet : sections, vignettes, tailles d'affichage, Modifier, Supprimer (avec les règles d'usage de 1.13), Trier (cliquer dans l'ordre, et glisser-déposer), Couleur du cadre.
- Les préférences : unités po/cm, nombre maximal de colorations, Restaurer, palette par défaut.

**Critères de réussite testables**
- Vitest **aller-retour** : un projet riche est enregistré puis relu, et les deux sont **identiques en profondeur** ; les images sont dédupliquées par leur SHA-256.
- Vitest **migration** : un fichier de test `formatVersion: 0` est migré vers v1 sans perte.
- Vitest **annuler/rétablir** (test de propriété) : 500 opérations aléatoires, puis tout annuler, redonnent l'état initial ; tout rétablir redonne l'état final.
- Vitest **colorations** : avec un maximum de 2, une 3ᵉ coloration crée un nouveau bloc « 1 sur 1 » ; avec un maximum de 1, un bloc de bibliothèque à 2 colorations est dépilé.
- Vitest **suppression** : supprimer un bloc utilisé dans un quilt est refusé ; supprimer un tissu utilisé le remplace par un uni.
- Vitest **unités** : 6 po = 15,24 cm, et l'aller-retour est sans dérive au-delà de 10⁻⁹.
- Playwright : créer le projet « Test », ajouter un élément, fermer l'application, la relancer, rouvrir le projet : l'élément est là. Après un arrêt forcé du processus, la relance **propose la restauration**.

## M2 — Éditeur de blocs EasyDraw (dessin) · effort **gros**
*SPEC §6.1, §6.2, §11*

**Contenu**
- Le moteur de scène Canvas : zoom (Ctrl+molette, Ctrl+±, Ctrl+0), défilement, haute densité de pixels, liste d'affichage.
- La **barre de précision** : taille du bloc, points d'accrochage H et V, papier millimétré, options d'accrochage (grille, nœuds, lignes), repères (convertir, effacer).
- Les outils **Ligne**, **Arc** (un arc de cercle, avec la barre d'espace pour l'inverser), **Grille** (colonnes × lignes, une grille dans une grille).
- La **Sélection** : clic, Maj, Ctrl+A ; déplacer avec accrochage, supprimer ; symétrie avancée (4 miroirs, cloner, rotation 90/180/270 et libre, redimensionner en %).
- L'**Édition** : ajouter des nœuds (à l'emplacement, aux intersections, moitié, tiers, partitionner N, décaler N), déplacer un nœud, régler la flèche d'un arc (la « tente » et le point chaud).
- Les raccourcis du plan Bloc.

**Critères de réussite testables**
- Vitest **accrochage** : le point de grille le plus proche (24 × 24 sur 6 po, un point tous les 0,25), la priorité nœud > grille, la tolérance en pixels écran convertie en pouces selon le zoom.
- Vitest **arc** : un demi-cercle de A à B a son centre au milieu de AB ; changer la flèche garde les extrémités ; la longueur et la boîte englobante sont exactes à 10⁻⁹.
- Vitest **nœuds** : partitionner en 5 donne des nœuds en i/5 ; décaler en 5 donne (i − ½)/5 ; « aux intersections » trouve tous les croisements droite-droite et droite-arc d'un cas connu.
- Vitest **outils** : la grille 3 × 3 sur un bloc de 6 po produit exactement 4 segments intérieurs ; la rotation de 90° d'une sélection est exacte.
- Playwright : sur un bloc de 6 × 6 po, glisser à la souris du coin haut-gauche au coin bas-droit crée **un segment (0,0)-(6,6)** dans le modèle ; annuler le retire. Captures du plan Bloc à 100 % et à 400 %.

## M3 — Détection des pièces, coloration des blocs, blocs de bibliothèque · effort **gros**
*SPEC §5.1-5.4, §5.7, §5.11, §6.2 (règles), §6.7, §8.1-8.2 (blocs)*

**Contenu**
- La **planarisation** : intersections droite-droite, droite-arc et arc-arc, avec une tolérance ; fusion des nœuds proches ; découpe des segments.
- Le **nettoyage** (Q-6.1) : retrait itératif des segments pendants, puis conservation de la composante du contour, avec un **avertissement** qui liste les segments retirés.
- L'**extraction des faces**, qui donne des pièces (contours exacts avec leurs arcs) et leur adjacence.
- L'onglet **COLORATION** ; la palette Tissus & Couleurs (des **couleurs** pour l'instant) ; Récemment utilisés ; l'aperçu détachable.
- Les outils **Pinceau** (un point), **Bombe** (+ Sélectionner & vaporiser, avec les flèches), **Pipette** ; les **colorations** (flèches, « 2 sur 5 », Choisir une coloration, Scinder).
- La **bibliothèque de blocs**, version 1 : la structure (section intégrée, catégories, styles), Ajouter au carnet, sélection multiple. Une **vingtaine de blocs** EasyDraw du domaine public, générés par code (le reste de la liste Q-8.1 vient en M8).

**Critères de réussite testables**
- Vitest, un **corpus de blocs** dont le nombre de pièces est vérifié : Four Patch = 4, Nine Patch = 9, une diagonale = 2 triangles, Ohio Star = 21, Log Cabin à 3 tours = 13, Drunkard's Path = 2 (avec un arc), Churn Dash = 17, Flying Geese (1 unité) = 3.
- Vitest **invariant d'aire** : pour chaque bloc du corpus, la somme des aires des pièces égale l'aire du bloc, à 10⁻⁶ près.
- Vitest **nettoyage** : une ligne flottante est supprimée et signalée ; un « îlot » non relié au contour est supprimé, comme dans l'exemple du Log Cabin p. 120 ; un îlot relié par un seul sommet est gardé (Q-6.1).
- Vitest **propriété** : sur 200 grilles aléatoires, avec diagonales, de tailles 2-8, le nombre de faces vérifie la formule d'Euler (F = E − V + 1 + composantes).
- Vitest **coloration** : la bombe recolore toutes les pièces de même couleur et elles seules ; la pipette renvoie la bonne entrée de palette.
- Playwright : dessiner un Nine Patch avec l'outil Grille, passer à COLORATION, colorer 5 pièces au pinceau, ajouter au carnet : le carnet affiche « 1 sur 1 ». Une capture de comparaison.

## M4 — Tissus, couleurs et fils · effort **moyen**
*SPEC §5.5 (bloc), §5.8-5.10, §5.12-5.13, §7.1-7.7, §8.5-8.7 (tissus et fils)*

**Contenu**
- Le **générateur de tissus** (par code, avec une graine) : unis, rayures, pois, damiers, vichy, bruit, dégradés. Une **bibliothèque intégrée** d'environ 150 tissus, avec la couleur moyenne précalculée.
- Le **rendu des tissus** : une mosaïque à l'**échelle réelle** (pixels ÷ ppp), découpée à la forme de la pièce ; la **coupe ciblée** sur le plan Bloc (glisser, flèches 1/16, Ctrl 1/2).
- L'**import JPG et PNG** (lecture du ppp, 75 par défaut) ; le **plan Image, version 1** : importer, recadrer (à l'œil, aux nombres, préréglages), **échelle du tissu** (largeur entière + mesure d'une zone), redresser, pivoter, retourner, incliner, redimensionner, Ajouter comme tissu, Copier vers Tissus et vers Photos.
- Les couleurs : notre sélecteur (TSV, RVB, TSL, hexadécimal), Nuances & teintes, Tons, Dégradés (4-16, OKLab), tri manuel et automatique.
- Les **fils** : une bibliothèque générée ; les outils Fil du plan Bloc (pinceau, bombe ; couleur, style, épaisseur).
- La recherche de tissus et de fils **par couleur** ; **Mes favoris** (créer, coller, enregistrer, supprimer).

**Critères de réussite testables**
- Vitest **échelle** : une image de 300 × 150 px à 75 ppp mesure 4 × 2 po ; après « échelle du tissu » réglée à 6 po de large, la résolution effective est de 50 ppp.
- Vitest **générateur** : déterministe (même graine, même image et même empreinte) ; la couleur moyenne d'un damier noir et blanc 50/50 est (127,5 ± 1).
- Vitest **dégradés** : 8 pas entre deux couleurs donnent les deux couleurs exactes aux extrémités ; la luminosité OKLab est monotone.
- Vitest **redresser** : une ligne tracée à 3° donne une rotation de −3°.
- Playwright : importer un PNG de test (un damier de 1 po à 96 ppp), l'ajouter comme tissu, colorer une pièce de 2 po, puis échantillonner le canvas : on compte **2 cases** à travers la pièce.

## M5 — Quilts : dispositions, pose des blocs, coloration au quilt · effort **gros**
*SPEC §2 (Horizontal, Sur la pointe, Pointe variable, Bandes, One Patch, Custom Set), §4.1-4.5, §4.8-4.14, §5.2-5.7 (quilt), §5.15*

**Contenu**
- Le plan Quilt : les onglets NOUVEAU QUILT, DISPOSITION et DESIGN ; la taille finie du quilt en direct ; le **mètre ruban** ; les **règles** du quilt.
- Les dispositions **Horizontal** (lattis, *cornerstones*, bordure de lattis), **Sur la pointe** (2 styles), **Pointe variable**, **Bandes H et V** (les 11 styles, cloner, formules), **One Patch** (les formes de Q-2.6), **Custom Set** (redimensionnement avec ou sans conservation des blocs). Maximum de blocs : 24, jusqu'à 100.
- La **pose** : clic, Ctrl+clic, Alt+clic, glisser-déposer, remplacement ; la déformation des blocs dans les cellules en losange ou en parallélogramme.
- Les **trois calques** (avec l'œil), le masquage des contours, le bloc uni, la pipette de bloc.
- **Ajuster** : déplacer, redimensionner, pivoter, incliner, X/Y, grille d'accrochage, copier, coller, supprimer, effacer (et Ctrl), empiler, centrer, découper, sélection multiple, aligner, même taille. **Pivoter et retourner au clic**, **Symétrie** (16 états, le 17ᵉ revient au départ).
- La coloration au quilt : pinceau (5 styles, Ctrl et Alt), bombe, **échange** (et sa version par calque), pipettes tissu et couleur, coupe ciblée, **rotation du tissu** (simple, avancée, aligner sur un bord), **Aléatoire** (teinte, saturation, luminosité, aléatoire, correspondance avec tolérance).

**Critères de réussite testables**
- Vitest **tailles** :
  - Horizontal 4 × 5 blocs de 8 po avec un lattis de 1 po et une bordure de lattis : un centre de **37 × 46 po** ;
  - Sur la pointe 3 × 3 blocs de 10 avec un lattis de 1,5 : **48,790 po** (la capture p. 40) ;
  - Pointe variable 3 × 3 de 9 × 14 avec un lattis de 2 : **33,000 × 51,333 po** (la capture p. 41).
- Vitest **bandes** : les formules de la p. 47 (par exemple Damier : longueur 60, largeur 10, 3 en travers = 18 le long) ; le nombre de pièces de chaque style pour N = 4.
- Vitest **rotation avancée** : départ 10°, n = 8 donne la suite 55, 100, 145… ; n = 6 depuis 0 donne 60, 120, 180.
- Vitest **Symétrie** : 16 états distincts sur un bloc asymétrique, et le 17ᵉ égale l'état initial.
- Vitest **Aléatoire** : la teinte +40 répétée tourne en boucle (circulaire) ; la saturation −20 répétée sature à 0 ; la correspondance à tolérance 0 ne remplace que les couleurs identiques.
- Playwright : nouveau quilt Horizontal, Ctrl+clic avec un bloc, tous les emplacements remplis ; Alt+clic avec un autre bloc, un sur deux ; pinceau avec Ctrl, la pièce est colorée dans tous les blocs identiques. Une capture.

## M6 — Bordures · effort **moyen**
*SPEC §3, §4.2 (blocs dans les bordures)*

**Contenu**
- La liste ordonnée des bordures : ajouter, insérer, supprimer, cloner ; les tailles par côté avec verrouillage (Tous, G+D, H+B ; pas de 0,25) ; les côtés à 0.
- **Les 22 styles** (la géométrie de chacun, les coins, les compteurs de blocs, Q-3.2) ; les blocs posés et étirés dans les bordures (sauf Onglet) ; les bordures **alignées**.
- « Garder les bordures actuelles » (mémorisé, Q-3.3) ; le style par défaut des nouvelles bordures.
- Les **bordures auto** (une dizaine, faites maison) ; l'assistant « style par côté » (P3 si le temps le permet).

**Critères de réussite testables**
- Vitest **tailles** : un quilt de 37 × 46 avec des bordures de 1 + 2,5 + 4 po (Tous) donne 52 × 61 ; avec G+D = 3 et H+B = 1 seulement, 43 × 48.
- Vitest **géométrie** : pour chaque style, la somme des aires des pièces de la bordure égale l'aire de l'anneau, à 10⁻⁶ près ; le nombre de pièces est attendu pour 4 × 5 blocs ; les carreaux ont toujours 4 côtés.
- Vitest **aligné** : avec le même nombre de blocs, les arêtes des blocs « alignés à l'intérieur » tombent sur les arêtes de la bordure intérieure.
- Playwright : Ajouter, régler 3 po, changer le style en Losanges, poser un bloc dans la bordure : capture. Annuler revient à l'état précédent.

## M7 — Impression et PDF à l'échelle, export, métrage · effort **gros**
*SPEC §9 (tout), §10*

**Contenu**
- Le **moteur PDF** (le rendu de la liste d'affichage dans pdf-lib, avec les vraies courbes) ; la **mise en page** (A4 ou Lettre selon la région, orientation, marges) ; le **découpage en mosaïque** (recouvrement de 0,5 po, repères, étiquettes ligne-colonne, plan d'assemblage).
- L'**aperçu** dans l'application (zoom, deux pages), puis l'impression via le **dialogue Windows** en taille réelle, ou **Exporter en PDF**.
- Les styles : **Bloc** (4 styles et leurs options), **Gabarits** (marge de 0,25 po ou 0,75 cm, ligne de coupe continue, couture en tirets, droit-fil, lettres, bloc clé, miroir, aperçu modifiable avec pivot de 30°), **Fondation** (sections et numérotation automatiques selon Q-9.5, édition manuelle, 3 styles), **Découpe rotative** (les formes de Q-9.6, arrondi 1/8, 1/16 ou aucun, et au mm en métrique), **Quilt** et **Métrage** (l'algorithme de Q-9.9, laizes, coupons), **Polices** d'impression, « Utiliser la taille du quilt » pour les blocs déformés.
- L'**export** PNG, JPG (qualité 50), SVG (du bloc et du quilt) et PDF ; l'**export d'une sélection** (PNG, presse-papiers, impression).

**Critères de réussite testables**
- Vitest **échelle** (MISSION) : le gabarit d'un carré fini de 6 po sans marge mesure **432 × 432 pt** dans le PDF (on lit la boîte du tracé par analyse du flux) ; avec une marge de 0,25, la ligne de coupe mesure **468 × 468 pt** ; un carré de 10 cm mesure **283,46 pt** à 0,01 près.
- Vitest **marges** : le décalage d'un triangle rectangle isocèle de 2 po (côté fini) avec 0,25 de marge donne une boîte de coupe de 2,85355… po, soit **2 7/8** avec l'arrondi au 1/8 (formule de la p. 225).
- Vitest **découpe rotative** (les exemples p. 225-226) : carré A **2½** ; triangle demi-carré B **2⅞** ; triangle quart de carré C **3¼** ; le cas 7 × 5 sur 10 po donne **1 7/8 × 2½** à 1/8, et 1,929 × 2,5 sans arrondi (1,429 fini + 2 × 0,25) ; les comptes par couleur sont exacts sur Cross with a Cross.
- Vitest **métrage** (cas calculés à la main) : 20 carrés de 4 po finis (4,5 coupés) sur 42 po = 9 par rangée, 3 rangées, 13,5 po, soit **0,375 yd** (arrondi au 1/8 : 3/8 yd). D'autres cas couvrent les bordures raboutées, les coupons et le métrique (en cm).
- Vitest **mosaïque** : un gabarit de 20 × 20 po en Lettre portrait avec des marges de 0,5 tient sur 3 × 3 pages ; les pages vides ne sont pas émises.
- Playwright : Imprimer > Gabarits > Exporter en PDF, puis vérification du fichier (nombre de pages, présence des lettres A à n). Captures de l'aperçu des gabarits et du tableau de découpe.

## M8 — Applique, PolyDraw, blocs combinés, motifs, pochoirs et texte · effort **gros**
*SPEC §4.3, §4.15, §6.3-6.5, §8 (le reste de la bibliothèque de blocs)*

**Contenu**
- L'**Applique** (Bloc avec son calque de fond PolyDraw, et Motif) : Dessin (Ligne, Bézier avec Ctrl, Main levée lissée, Trait de pinceau, Bande), Ellipse, Pie, Arc avec sections, Rectangle et rectangle arrondi, **Formes** (notre jeu), StarMaker, PosieMaker, StencilMaker, **Couronne** ; la Sélection (rectangle de sélection, X/Y, %, rotation, miroirs, centrer, cloner, ordre) ; l'Édition des nœuds (4 types, couper, joindre, convertir) ; pièces fermées ou fils ; Convertir en motif.
- **PolyDraw** : les 6 grilles, PolyLigne et PolyArc, cloner et pivoter selon la grille, Édition.
- Les **blocs combinés** Easy + Applique et Poly + Applique ; l'**image de décalque** (positionnement, clarté, recadrage).
- Au quilt : les **motifs au calque 2** et les **pochoirs au calque 3** (avec les conversions automatiques) ; le **texte en applique** (polices système via opentype.js, Maj+glisser, gabarits du texte).
- L'impression des gabarits d'applique (patron d'applique, pièces superposées, fond supprimable dans l'aperçu).
- Le **reste de la bibliothèque de blocs** (Q-8.1, environ 40 au total), plus des motifs et des pochoirs maison.

**Critères de réussite testables**
- Vitest **applique** : une pièce fermée est détectée (un lacet de Béziers dont le dernier nœud rejoint le premier) ; une pièce ouverte est un fil ; une auto-intersection est détectée et l'impression du gabarit est refusée avec un message.
- Vitest **couronne** : 8 groupes à 50 % donnent 8 copies dont les centres sont sur un cercle et pivotés de 45° chacun, la couronne étant centrée dans le bloc.
- Vitest **PolyDraw** : la grille Cercle à 3 anneaux et 8 rayons donne les points attendus ; PolyLigne sur 4 points puis fermeture donne un carré d'aire attendue ; la rotation propre à la grille Étoile 8 branches vaut 45°.
- Vitest **texte** : « A » dans une police système donne au moins une pièce avec un trou (le contour intérieur est conservé) ; la taille « 2 po » donne une hauteur de capitale d'environ 2 po (± 15 %).
- Playwright : dessiner un cœur avec Formes dans un bloc d'applique, le colorer, le poser en motif au calque 2 d'un quilt, l'imprimer en gabarit (PDF, 1 page avec le contour et la marge). Une capture.

## M9 — Plan Image complet, photos, broderies, finitions, installateur · effort **gros**
*SPEC §2.11, §4.6-4.7, §7.8-7.9, §8 (recherche, import de projet), §9.9-9.10, §12.6, et les P1 restants*

**Contenu**
- Les **photos** dans le quilt (calques 1 et 2) ; le **Photo Patchwork** (ajustements, masque, moyenne des pixels, correspondance) ; les **broderies** (notre format et une dizaine de modèles, rendu brouillon ou 3D, outils Fil au calque 3).
- Le plan Image : les outils de couleur (équilibre, R/V/B, T/S/L, coloriser, accent, carte des teintes, mélangeur, gamme de couleurs), l'histogramme, luminosité et contraste ; la mise en page de photos ; l'impression d'une photo ou d'une broderie.
- Les bibliothèques : la recherche par fiche (casse et accents ignorés) et par catégorie, l'import depuis un projet, l'import d'images multiples, la bibliothèque de dispositions, les **quilts rapides** maison (une dizaine), l'écran d'accueil.
- Les finitions : la personnalisation de l'interface (ruban latéral, petites icônes), les **performances**, l'accessibilité clavier, l'aide intégrée, l'icône définitive ; l'**installateur final** (NSIS avec choix du dossier, associations `.qsp`, raccourcis) ; un **README** complet (utilisation, compilation, limites connues).

**Critères de réussite testables**
- Vitest **Photo Patchwork** : une image unie rouge donne des pièces toutes (255, 0, 0) ; une image moitié rouge moitié bleue sur 2 × 1 pièces donne une pièce de chaque couleur ; Inside, Outside et Distort Fit donnent les rectangles attendus.
- Vitest **image** : la carte des teintes qui décale le secteur 0-30° vers 210° change un pixel (255, 0, 0) en une teinte de 210 ± 2° ; l'égalisation en niveaux de gris donne un histogramme cumulé quasi linéaire (écart inférieur à 2 %).
- Vitest **recherche** : « etoile » trouve « Étoile de l'Ohio » ; la recherche ET sur 2 catégories est correcte.
- **Performance** (Playwright, avec des chronos) : un quilt de 20 × 20 blocs Ohio Star avec des tissus image se dessine en moins de 100 ms après un zoom ; un projet de 50 Mo s'ouvre en moins de 3 s.
- **Installateur** : l'installation NSIS silencieuse (`/S`) dans un dossier temporaire, le lancement, l'ouverture d'un `.qsp` par **double-clic** (association) puis la désinstallation se font sans erreur (script de test PowerShell).
- Le README couvre l'utilisation, la compilation (`npm ci`, `npm run dist`) et les limites connues.

---

## Après M9 — lots optionnels (P2 et P3 non couverts)
Baby Blocks, Blocs variables, pièces personnalisées du One Patch, Serendipity (7 générateurs), styles de bordure par côté, effets et filtres, symétries d'image, profondeur de couleur, exports TIF, BMP et EMF, liaison de bibliothèques, impression des fiches, astuce du jour. Chaque lot est un petit ou moyen jalon indépendant, priorisé avec vous le moment venu.

## Risques identifiés et parades
| Risque | Parade |
|---|---|
| Robustesse de la planarisation (quasi-tangences, nœuds presque confondus) | Fusion des sommets à 10⁻⁷ po ; un corpus de tests en régression ; des tests de propriété (Euler, aires). |
| Écart d'échelle à l'impression Windows | L'impression passe **toujours par le PDF** à l'échelle 100 %, avec une page de test « carré de 1 po / 2 cm » proposée à l'utilisateur. |
| Taille de l'exe (Electron ≈ 90 Mo) | Accepté ; installateur compressé ; aucun contenu lourd embarqué (tissus générés à la volée). |
| Le mode Electron de Playwright sous Windows | Validé dès M0 (test de fumée du portable). |
| Le contexte qui s'épuise sur les gros jalons | Des sous-commits internes, et `PROGRESS.md` mis à jour **au milieu** des jalons gros, pas seulement à la fin. |
