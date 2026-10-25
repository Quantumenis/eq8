# QUESTIONS — Étape 0

> **Réponses reçues le 2026-10-25** :
> - Nom : **Quilt Studio**.
> - **Toutes les recommandations (➜) sont adoptées**, y compris les non bloquantes ; elles font foi.
> - B-1 : pypdfium2 5.14.0 est installé dans `.venv` (SHA-256 vérifié : `149fd5c6…1a6a06`), la roue téléchargée est à la corbeille, et les pages 40-41, 46, 129-130, 218-220 et 224-225 sont rendues dans `refs\img\` (script `tools\render_pages.py`).
> - D-2 (les paquets npm) reste soumis à votre accord au jalon M0 (voir `PLAN.md`).

> Chaque question renvoie à une section de `SPEC.md` et donne **ma recommandation** (➜).
> Répondez par exemple « Q-2.1 : OK », « Q-2.1 : 0,125 », ou « tout OK sauf Q-6.1 et Q-9.2 ».
> Les questions marquées 🔴 bloquent les premiers jalons (projet, dessin de blocs, coloration, quilt, impression).
> Les autres peuvent attendre le jalon concerné.

---

## A. Nom du produit (à choisir)

Le nom ne doit rien rappeler d'« Electric Quilt ». Je n'ai fait aucune recherche de marque déposée ; je peux en faire une sur demande.

1. **Courtepointe Studio** : « courtepointe » est le mot québécois pour quilt. Il est clair, il sonne français et se décline bien (extension de fichier `.cpq`).
2. **Pièce à Pièce** : il évoque le patchwork et la construction progressive (`.pap`).
3. **Mosaïca** : court, international, avec une nuance « mosaïque de tissus » (`.msq`).

➜ Ma préférence : **Courtepointe Studio**.

---

## B. Outils et images du manuel

- **B-1 🔴 Rendre les pages du PDF en images.** Il n'existe ni `pdftoppm`, ni ImageMagick, ni Ghostscript, ni PyMuPDF sur la machine. `pdftotext` est celui de xpdf 4.06, dans `C:\Program Files\Git\ucrt64\bin\`, hors du PATH. Plusieurs questions ci-dessous dépendent d'illustrations. Trois options :
  - (a) vous m'envoyez des captures des pages listées en **B-2** ;
  - (b) j'installe **pypdfium2** avec `pip install --user pypdfium2` (une roue PyPI dont l'empreinte SHA-256 est publiée et que je vérifierai), puis je rends seulement les pages nécessaires dans `refs\img\` ;
  - (c) j'installe les binaires **poppler** pour Windows (`pdftoppm`), avec vérification de l'archive et suppression après installation.
  - ➜ **(b)**, car c'est le plus léger, que l'empreinte est vérifiable, et que cela se désinstalle en une commande. J'attends votre accord avant d'installer quoi que ce soit.
- **B-2 Pages à regarder** (seulement si B-1 est accepté, ou si vous préférez m'envoyer les captures) : p. 40-41 (styles Sur la pointe), **46** (styles de bandes), 49 et 53 (liste One Patch, glissières), **60-61 et 70** (styles de bordures), 98 (pinceaux), 105 (styles et épaisseurs de fil), **129-130** (grilles PolyDraw), 142-148 (Trait de pinceau, Bande, Formes, StarMaker, PosieMaker, StencilMaker), 164-170 (Serendipity), **218-220 et 224-225** (gabarits, fondation, tableau de découpe), 233 (métrage).

---

## C. Questions de comportement (par chapitre)

### Ch. 1 — Projets
- **Q-1.1** Le manuel annonce « 6 sections » du carnet mais en énumère sept : Quilts, Blocs, Tissus, Couleurs, Photos, Fils, Broderie. ➜ On garde les **7 sections** (avec Tissus et Couleurs séparés).

### Ch. 2 — Dispositions
- **Q-2.1** Quel pas quand on clique à côté d'un curseur de taille de bloc ou de lattis ? Les bordures avancent par 0,25 po. ➜ **0,25 po** (et 0,5 cm en métrique), partout.
- **Q-2.2** Quelles bornes pour les tailles (bloc, lattis, centre Custom Set) ? ➜ Bloc de 0,5 à 120 po, lattis de 0 à 24 po, centre Custom Set de 1 à 300 po. Ce sont des bornes de bon sens, que l'on peut élargir.
- **Q-2.3** Quelles valeurs par défaut d'un nouveau quilt Horizontal ? Les captures montrent 8 × 8 po et un lattis de 1 po, mais rien ne dit que ce soient les défauts. ➜ **4 × 5 blocs de 8 po, sans lattis, plus une bordure de 1 po.**
- **Q-2.4** 🔴 Sur la pointe et Pointe variable : à quoi ressemblent exactement les styles « triangles dans les coins » et « une couture » ? ➜ (a) quatre triangles de coin séparés ; (b) les coins sont prolongés par les triangles de côté, avec une couture à 45°. Cela demande une capture des p. 40-41.
- **Q-2.5** La géométrie des 11 styles de bandes (capture p. 46). ➜ Je la reconstitue d'après les noms et les formules de la p. 47, puis je vous montre un rendu à valider.
- **Q-2.6** La liste des formes de One Patch. ➜ Personnalisé, Carré, Rectangle, Losange, Triangle, Hexagone, Hexagone allongé, Pavé (*cobblestone*), Octogone + carré, Baby Blocks (losanges 60°), Personnalisé (glissières). À compléter avec une capture.
- **Q-2.7** Comment compte-t-on les unités d'un One Patch (par exemple pour des hexagones en quinconce) ? ➜ Le nombre de formes **entières ou partielles** visibles par ligne et par colonne, en coupant au bord du centre.
- **Q-2.8** Quelle différence entre « Personnalisé » et « Personnalisé (glissières) » ? ➜ Personnalisé : on déplace les **coins** librement. Glissières : les coins ne glissent que **le long des lignes guides H et V**.

### Ch. 3 — Bordures
- **Q-3.1** La géométrie précise des 22 styles (coins, répartition) : captures p. 60-61 et 70. ➜ Je la reconstitue et je vous la soumets.
- **Q-3.2** Pour quels styles un seul compteur de blocs est-il modifiable ? ➜ Blocs de coin : aucun compteur. Losanges et pointes : les deux. Carreaux : les deux, mais liés pour garder des carreaux carrés.
- **Q-3.3** « Garder les bordures actuelles » : EQ8 l'oublie à la fermeture. ➜ On le **mémorise dans les préférences** ; c'est plus pratique et sans risque.

### Ch. 4 — Concevoir le quilt
- **Q-4.1** Peut-on poser des blocs au calque 1 d'un One Patch ou d'un Photo Patchwork ? ➜ **Non** : ces dispositions se colorent seulement, pièce par pièce.
- **Q-4.2** Les broderies : EQ8 fournit des images de broderie et importe des fichiers .EXP. ➜ **Notre format** (tracés de points vectoriels), une dizaine de broderies générées par code (fleur, étoile, cœur, monogramme…), et **pas d'import .EXP** (P3, plus tard si vous le souhaitez).
- **Q-4.3** Quels pas de grille d'accrochage du quilt, et quels défauts ? ➜ Pas : 1/16, 1/8, 1/4, 1/2, 1 et 2 po (1, 2, 5, 10, 20, 50 mm). Défaut : **1/4 po**, accrochage de la position et de la taille actif.
- **Q-4.4** Les trois origines possibles des règles du quilt ? ➜ Le coin haut-gauche du quilt, le coin haut-gauche du centre (défaut), et le centre du quilt.
- **Q-4.5** Les 16 combinaisons de l'outil Symétrie. ➜ Les 8 transformations du carré, appliquées soit **à tous les blocs**, soit selon un **damier** (parité ligne + colonne). Les 16 sont ordonnées pour que les premiers clics montrent les effets les plus visibles.
- **Q-4.6** La mise en forme du texte en applique. ➜ Gras, italique, alignement gauche, centre ou droite, interligne.
- **Q-4.7** La « taille par défaut » d'un bloc glissé sur un Custom Set. ➜ **6 po** (15 cm), réglable dans les options.

### Ch. 5 — Tissus et couleurs
- **Q-5.1** Les pas de décalage de la coupe ciblée (flèches et Ctrl+flèches). ➜ 1/16 po, et 1/2 po avec Ctrl.
- **Q-5.2** Les styles et épaisseurs de fil. ➜ Styles : continu, tirets, pointillés, point-tiret. Épaisseurs : 1 à 5, du fin à l'épais.
- **Q-5.3** Les options du tri automatique des couleurs. ➜ Trier par teinte, luminosité ou saturation, croissant ou décroissant, avec les gris regroupés à part.
- **Q-5.4** Le nombre initial de couleurs dans les gammes Nuances, Tons et Dégradés, et la formule de mélange. ➜ **8 couleurs** au départ. Mélange en espace **OKLab** (plus régulier à l'œil que le RVB) ; je peux mettre du RVB linéaire si vous préférez.
- **Q-5.5** L'unité des décalages de teinte (±40), saturation (±20) et luminosité (±20) de l'outil Aléatoire. ➜ Une échelle **0-240** comme le sélecteur Windows : ±40 vaut donc ±60°.
- **Q-5.6** La métrique de la tolérance 0-500 en correspondance. ➜ La **distance RVB euclidienne** (max ≈ 441), simple et proche de l'échelle de 500 ; je peux mettre ΔE2000 × 5 si vous préférez.

### Ch. 6 — Dessin de blocs (le cœur)
- **Q-6.1** 🔴 Le nettoyage des segments EasyDraw. ➜ On retire itérativement les arêtes de degré 1, puis on garde la composante connexe du contour. Un îlot fermé qui ne touche le reste que par un sommet est **gardé** (il forme des pièces valides). On affiche un **avertissement** listant les segments supprimés au lieu de les faire disparaître en silence.
- **Q-6.2** La définition exacte de « Décaler » (*Stagger*) pour N parts. ➜ Des nœuds à (i − ½)/N pour i = 1…N, avec une demi-part à chaque extrémité.
- **Q-6.3** 🔴 L'arc EasyDraw est-il un arc de cercle ou une courbe de Bézier ? ➜ Un **arc de cercle** (créé en demi-cercle, puis sa flèche se règle) : c'est fidèle au « hot spot » et c'est exact pour les gabarits. Une Bézier quadratique serait plus simple ; dites-moi si vous préférez.
- **Q-6.4** La géométrie des grilles PolyDraw (capture p. 129-130). ➜ Je la reconstitue d'après les descriptions, puis je vous la soumets.
- **Q-6.5** Les contours et extrémités du Trait de pinceau, et les styles de la Bande. ➜ Nos propres listes : profils uniforme, effilé au début, effilé à la fin, effilé aux deux bouts, renflé ; extrémités ronde, carrée, pointue ; bandes en oies volantes ou en losanges.
- **Q-6.6** La liste des Formes. ➜ Notre jeu : cercle, ovale, cœur, goutte, 3 feuilles, pétale, croissant, triangle équilatéral, triangle rectangle, losange, hexagone, octogone, étoile à 5 branches.
- **Q-6.7** Les paramètres de StarMaker, PosieMaker et StencilMaker. ➜ StarMaker : branches (3-24), rayon intérieur (%), rotation, branches pleines ou en losange. PosieMaker : pétales (3-24), forme, longueur, largeur, cœur. StencilMaker : pétales, forme, taille du cœur, boucle au bout.
- **Q-6.8** Inclinaison (*Tilt Block*) : quelle taille donner au bloc intérieur ? ➜ Le plus grand carré tourné qui tient dans le bloc. Les quatre triangles de coin deviennent des pièces de fond.
- **Q-6.9** Fusion : quelles exigences pour le bloc de fond ? ➜ Avoir au moins une pièce **quadrilatère convexe**. Le bloc intérieur y est déformé de façon **bilinéaire**.
- **Q-6.10** Les « drapeaux » de Couper & retourner et Réduire & retourner. ➜ 8 préréglages (miroirs en moulinet, en kaléidoscope, en rotation…) plus le dé, qui tire une combinaison au hasard parmi les 8⁴.
- **Q-6.11** Étoile fantaisie : **5-10 branches** (p. 170) ou **5-8** (p. 254) ? Et quelle géométrie ? ➜ **5-10**. Les branches sont des losanges sur lesquels le bloc est déformé.

### Ch. 7 — Images
- **Q-7.1** Quel ppp par défaut pour un tissu importé sans métadonnées ? ➜ **75 ppp** (la recommandation du manuel pour les scans de tissu), et le dialogue d'import affiche la taille réelle déduite.
- **Q-7.2** Échelle du tissu : que mesure la valeur saisie ? ➜ La **largeur de l'image entière**. On ajoute un mode « mesurer une zone » : on trace un segment sur l'image, puis on saisit sa longueur réelle.
- **Q-7.3** L'inclinaison −45 à 45 est-elle en degrés ? ➜ Oui.
- **Q-7.4** Les préréglages de recadrage. ➜ 2 × 2, 3 × 3, 4 × 4, 5 × 5, 6 × 6, 4 × 6 et 5 × 7 po (plus leurs équivalents en cm).
- **Q-7.5 / Q-7.6** Les plages des réglages de couleur et d'histogramme non décrits. ➜ Je fixe des plages usuelles (−100 à 100), que vous validerez à l'usage. P2, non bloquant.
- **Q-7.7** Les formes de pétales et les styles de symétrie carrée. ➜ Nos propres jeux, P3.

### Ch. 8 — Bibliothèques
- **Q-8.1** 🔴 Notre bibliothèque de blocs (domaine public) et ses catégories. ➜ Environ **40 blocs** : Four Patch, Nine Patch, Rail Fence, Log Cabin, Courthouse Steps, Flying Geese, Half-Square Triangles, Pinwheel, Broken Dishes, Friendship Star, Ohio Star, Variable Star, Sawtooth Star, LeMoyne Star, Churn Dash, Shoo Fly, Bear's Paw, Card Trick, Monkey Wrench, Hourglass, Bow Tie, Puss in the Corner, Jacob's Ladder, Weathervane, Dutchman's Puzzle, Snowball, Square in a Square, Economy Block, Drunkard's Path, Orange Peel, Dresden Plate, Grandmother's Flower Garden, Tumbling Blocks, Basket, Maple Leaf, Tree, House, Heart (applique), Tulip (applique), Mariner's Compass (P2). Catégories : 01 Classiques en pièces, 02 Étoiles, 03 Courbes, 04 Applique, 05 Motifs, 06 Pochoirs.
- **Q-8.2** La recherche par fiche ignore-t-elle la casse et les accents ? ➜ **Oui pour les deux**, pour un public francophone.
- **Q-8.3** Les champs d'une fiche de bloc. ➜ Nom, Référence, Notes, plus au verso : catégories, difficulté, technique (pièces, applique, fondation).

### Ch. 9 — Impression
- **Q-9.1** La mosaïque multipage. ➜ Un recouvrement de 0,5 po, des repères de coupe et d'alignement, et une étiquette « ligne-colonne » sur chaque page, plus une page de plan d'assemblage.
- **Q-9.2** 🔴 La marge de couture par défaut. ➜ **0,25 po en pouces, 0,75 cm en métrique.**
- **Q-9.3** 🔴 Le style des traits d'un gabarit. ➜ La ligne de **coupe** en trait continu, la ligne de **couture** en tirets, une flèche de **droit-fil** (P1), la lettre de pièce, le nombre à couper et le nom du bloc.
- **Q-9.4** 🔴 Quand deux pièces partagent-elles une lettre ? ➜ Même forme à une rotation près (miroir = lettre distincte, marquée « inversée »). Les comptes sont ensuite détaillés **par tissu ou couleur**.
- **Q-9.5** Le sectionnement automatique des fondations. ➜ Une découpe récursive par lignes traversantes, puis une numérotation par ajouts successifs. Si aucune découpe n'est possible, le bloc passe en mode manuel avec un message.
- **Q-9.6** Les formes reconnues par le tableau de découpe rotative. ➜ Carré, rectangle, triangle demi-carré, triangle quart de carré, parallélogramme à 45°, losange à 45° et 60°, triangle équilatéral, trapèze isocèle à 45°. Les autres sont renvoyées aux gabarits.
- **Q-9.7** La liste des laizes. ➜ 36, 40, 42, 44, 45, 54, 60, 90, 108 po, et 90, 110, 112, 140, 150, 240, 280 cm. Défaut : **42 po** (110 cm).
- **Q-9.8** La taille d'un coupon (*fat quarter*). ➜ 18 × 21 po (45 × 55 cm), réglable.
- **Q-9.9** 🔴 L'algorithme de métrage. ➜ Un rangement par étagères, trié par hauteur décroissante, avec une rotation de 90° autorisée si elle réduit la hauteur de la rangée ; les bordures longues sont raboutées par longueurs de laize ; le total est arrondi au **1/8 yd** supérieur (10 cm en métrique). Le résultat s'affiche en yards **et** en mètres.
- **Q-9.10** Les polices d'impression (Arial dans EQ8). ➜ Arial ou Segoe UI (présentes sous Windows), intégrées au PDF par sous-ensemble.
- **Q-9.11** Le format de papier par défaut. ➜ Celui des paramètres régionaux de Windows (A4 en France).

### Ch. 10 à 13 — Export, raccourcis, interface
- **Q-10.1** L'unité et les résolutions de l'export d'image. ➜ La taille en po ou cm, avec un affichage en pixels ; des résolutions de 72, 96, 150, 200, 300 et 600 ppp ; **150 ppp par défaut**.
- **Q-11.1** Le raccourci Rétablir (absent du manuel). ➜ **Ctrl+Y** et **Ctrl+Maj+Z**.
- **Q-12.1** L'ordre des boutons de la barre principale. ➜ Notre propre ordre : fichier, carnet, annuler et rétablir, zoom, mètre, contours, bibliothèque, options.
- **Q-13.1** L'intervalle de sauvegarde automatique. ➜ **2 minutes**, plus une restauration proposée au démarrage après un plantage.
- **Q-13.2** Les défauts des préférences d'affichage. ➜ Ruban en haut, icônes normales, astuces visibles.
- **Q-13.3** Le lissage par défaut de la main levée. ➜ Au milieu du curseur, avec un ajustement Bézier à tolérance de 0,02 po.

---

## D. Choix techniques à confirmer (hors manuel)

- **D-1** La pile recommandée par la MISSION (Electron + TypeScript + React, electron-builder, Vitest, Playwright, pdf-lib, polygon-clipping ou clipper2). ➜ **Gardée** telle quelle. Pour le dessin, je propose un **moteur de scène maison sur Canvas 2D** (avec la logique géométrique en TypeScript pur, testable sans DOM) plutôt que Konva ou Paper.js. Je justifierai ce choix dans le plan des jalons.
- **D-2** Les installations nécessaires plus tard (npm : electron, electron-builder, react, vite, vitest, playwright, pdf-lib, clipper2-js ou polygon-clipping, opentype.js pour les polices). Je demanderai votre accord **une fois** pour la liste complète au jalon M0, sauf si vous préférez valider paquet par paquet.
