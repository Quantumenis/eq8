# SPEC — Quilt Studio (réimplémentation clean-room d'un logiciel de conception de quilts)

> **Statut : validé le 2026-10-25.**
> - Nom du produit : **Quilt Studio**.
> - **Toutes les recommandations de `QUESTIONS.md` sont adoptées** : pour chaque point « À VÉRIFIER » ci-dessous, la recommandation (➜) de la question correspondante **fait foi**.
> - Les illustrations des p. 40-41, 46, 129-130, 218-220 et 224-225 ont été consultées (rendues dans `refs\img\`). Leurs apports sont marqués « (illustration) ».

> Source : *EQ8 Reference Manual* (256 p.) et *Quick Start Guide* (48 p.), dans `refs\`.
> Les extractions texte sont dans `refs\text\` (un fichier par chapitre, page PDF = page imprimée).
> Ce document **décrit des comportements**, reformulés. Il ne copie aucun passage du manuel.
> Les termes d'origine sont donnés entre parenthèses (*en italique*) pour la traçabilité, et
> « p. N » renvoie à la page du manuel de référence.
> **À VÉRIFIER** = le manuel ne tranche pas ; la question correspondante est dans `QUESTIONS.md`.
> Priorités : **P0** indispensable · **P1** important · **P2** confort · **P3** bonus.

---

## 0. Généralités et espace de travail

### 0.1 Glossaire
| Terme FR (app) | Terme EQ8 | Sens |
|---|---|---|
| Projet | *Project* (.PJ8) | Fichier unique qui contient tout : quilts, blocs, tissus, couleurs, photos, fils, broderies. |
| Carnet du projet | *Project Sketchbook* | Le contenu du projet, rangé par section. |
| Plan de travail | *Worktable* | Les trois modes : Quilt, Bloc, Image. |
| Pièce | *Patch* | Une zone fermée d'un bloc, qu'on colore et qu'on coud. |
| Lattis | *Sashing* | Les bandes entre les blocs. |
| Sur la pointe | *On-point* | Les blocs tournés à 45°. |
| Coloration | *Coloring* | Une manière de colorer un même dessin de bloc. |
| Fiche | *Notecard* | Le nom et les notes d'un élément. |
| Métrage | *Yardage* | La quantité de tissu nécessaire. |
| Motif (applique) | *Motif* | Une forme d'applique isolée, à placer sur le quilt. |
| Pochoir | *Stencil* | Un dessin de matelassage (surpiqûre), sans pièces colorées. |

### 0.2 Écran d'accueil (*Home Screen*) — p. 6 — P2
- C'est la page d'ouverture, avec trois groupes d'actions :
  - **Quilts** : nouveau quilt vierge, partir d'un « quilt rapide » (*Quick Quilt*, projet préfabriqué à thème), ouvrir un projet existant.
  - **Blocs** : nouveau bloc vierge, chercher dans la bibliothèque de blocs.
  - **Tissus** : importer et retoucher une image de tissu, chercher dans la bibliothèque de tissus.
- Elle affiche aussi une « astuce du jour » (*Tip of the Day*) et une navigation latérale (aide, infos produit).
- Un bouton en haut à gauche ramène toujours à l'accueil. L'accueil peut être désactivé (p. 21 : on accède alors aux quilts rapides par Fichier > Ouvrir un quilt rapide).
- Note : « nouveau quilt » et « nouveau bloc » ne créent **pas** de projet ; ils posent seulement un élément vierge sur le plan de travail.

### 0.3 Les trois plans de travail — p. 7 — P0
On bascule de l'un à l'autre à tout moment avec des boutons, toujours placés en haut à droite.
- **Quilt** : dispositions (traditionnelle, moderne, personnalisée, bandes, one-patch, *baby blocks*…), bordures (22 styles), placement des blocs, tissus et fils, visualisation du matelassage, étiquettes de quilt.
- **Bloc** : blocs pièces (*pieced*), applique, combinés ; blocs « sans dessin » (générés) ; décalque d'une photo.
- **Image** : importer, recadrer, redimensionner et coloriser des photos ; importer des scans de tissus, les redresser, recadrer et mettre à l'échelle.
- Code couleur dans le manuel : Quilt en bleu, Bloc en jaune. Notre application garde un code couleur par plan de travail.

### 0.4 Bouton « Ouvrir la bibliothèque » (*Open Library*) — p. 7 — P1
Il ouvre directement la bibliothèque qui correspond à la palette affichée (par exemple la palette Tissus & Couleurs ouvre la bibliothèque de tissus).

### 0.5 Anatomie de la fenêtre — p. 8-9 — P0
De haut en bas et de gauche à droite :
- **Titre** : nom du projet (« Sans titre » tant que le projet n'est pas nommé).
- **Menu principal**, **bouton Accueil**, **onglets des plans de travail**.
- **Ruban** (*Ribbon*) : des onglets d'options propres au plan de travail (par exemple NOUVEAU QUILT, DISPOSITION, BORDURES, DESIGN côté quilt ; NOUVEAU BLOC, DESSIN, COLORATION côté bloc).
- **Barre d'outils principale** (*Main Toolbar*).
- **Palette** à gauche, avec ses onglets (*Palette Tabs*), sa boîte à outils (outils et sous-outils), son visualiseur et sa barre de défilement, un **aperçu de tissu** (*Fabric Preview*), une **liste des éléments récemment utilisés** (*Most Recently Used*) et des options de palette.
- **Zone de travail** (*Worktable*) avec ses barres de défilement et ses onglets de calques (*Layer Tabs*), plus un bouton pour afficher ou masquer les calques.
- **Barre de précision** (*Precision Bar*, plan Bloc uniquement) et **barre d'état** (*Status Bar*).
- **Options d'affichage** (*Display Options*) et **options du visualiseur** (*Viewer Options*).

### 0.6 Unités — p. 10 — P0
- Pouces ou centimètres, réglés dans Préférences > Espace de travail > Mesure. Les **pouces** sont l'unité par défaut.
- Le choix est mémorisé jusqu'à ce qu'on le change.

### 0.7 Restaurer les réglages par défaut — p. 10 — P2
- Préférences > Espace de travail > Restaurer. Une case optionnelle restaure aussi les blocs, tissus, couleurs et fils par défaut de la palette.
- EQ8 doit redémarrer pour appliquer le changement. Chez nous, l'application se recharge simplement, sans redémarrage forcé.

### 0.8 Projet par défaut personnalisé — p. 11 — P2
- « Enregistrer la palette comme défaut » (*Save Palette as Default*) : le contenu courant du carnet (blocs, motifs, pochoirs, tissus, couleurs, fils), **dans son ordre de tri**, devient le contenu initial de tout nouveau projet.
- Le carnet propose « Effacer tous les blocs inutilisés » (*Clear all unused…*) section par section.

### 0.9 Aide — p. 12 — P3
Le menu Aide d'EQ8 renvoie vers des ressources en ligne propres à l'éditeur (articles, vidéos, leçons, guide, manuel, contact). Chez nous, il ouvre l'aide locale (README / guide intégré) et un « À propos ».
**Hors périmètre** : activation et licence (2 postes actifs), téléchargement et installation en ligne.

---

## 1. Projets et carnet du projet (*Project Sketchbook*) — ch. 1, p. 13-34

### 1.1 Notion de projet — p. 14 — P0
- Rien n'est conservé tant qu'aucun projet n'existe. Un projet peut contenir beaucoup d'éléments.
- Dossier par défaut d'EQ8 : `Documents\My EQ8\Projects`. Chez nous : `Documents\<NomApp>\Projets`.
- **Notre format** : JSON versionné plus des images (MISSION, règle 5). Les formats .PJ8/.PJ7/.PJ6 ne sont **pas** lus.

### 1.2 Le carnet du projet — p. 14 — P0
- **Six sections** : Quilts ; Blocs (avec trois onglets : Blocs, Motifs, Pochoirs) ; Tissus ; Couleurs ; Photos ; Fils (*Thread*) ; Broderie (*Embroidery*). Le manuel annonce « 6 sections » mais en énumère sept : **À VÉRIFIER** (Q-1.1).
- Dans un nouveau projet, les sections Blocs, Tissus, Couleurs et Fils sont pré-remplies avec le contenu par défaut.
- Le bouton **Ajouter au carnet** (*Add to Project Sketchbook*) copie l'**état courant** de l'élément du plan de travail dans la bonne section. On peut ajouter de nombreuses variantes en cours de travail.
- La fenêtre du carnet est **redimensionnable** (en tirant sur ses bords).
- Chaque section a un **menu d'options** (bouton « ⋯ » en haut à droite), qui offre toujours au moins :
  - **Trier** (voir 1.12) ;
  - **Couleur du cadre** autour de l'élément sélectionné ;
  - **Affichage** : taille des vignettes, de « minuscule » à « grande ».
  Les autres options varient selon la section (Blocs et Couleurs en ont le plus).
- Des **boutons d'affichage** sous la barre de défilement règlent le nombre de vignettes visibles (grandes vignettes = moins d'éléments).

### 1.3 Nouveau projet — p. 15 — P0
- Bouton Nouveau projet ou Fichier > Nouveau projet ouvre l'**Assistant projet** (*Project Helper*), une boîte à onglets : *Créer un projet* · *Ouvrir un projet existant* · *Partir d'un quilt rapide*.
- On saisit le nom, puis OK : le fichier est créé immédiatement dans le dossier par défaut, et le titre de la fenêtre affiche le nom.
- Tant qu'aucun projet n'est créé, le premier « Ajouter au carnet » affiche un avertissement puis la boîte « Enregistrer sous ».

### 1.4 Enregistrer — p. 16 — P0
- Dans EQ8, **chaque « Ajouter au carnet » enregistre le fichier du projet** : il n'y a pas d'enregistrement manuel séparé.
- Ajouter un élément déjà présent affiche simplement « déjà présent », sans doublon et sans erreur.
- À la fermeture d'un projet sans titre, l'application demande « Enregistrer les modifications ? ».
- La MISSION ajoute en plus : la **sauvegarde automatique** et un « annuler/rétablir illimité ». Notre comportement : on garde la sémantique « ajouter au carnet = enregistrer », et on ajoute une sauvegarde automatique de l'état du plan de travail (brouillon récupérable).

### 1.5 Ouvrir — p. 17 — P0
- L'assistant projet propose deux listes : **projets récents** et **projets existants** (ceux du dossier par défaut), avec un aperçu (le premier quilt du projet, ou « Aucun quilt à afficher »).
- Un lien ouvre un projet qui n'est pas listé (boîte de dialogue du système).
- À l'ouverture, le carnet du projet s'affiche ; on choisit un élément puis Modifier (*Edit*) pour le poser sur le plan de travail.
- Raccourci : **Ctrl+O**.
- L'import des anciens formats (EQ6/EQ7, BlockBase) est **hors périmètre**.

### 1.6 Enregistrer sous — p. 18 — P0
Fichier > Enregistrer sous : copie le projet vers un autre emplacement et continue le travail sur la copie.

### 1.7 Renommer, chercher, supprimer un projet — p. 18-20 — P2
- Dans EQ8, ces actions passent par la boîte d'ouverture (clic droit > Renommer / Supprimer).
- Notre comportement : actions explicites dans l'assistant projet. Renommer garde l'extension ; supprimer envoie à la **corbeille** Windows.
- Un projet supprimé ou renommé peut rester dans la liste des récents : on le retire automatiquement s'il n'existe plus.
- La recherche de fichiers sur le disque se fait avec l'explorateur Windows : pas de fonction dédiée (P3).

### 1.8 Quilts rapides (*Quick Quilt*) — p. 21 — P2
- EQ8 fournit plus de 70 projets préfabriqués, que l'on parcourt avec un aperçu et des flèches pour voir chaque quilt.
- Ouvrir un quilt rapide crée un projet « Sans titre » contenant tous ses blocs et tissus.
- Chez nous, nous créons **nos propres** quilts rapides (une dizaine), à partir de nos blocs du domaine public.

### 1.9 Envoyer un projet par e-mail, copier vers un autre PC — p. 22-26 — P3
- Cela relève de l'explorateur et du client mail. Pas de fonction dédiée.
- Ce qui compte pour nous : un projet doit être **autonome**, c'est-à-dire embarquer ses images (tissus importés, photos) pour être transportable.
- Les « favoris utilisateur » (*User Favorites*) sont un dossier séparé du projet (voir ch. 8).

### 1.10 Compresser un projet — p. 23-24 — P2
- Fichier > Compresser la taille du projet, avec deux options :
  - **Supprimer blocs, tissus, broderies, images et fils inutilisés** : est « utilisé » ce qui apparaît dans au moins un quilt du carnet.
  - **Supprimer seulement les tissus inutilisés** : est « utilisé » ce qui apparaît dans un quilt **ou** un bloc du carnet.
- L'opération écrase le fichier et ne peut pas être annulée. Le manuel recommande d'abord Fichier > **Créer une copie du projet** (*Create Copy Project*), qui enregistre une copie sans quitter le projet courant (P1).
- Une coloration inutilisée n'est pas supprimée si une autre coloration du même bloc est utilisée.
- Le bouton « Effacer » de la section Tissus, avec « seulement les tissus inutilisés », donne le même résultat que la seconde option.

### 1.11 Modifier depuis le carnet — p. 27-31 — P0
- Sélectionner un élément puis **Modifier** (ou double-clic) le pose sur le bon plan de travail :
  - un quilt va sur le plan Quilt ;
  - un bloc, motif ou pochoir va sur l'onglet DESSIN du plan Bloc, **avec les outils qui ont servi à le créer** (par exemple la palette EasyDraw) ;
  - une photo peut aller sur les trois plans : Image ; Bloc (pour décalquer, onglet NOUVEAU BLOC) ; Quilt (seulement si un quilt « Photo Patchwork » est déjà sur le plan). Le double-clic l'envoie sur le plan **courant**.
- Ré-ajouter un élément modifié crée un **nouvel** élément à la fin de la section ; l'original reste dans le carnet.
- **Colorations empilées** : une nouvelle coloration d'un bloc s'empile sur le bloc d'origine. Des flèches font défiler la pile, et « Choisir une coloration » liste les colorations. La « coloration 0 » est le dessin au trait. Une pile compte au plus 2 colorations par défaut ; la règle est détaillée en 5.11.
- Un quilt « Photo Patchwork » ajouté au carnet devient un quilt one-patch ordinaire : il perd le lien avec la photo.
- Une image de tissu importée sur le plan Image et ajoutée au carnet va dans la section **Photos**. Le bouton **Copier vers Tissus** en fait aussi un tissu ; le bouton **Ajouter comme tissu** l'envoie directement dans Tissus.
- Décalque en plusieurs séances : on enregistre l'image (option « Image de décalque » active) **et** le dessin en cours (option « Outils de dessin » active).

### 1.12 Trier — p. 31-32 — P1
- Bouton Trier : une fenêtre affiche les éléments ; on **clique dans l'ordre voulu** et chaque élément cliqué disparaît de la fenêtre. « Recommencer » remet tout à zéro ; « Fermer » place les éléments restants, dans leur ordre actuel, après ceux déjà triés.
- Le tri est aussi disponible dans la bibliothèque (Mes favoris, Carnet courant) et dans les palettes du plan de travail (Blocs, Tissus & Couleurs, Photos).
- **Glisser-déposer** dans les palettes : l'élément traîné apparaît en transparence et se dépose **avant** l'élément visé.

### 1.13 Supprimer du carnet — p. 33 — P0
- On sélectionne un élément, puis Supprimer, puis on confirme.
- Pour les blocs, on peut supprimer **une seule coloration**, ou le bloc entier en se plaçant sur la coloration 0.
- On **ne peut pas supprimer** un bloc ou une coloration utilisés dans un quilt : un avertissement s'affiche.
- Supprimer un tissu utilisé déclenche un avertissement. Si l'on confirme, le tissu est **remplacé par une couleur unie** dans les blocs et quilts concernés.
- L'onglet « Carnet courant » des bibliothèques permet la **suppression multiple**.
- Ordre de nettoyage conseillé : quilts, puis blocs, puis colorations inutilisées, puis tissus (les dépendances se libèrent dans cet ordre).

### 1.14 Fiches (*Notecards*) — p. 34 — P1
- Chaque section a une fiche en bas à gauche, avec les champs **Nom** et **Notes** ; la touche Tab passe d'un champ à l'autre. Le contenu par défaut a déjà ses fiches.
- Le **Nom** s'imprime en en-tête des impressions ; un élément sans nom apparaît « Sans titre ».
- La fiche est déplaçable et « épinglable » (elle reste ouverte en naviguant ; l'épingle se réinitialise quand on change de section). Pour les blocs, motifs et pochoirs, un bouton **Retourner** affiche le verso : informations de classement et catégories (voir p. 202, ch. 8).
- On cherche par le contenu des fiches dans les bibliothèques (voir p. 201).
- EQ8 n'imprime pas les notes ; il faut les copier à la main. Chez nous, nous proposons « Imprimer la fiche » (P3).

---

## 2. Dispositions de quilts (*Quilt Layouts*) — ch. 2, p. 35-58

### 2.1 Principes de taille — p. 36-37 — P0
- **Toutes les tailles saisies sont des tailles finies**, sans marge de couture : blocs, lattis, bordures. La marge de couture ne s'ajoute **qu'à l'impression**, et elle est réglable (exemple : bloc de 8 po + marge de ¼ po = 8 ½ po non fini).
- La **taille finie du quilt** (bordures comprises) s'affiche en permanence **en bas à droite**, et se met à jour en direct. La taille du **centre** (sans bordures) s'affiche en haut de la palette DISPOSITION.
- À l'impression, l'option **« Utiliser la taille du quilt »** (*Use size from quilt*) imprime chaque bloc ou pièce à sa taille dans le quilt. C'est la **seule** façon d'imprimer correctement des blocs non carrés, déformés par la disposition (Variable Point, Baby Blocks). Voir ch. 9.
- **Mètre ruban** (*Tape Measure*), dans la barre d'outils verticale de gauche : on tire une ligne sur le quilt et la longueur s'affiche ; c'est une mesure approximative (P1).
- Un quilt a **trois calques** (voir ch. 4).

### 2.2 Choisir une disposition — p. 38 — P0
On passe par le plan Quilt > onglet NOUVEAU QUILT, puis l'un des **dix styles** :

| Style | Description | Prio |
|---|---|---|
| A. **Horizontal** | Une grille de lignes et de colonnes. Blocs carrés ou rectangulaires, lattis optionnel, blocs de coin du lattis (*cornerstones*), bordure de lattis optionnelle. | P0 |
| B. **Sur la pointe** (*On-Point*) | Les blocs tournés à 45°, lattis optionnel. | P0 |
| C. **Pointe variable** (*Variable Point*) | Des losanges sur la pointe, mesurés à travers le bloc, lattis optionnel. | P1 |
| D. **Baby Blocks** | Un pavage de cubes 3D faits de losanges aux côtés égaux. | P2 |
| E. **Blocs variables** (*Variable Blocks*) | Comme Baby Blocks, mais le dessus et les côtés peuvent être inégaux. | P2 |
| F. **Bandes horizontales** | De longues bandes horizontales, pièces ou unies. | P1 |
| G. **Bandes verticales** | La même chose, en vertical. | P1 |
| H. **One Patch** | Une seule forme de pièce répétée sur tout le quilt. | P1 |
| I. **Photo Patchwork** | Un One Patch rempli de couleurs unies tirées d'une photo. | P2 |
| J. **Ensemble personnalisé** (*Custom Set*) | Un grand centre vide où l'on pose des blocs de toutes tailles, n'importe où, éventuellement superposés. | P0 |

**Contrôles communs** à toutes les dispositions :
- Les **compteurs** (nombre de blocs) ont des flèches et acceptent la saisie au double-clic.
- Les **tailles** se règlent de trois façons : saisie dans la case, curseur glissant, ou clic à côté du curseur, qui fait sauter la valeur d'un **incrément** (0,25 po pour les bordures, p. 64 ; l'incrément des dispositions est **À VÉRIFIER**, Q-2.1).
- La touche **Tab** passe d'un champ à l'autre et permet de taper aussitôt.
- Nombre maximal de blocs horizontalement et verticalement : **24 par défaut**, réglable **jusqu'à 100** dans les options du plan Quilt (Options de disposition > Tous les styles > « Nombre maximal de blocs… », qui a deux cases dont la seconde est le maximum). Les **plages** de chaque taille sont **À VÉRIFIER** (Q-2.2).
- Après la disposition, on passe à l'onglet BORDURES (ch. 3), puis à DESIGN (ch. 4).

### 2.3 Horizontal — p. 39 — P0
- **NOMBRE DE BLOCS** : horizontal × vertical.
- **TAILLE FINIE DES BLOCS** : largeur et hauteur, plus la case « Garder largeur et hauteur égales » (blocs carrés).
- **TAILLE FINIE DU LATTIS** : largeur et hauteur, plus la case « égales », qui garde les *cornerstones* carrés. Une valeur de **0** supprime le lattis. La case **« Inclure une bordure de lattis »** ajoute le lattis aussi autour de l'ensemble des blocs.
- Mesures : largeur et hauteur sont les côtés du bloc. La **largeur du lattis s'ajoute à gauche et à droite** de chaque bloc, la **hauteur du lattis en haut et en bas**.
- Valeurs vues sur les captures : bloc de 8 × 8 po, lattis de 1 po. Valeurs par défaut réelles **À VÉRIFIER** (Q-2.3).

### 2.4 Sur la pointe — p. 40 — P0
- **CHOISIR UN STYLE** : deux options, des **triangles dans les coins** ou **une couture** au coin. La forme exacte est **À VÉRIFIER** (Q-2.4).
- Nombre de blocs horizontal × vertical.
- Taille du bloc = **la longueur du côté** du carré posé sur la pointe. Les blocs sont toujours carrés.
- Lattis : une seule largeur, ajoutée **sur tous les côtés** du bloc. 0 = pas de lattis.
- Exemple des captures : bloc de 10 po, lattis de 1,5 po.
- (illustration) **Formule de la taille du centre**, vérifiée sur la capture : 3 × 3 blocs de 10 po avec un lattis de 1,5 po donnent un centre de **48,790 po**, soit **n × (bloc + lattis) × √2** (11,5 × 1,41421 × 3). Elle servira de test.

### 2.5 Pointe variable — p. 41 — P1
- Mêmes styles que Sur la pointe (triangles en coin ou couture).
- Largeur = distance **de pointe à pointe**, horizontalement, à travers le bloc ; hauteur = la même chose verticalement. Ce ne sont donc **pas** les côtés : on obtient des losanges.
- Lattis : une largeur, ajoutée tout autour. Exemple des captures : 9 × 14 po, lattis de 2 po.
- (illustration) **Formule** vérifiée : 3 × 3 blocs de 9 × 14 avec un lattis de 2 donnent un centre de **33,000 × 51,333 po**. Une cellule mesure donc (L + s) de large et (H + s·H/L) de haut, et le centre vaut n_h·(L + s) × n_v·(H + s·H/L). Le lattis horizontal est mis à l'échelle verticalement dans le rapport H/L. Elle servira de test.

### 2.6 Baby Blocks — p. 42 — P2
- Nombre de blocs horizontal × vertical, et **une seule taille** : la longueur des côtés de tous les losanges. Pas de lattis. Exemple des captures : 10 po.

### 2.7 Blocs variables — p. 43 — P2
- **DIMENSIONS FINIES DU DESSUS** : horizontal et vertical, mesurés de pointe à pointe à travers le losange du dessus.
- **DIMENSIONS FINIES DU CÔTÉ** : la longueur verticale du côté.
- Exemple des captures : dessus de 16 × 10 po, côté de 3 po.

### 2.8 Quilts en bandes — p. 44-48 — P1
- La disposition est une liste de bandes : des lignes (horizontal) ou des colonnes (vertical). Chaque bande a **son propre style et sa propre largeur**, mais la **longueur est commune** à toutes.
- **CHOISIR UNE BANDE** : on clique sur la bande dans le quilt, ou on utilise les flèches ◄ ►. La bande sélectionnée s'affiche **en gris**.
- Boutons : **Ajouter** (à la fin), **Supprimer** (la bande sélectionnée), **Insérer** (une bande vide **avant** la bande sélectionnée).
- Case **« Cloner la bande sélectionnée »** : Ajouter et Insérer copient alors les réglages de la bande, mais **pas** son contenu (blocs et couleurs sont à refaire). Si la case est décochée, la nouvelle bande est **unie, de 2 po**.
- **Styles de bande** (liste déroulante, 11 styles) : Unie (*Plain*) · Blocs (*Pieced Blocks*) · Blocs en quinconce (*Half Drop Blocks*) · Carrés espacés (*Spaced Squares*) · Pointes A · Pointes B · Losanges · Losanges en quinconce · Doubles losanges · Doubles losanges en quinconce · Damier (*Checker Board*). Le dessin exact de chaque style est **À VÉRIFIER** (Q-2.5 : captures de la p. 46).
- (illustration, p. 46), pour une bande horizontale de N « blocs » :
  - **Unie** : un seul rectangle.
  - **Blocs** : N rectangles côte à côte.
  - **Blocs en quinconce** : la même chose décalée d'un demi-bloc, avec deux demi-blocs aux extrémités.
  - **Carrés espacés** : une alternance de grands rectangles et d'étroits espaceurs (environ 1/3 de large), avec un espaceur à chaque bout.
  - **Pointes A** : N triangles pointe en haut, et les triangles de fond entre eux.
  - **Pointes B** : la même chose pointe en bas.
  - **Losanges** : N losanges centrés sur l'axe, avec des triangles de fond en haut et en bas.
  - **Losanges en quinconce** : les losanges sont décalés d'un demi-pas, avec des demi-losanges aux bouts.
  - **Doubles losanges** : deux rangées de losanges aplatis (une en haut, une en bas) par pas.
  - **Doubles losanges en quinconce** : une rangée centrale de losanges, plus des demi-losanges en haut et en bas, décalés.
  - **Damier** : une grille de N le long × M en travers, avec des couleurs alternées.
- **NOMBRE DE BLOCS** : « Le long » (*Along length*) et « En travers » (*Across width*). « En travers » n'est actif **que pour le Damier**. Ce sont des comptes, sans lien avec les tailles.
- **Formules pour des carrés parfaits ou des angles à 90°** (p. 47). On les affichera comme aide, et on proposera un bouton « Ajuster » (P2) :
  - Blocs, Blocs en quinconce, Losanges, Losanges en quinconce : largeur × nombre de blocs = longueur.
  - Doubles losanges (et en quinconce) : largeur × (nombre ÷ 2) = longueur.
  - Pointes A et B : largeur × (nombre × 2) = longueur.
  - Damier : (longueur ÷ largeur) × nombre en travers = nombre le long.
- Astuce d'usage (p. 48) : pour alterner deux bandes, on n'en garde que deux, on coche Cloner, puis on alterne la flèche ◄ et Ajouter. Cela sert notamment aux quilts **Bargello**.

### 2.9 One Patch — p. 49 — P1
- **Style de pièce** (liste déroulante) : la liste complète est **À VÉRIFIER** (Q-2.6). Le texte cite l'hexagone, le pavé (*cobblestone*), « Personnalisé » (en tête de liste) et « Personnalisé (glissières) » (en fin de liste).
- **NOMBRE D'UNITÉS** : horizontal × vertical. Le manuel renvoie au support en ligne pour la règle de comptage, qui n'est « pas évidente » : **À VÉRIFIER** (Q-2.7).
- **TAILLE FINIE DES UNITÉS** : selon le style, largeur et hauteur (encombrement : du point le plus bas au plus haut, du plus à gauche au plus à droite), **ou** longueur du côté (hexagone, pavé).

### 2.10 Pièces personnalisées d'un One Patch — p. 53-54 — P2
- Les styles « Personnalisé » et « Personnalisé (glissières) » affichent, dans l'aperçu de la palette, des **glissières** (*glides*) : des lignes grises en pointillé, horizontales ou verticales, qui partent des coins de la pièce.
- On tire une glissière pour déformer la pièce ; au relâchement, la nouvelle forme pave tout le quilt.
- Changer de style dans la liste réinitialise la forme.
- La différence entre les deux styles est **À VÉRIFIER** (Q-2.8).

### 2.11 Photo Patchwork — p. 49-52 — P2
- La disposition se règle comme un One Patch. L'onglet DESIGN est spécifique :
  1. **Importer une photo**, depuis le disque ou depuis la section Photos du carnet (Modifier > vers le plan Quilt).
  2. **Position et taille** : trois ajustements automatiques —
     - *Inside Fit* : la photo entière tient dans le centre ; il peut rester des pièces non colorées sur les bords.
     - *Outside Fit* : la photo couvre tout le centre ; des parties dépassent ; les bordures ne sont jamais colorées.
     - *Distort Fit* : chaque bord de la photo est collé au bord du centre, sans garder les proportions.
     On peut aussi redimensionner à la main avec **8 poignées** ; la case « Garder les proportions » limite la déformation.
  3. **Masque** (optionnel) : *Auto Mask* cache ce qui dépasse du centre. On peut aussi masquer à la main en tirant les poignées vers l'intérieur. « Réinitialiser le masque » annule.
  4. **Aperçu** : « Afficher le quilt » convertit chaque pièce en couleur unie, la **moyenne des pixels** recouverts par la pièce. « Afficher la photo » revient à la photo.
  5. Sur l'onglet du **calque 1**, le résultat est un quilt colorié normal, retouchable. **Seul le calque 1 s'enregistre** dans le carnet (pas l'onglet Photo).
- Optionnel : l'outil **Aléatoire** (*Randomize*), avec « Faire correspondre aux couleurs » ou « …aux tissus », remplace chaque couleur par la couleur ou le tissu le plus proche du carnet (voir ch. 5, p. 115).
- Une fois enregistré, le quilt devient un **One Patch ordinaire**, sans lien avec la photo.

### 2.12 Ensemble personnalisé (*Custom Set*) — p. 55 — P0
- **TAILLE DU RECTANGLE CENTRAL** : largeur et hauteur, avec la case « Garder égales ».
- Case **« Garder la taille des blocs existants en redimensionnant »** :
  - **cochée** : les blocs gardent leur taille, et de l'espace vide s'ajoute **à droite et en bas** ;
  - **décochée** : tout le contenu est mis à l'échelle et touche toujours les bords.
- Aucun raccourci de remplissage : chaque bloc est posé et dimensionné individuellement (voir ch. 4).

### 2.13 Créer un quilt à partir d'un bloc — p. 56 — P2
- Menu Quilt > Créer un quilt à partir d'un bloc. La liste ne montre que les blocs du carnet qui ont **seulement des lignes horizontales et verticales**.
- L'aperçu montre le bloc converti en disposition **Custom Set** (chaque zone du bloc devient un emplacement de bloc). Les curseurs largeur et hauteur fixent la taille ; mieux vaut une taille proportionnelle à la grille du bloc.
- Le bouton « Ajouter au carnet » peut être cliqué plusieurs fois, puis on ferme.
- Pour créer ses propres dispositions : un bloc EasyDraw pièces, avec un accrochage qui correspond aux dimensions et uniquement des lignes H et V.

### 2.14 Bibliothèque de dispositions — p. 57-58 — P2
- EQ8 fournit plus de 540 quilts rangés par taille et par style, souvent en Custom Set. Chez nous, la bibliothèque est **à créer nous-mêmes** (quelques dizaines de dispositions).
- Sélection multiple : Ctrl+clic, Maj+clic, Ctrl+A ; puis « Ajouter au carnet ». Les éléments ajoutés disparaissent momentanément pour le signaler.
- Redimensionner un Custom Set : l'outil **Ajuster** (*Adjust*, dans Outils de bloc) affiche la taille de chaque bloc sélectionné ; on change ensuite le rectangle central selon la règle de 2.12.

---

## 3. Bordures (*Borders*) — ch. 3, p. 59-70

### 3.1 Modèle — p. 60-62 — P0
- Un quilt a une **liste ordonnée de bordures**, de l'intérieur vers l'extérieur.
- Chaque bordure a **un seul style** pour ses quatre côtés, mais **une taille par côté** (gauche, haut, droite, bas).
- Tout nouveau quilt a **une bordure** « Longue horizontale » de **1 po** sur les quatre côtés.
- Le style des **nouvelles bordures** se règle dans les options du plan Quilt (Options d'outils > Nouveaux quilts > « Style de bordure par défaut »). Leur taille est **toujours de 1 po**.
- La bordure sélectionnée s'affiche **en gris** ; on la sélectionne en cliquant sur le quilt, ou avec les flèches de « CHOISIR UNE BORDURE », qui indiquent par exemple « 3 sur 4 ».
- On peut poser des blocs dans toutes les bordures **sauf « Onglet »** (*Mitered*). Les blocs sont **étirés ou déformés** pour remplir leur emplacement.

### 3.2 Les 22 styles — p. 60-61, 70 — P0 (les 6 premiers) / P1 (les autres)
1. Longue horizontale (*Long Horizontal*) — le haut et le bas courent sur toute la largeur.
2. Longue verticale (*Long Vertical*) — les côtés courent sur toute la hauteur.
3. Blocs de coin (*Corner Blocks*) — un carré dans chaque coin.
4. Onglet (*Mitered*) — des coins coupés à 45°, sans blocs.
5. Blocs (*Blocks*).
6. Blocs en quinconce (*Half Drop Blocks*).
7. Carrés espacés (*Spaced Squares*).
8. Losanges (*Diamonds*).
9. Losanges en quinconce.
10. Doubles losanges.
11. Doubles losanges en quinconce.
12. Grands et petits losanges (*Big & Little Diamonds*).
13. Grands et petits losanges en quinconce.
14. Pointes vers l'extérieur (*Points Out*).
15. Grandes et petites pointes vers l'extérieur.
16. Grandes et petites pointes vers l'intérieur.
17. Pointes vers l'intérieur (*Points In*).
18. Carreaux carrés (*Tile Squares*).
19. Carreaux sur la pointe (*Tile On Point*).
20. Carreaux sur la pointe, avec coins (*Tile On Point Corners*).
21. Blocs alignés à l'intérieur (*Blocks Aligned Inside*) — voir 3.8.
22. Blocs en quinconce alignés (*Half Drop Blocks Aligned*) — voir 3.8.

La géométrie précise de chaque style (coins, répartition des blocs) n'est visible que sur les illustrations : **À VÉRIFIER** (Q-3.1, captures p. 60-61 et 70).

### 3.3 Ajouter, supprimer, insérer — p. 63 — P0
- **Ajouter** : une nouvelle bordure vierge **à l'extérieur** (style par défaut, 1 po).
- **Supprimer** : retire la bordure sélectionnée.
- **Insérer** : une nouvelle bordure **à l'intérieur** de la bordure sélectionnée.

### 3.4 Tailles — p. 64-65 — P0
- Il y a quatre curseurs avec leurs cases : Gauche, Haut, Droite, Bas. Un clic à côté du curseur fait varier la valeur de **0,25 po**.
- **Verrouillage des tailles** (*Lock size adjustments*) :
  - **Tous** (coché par défaut) : les quatre côtés bougent ensemble ;
  - **G+D** et **H+B** : couplent deux côtés opposés, et ne sont disponibles que si « Tous » est décoché ;
  - rien de coché : chaque côté est indépendant.
- Une taille de **0** élimine le côté. C'est ainsi qu'on donne un style différent à chaque côté (voir 3.7).

### 3.5 Blocs dans la bordure — p. 62 — P0
- Les compteurs **BLOCS DANS LA BORDURE** (horizontal et vertical) ne sont actifs que pour les styles qui ont des emplacements de bloc. Pour certains styles, **un seul** des deux compteurs est modifiable : lesquels est **À VÉRIFIER** (Q-3.2).

### 3.6 Cloner une bordure — p. 65 — P1
- Avec la case « Cloner la bordure sélectionnée », Ajouter et Insérer copient le **style, les tailles et le nombre de blocs**, mais **ni les couleurs ni les blocs**.

### 3.7 Un style différent par côté — p. 68-69 — P2
- La méthode : on crée quatre bordures, et pour chacune on met trois côtés à 0. Selon l'ordre d'ajout, on obtient un effet « Log Cabin » ou « Court House Steps ».
- Exception : les styles Carreaux (18-20) ont **toujours** leurs quatre côtés.
- Amélioration proposée chez nous (P3) : un assistant « style par côté », qui crée les quatre bordures automatiquement.

### 3.8 Bordures « alignées » — p. 70 — P2
- But : aligner les blocs d'une bordure extérieure sur ceux de la bordure intérieure, avec le **même** nombre de blocs horizontal et vertical dans les deux.
- **Blocs alignés à l'intérieur** : on obtient deux blocs « en plus » (un par côté), alignés sur les coins de la bordure intérieure. Il fonctionne avec : Blocs de coin, Blocs, Losanges en quinconce, Doubles losanges en quinconce, Grands et petits losanges (et en quinconce), Pointes vers l'intérieur, Grandes et petites pointes (vers l'extérieur et vers l'intérieur), Carreaux carrés.
- **Blocs en quinconce alignés** : la même chose en quinconce. Il fonctionne avec : Blocs de coin, Blocs en quinconce, Losanges, Doubles losanges, Grands et petits losanges (et en quinconce), Pointes vers l'extérieur, Grandes et petites pointes vers l'extérieur, Carreaux sur la pointe avec coins.

### 3.9 Bordures automatiques (*Set Auto Borders*) — p. 66 — P2
- Onglet DESIGN > Bordures auto : on choisit une catégorie dans une liste, puis une bordure préfabriquée dans un défilement horizontal, puis on **clique sur une bordure du quilt** pour la remplir.
- Ces bordures sont de simples **blocs**, remplaçables par un autre bloc. Changer le **style** de la bordure dans l'onglet BORDURES les efface ; seules la taille et le nombre de blocs peuvent changer sans les perdre.
- Une catégorie de « motifs en un seul bloc » (*Single Block Patterns*) pose un bloc long unique, qui s'imprime en un seul patron. Le style « Carreaux carrés » donne des tailles parfaites.
- Chez nous, les bordures automatiques sont **à créer nous-mêmes**.

### 3.10 Garder les bordures en changeant de disposition — p. 67 — P1
- Menu Quilt > **Garder les bordures actuelles** : une bascule qui reste active jusqu'à ce qu'on la désactive. En changeant de disposition, on garde les **réglages** des bordures, mais leur contenu (blocs, tissus) est effacé.
- Dans EQ8, la bascule ne dure que le temps de la session. Notre choix sur ce point est **À VÉRIFIER** (Q-3.3).

---

## 4. Concevoir le quilt : blocs, photos, broderies (*Design Quilts*) — ch. 4, p. 71-93

### 4.1 Les trois calques du quilt — p. 72 — P0
- **Calque 1** : blocs et fond (tissu uni). **Calque 2** : appliques flottantes (motifs, texte). **Calque 3** : fil (pochoirs de matelassage, broderies). Les **photos** peuvent aller sur tous les calques, avec des restrictions (voir 4.7).
- Les trois onglets de calque sont toujours visibles sous le quilt. Chacun a une **icône œil** pour le masquer (l'œil barré). Quand un calque est masqué, le calque 1 reste visible **en transparence**.
- Bouton **Afficher/masquer les contours des pièces** (barre principale) : il masque tous les contours, sur tous les calques et dans les bordures, y compris les contours dont on a changé la couleur de fil.
- **Deux modes de pose** :
  - **Poser** (*setting*) : pour le calque 1 des **dispositions standard**, c'est-à-dire les 7 premiers styles de NOUVEAU QUILT (Horizontal … Bandes verticales). Le bloc remplit un emplacement prédéfini.
  - **Glisser-déposer** : pour le Custom Set et les calques 2 et 3 de toutes les dispositions. L'élément est posé librement.
  Si l'on utilise le mauvais mode, un message l'explique.
- Le comportement des One Patch et Photo Patchwork (huitième et neuvième styles) au calque 1 n'est pas dit : on suppose qu'ils se colorent seulement, sans y poser de blocs. **À VÉRIFIER** (Q-4.1).

### 4.2 Poser des blocs au calque 1 — p. 73-74 — P0
- Onglet DESIGN > **Outils de bloc** > outil **Poser un bloc** (*Set Block*). On choisit le bloc dans la palette (il est entouré), et éventuellement une coloration (flèches sous la palette, ou clic droit > Choisir une coloration).
- **Dispositions standard** : on clique sur un emplacement, ou on glisse le bloc. En glissant, le coin haut-gauche du bloc vise le coin haut-gauche de l'emplacement, et le bloc apparaît en transparence pendant le glisser.
  - **Ctrl+clic** remplit **tous** les emplacements ; **Alt+clic** remplit **un emplacement sur deux**. Certaines dispositions demandent plusieurs clics pour tout remplir.
  - On peut aussi poser dans les lattis, les *cornerstones*, les blocs et bandes de bordure (le bloc s'étire), **sauf** dans les bordures Onglet.
  - Poser un bloc **remplace** le précédent : inutile d'effacer.
  - Les motifs et pochoirs **ne peuvent pas** aller au calque 1 (un message le signale).
- **Custom Set** : on glisse le bloc, qui se pose soit **à la taille de sa conception**, soit à une **taille par défaut**. Le choix se fait dans les options du plan Quilt > Pose des blocs > Options de glisser-déposer (P1). Le bloc s'accroche selon les réglages 4.8 ; on l'ajuste ensuite avec l'outil Ajuster.
- **Annuler** (Ctrl+Z) retire la dernière pose.

### 4.3 Motifs au calque 2, pochoirs au calque 3 — p. 75 — P1
- On les pose par glisser-déposer depuis les onglets Motifs et Pochoirs de la palette.
- **Conversions automatiques** :
  - un bloc pièces posé au **calque 2** se comporte comme un motif (il ne remplit pas d'emplacement) ;
  - un pochoir posé au calque 2 devient un motif ;
  - un bloc ou un motif posé au **calque 3** devient un pochoir (seulement des lignes).

### 4.4 Bloc uni (*Plain Block*) — p. 76 — P1
- Menu ⋯ de la palette Blocs > **Ajouter un bloc uni** : un bloc carré ou rectangulaire uni s'ajoute à la fin de la palette et se sélectionne.
- Utile en Custom Set, par exemple comme fond : position (0 ; 0) et taille égale au rectangle central.

### 4.5 Retrouver un bloc utilisé (pipette de bloc) — p. 77 — P1
- Outil **Pipette** (Outils de bloc) : on clique sur un élément du quilt, sur son calque, et il est **sélectionné dans la palette**, avec sa coloration si elle est dans le carnet (sinon, la dernière coloration du bloc).
- Option **« Basculement automatique d'outil »** (*Toggle automatic tool snapping*) : après la pipette, l'outil Poser un bloc s'active automatiquement. On la désactive pour enchaîner plusieurs recherches.

### 4.6 Broderies au calque 3 — p. 78 — P2
- Outils de broderie > Poser une broderie, par glisser-déposer ; la broderie se pose à sa **taille enregistrée**.
- Deux rendus, au clic droit : **Brouillon** (par défaut) ou **3D**.
- Elle se colore avec les outils Fil (voir ch. 5). On la supprime avec Ajuster + touche Suppr.
- Dans EQ8, les broderies sont des images de présentation, pas des fichiers brodables. Chez nous, nous définissons notre **propre format** de broderie (des tracés de points vectoriels) et une petite bibliothèque générée par code. Le contenu de cette bibliothèque est **À VÉRIFIER** (Q-4.2).

### 4.7 Photos dans le quilt — p. 79 — P2
- Au **calque 1**, on peut poser une photo **seulement en Horizontal** (en cliquant dans l'emplacement) **ou en Custom Set** (par glisser-déposer).
- Au **calque 2**, on peut poser une photo dans **toutes** les dispositions, par glisser-déposer à sa taille enregistrée.
- Une photo est toujours **rectangulaire** : elle n'est pas découpée en triangle ni à la forme d'une bordure.
- On l'ajuste avec l'outil Ajuster. Rotation et miroir 90° (4.9) ne s'appliquent pas aux photos.

### 4.8 Accrochage du quilt (*Quilt Snap Settings*) — p. 80-81 — P1
- Les réglages sont dans les options du plan Quilt > Accrochage, et dans la palette **« GRILLE DU QUILT »** quand l'outil Ajuster est actif. Trois cases :
  - **Afficher la grille (Custom Set)** : la grille n'est visible que sur un Custom Set dont le calque 1 n'est pas entièrement rempli. Zoom arrière : on n'affiche pas toutes les lignes si elles sont trop denses.
  - **Accrocher la position à la grille** : la position s'accroche au relâchement, en déplacement avec Ajuster.
  - **Accrocher la taille à la grille** : la taille s'accroche au relâchement, quand on tire une poignée.
- **Pas de la grille** (*Grid snap every*) : une liste déroulante, dont les valeurs sont **À VÉRIFIER** (Q-4.3).
- Ces réglages valent pour les blocs, motifs, pochoirs, broderies, textes et photos.
- **Règles du quilt** : menu Affichage > Règles du quilt. Leur origine se règle dans Options > Affichage, avec trois choix ; le coin haut-gauche du **centre** est recommandé (les deux autres choix sont **À VÉRIFIER**, Q-4.4).
- Conseil : redimensionner **avant** de faire pivoter avec les poignées, sinon l'angle peut dériver.

### 4.9 Rotation et miroir par clic — p. 82 — P0
- Outils **Pivoter** (90° dans le sens horaire à chaque clic) et **Miroir** (retournement gauche-droite à chaque clic). On peut les combiner.
- Ils fonctionnent sur les blocs, motifs, pochoirs, broderies, lattis et bordures. **Pas** sur les photos ni le texte.
- **Ctrl+clic** : tous les blocs du calque. **Alt+clic** : un bloc sur deux (calque 1 seulement).
- Pour un motif, pochoir ou broderie, la rotation se fait **à l'intérieur** de son cadre : la position ne change pas.

### 4.10 Outil Ajuster : déplacer, redimensionner, pivoter, incliner — p. 83-84 — P0
Il agit au calque 1 d'un Custom Set, et aux calques 2 et 3 de toutes les dispositions.
- Un clic sélectionne l'élément : un cadre pointillé apparaît avec **8 poignées**.
- **Déplacer** : on tire depuis l'intérieur (curseur en croix fléchée), ou on saisit **X et Y**, mesurés depuis le coin haut-gauche du **centre** du quilt, bordures exclues.
- **Redimensionner** : on tire une poignée (curseur en double flèche), ou on saisit **Largeur et Hauteur**. La case « Garder les proportions » existe.
- **Pivoter** : **Ctrl+clic** au centre pour passer en mode rotation, puis on tire une **poignée de coin** (curseur en flèche courbe), qui tourne autour du centre. On peut aussi saisir l'angle dans la case **Rotation du bloc**.
- **Incliner** (*skew*) : en mode Ctrl, on tire une **poignée de côté** (curseur à deux traits parallèles). Largeur, hauteur, X et Y peuvent alors changer.
- Un clic hors du cadre désélectionne.

### 4.11 Copier, coller, supprimer, effacer — p. 85-86 — P0
- Avec Ajuster, dans « OPTIONS DE SÉLECTION SIMPLE » : **Copier**, **Coller** (Ctrl+C, Ctrl+V) — la copie apparaît **décalée en bas à droite** et devient sélectionnée — et **Supprimer** (touche Suppr).
- Outil **Effacer le bloc** : il retire le contenu mais **garde l'emplacement**. Au calque 1 d'une disposition standard, l'emplacement redevient vide et coloriable. Au calque 1 d'un Custom Set et aux calques 2 et 3, il reste un **contour vide** (que l'on supprime avec Ajuster > Supprimer) qu'on peut colorer ou remplir d'un nouvel élément.
- **Ctrl+clic** avec Effacer, ou menu Quilt > **Effacer le quilt** : efface tout, et **cette action ne peut pas être annulée** dans EQ8. Chez nous, l'annulation illimitée la couvre aussi (amélioration). **Alt+clic** efface un bloc sur deux.

### 4.12 Symétrie — p. 87 — P1
- Outil **Symétrie** (calque 1, toutes dispositions ; idéal en Horizontal sans lattis) : chaque clic applique **une des 16 combinaisons** prédéfinies de rotations et de miroirs à tous les blocs ; le **17ᵉ clic** revient à l'état d'origine. Il faut des blocs asymétriques pour voir une différence.
- Les 16 combinaisons exactes sont **À VÉRIFIER** (Q-4.5). Proposition : les 8 symétries du carré, appliquées par motifs de parité (ligne et colonne).
- Certaines dispositions (Baby Blocks…) demandent de cliquer sur plusieurs blocs, comme pour Ctrl+clic.
- Option (Options > Pose des blocs) : **« Garder la rotation du bloc remplacé »** quand on pose un nouveau bloc par-dessus.

### 4.13 Empiler, centrer, découper — p. 88-89 — P1
Dans les options de sélection simple de l'outil Ajuster :
- **Ordre** : Premier plan, Arrière-plan, Avancer d'un cran, Reculer d'un cran.
- **Centrer** : horizontalement, verticalement, ou les deux (au centre exact du **centre** du quilt).
- **Découpe** (*Clip*) :
  - **Découper au bord** (*Clip to Edge*) : l'élément reste à l'intérieur du centre ;
  - **Découper à la bordure** (*Clip to Border*) : il est coupé au bord extérieur du quilt ;
  - **Ne pas découper** (*Unclip*) : il peut déborder au-delà de la dernière bordure.
- La découpe ne change que **l'affichage et l'export d'image**. Le patron imprimé reste **complet**.

### 4.14 Sélection multiple — p. 90-91 — P1
- **Maj+clic** pour ajouter des éléments. Le **premier** élément sélectionné est l'**ancre**. La sélection persiste jusqu'à un clic hors du quilt.
- **Aligner** sur l'ancre : côtés gauches, côtés droits, hauts, bas.
- **Même taille** que l'ancre : même largeur, même hauteur, ou les deux. C'est l'encombrement horizontal et vertical, pas la longueur du côté pour des blocs pivotés.

### 4.15 Texte en applique — p. 92-93 — P1
- Calque 2 uniquement > **Outils de texte** > palette TEXTE EN APPLIQUE.
- **Police** : la liste des polices TrueType **installées sur le PC**, chaque nom affiché dans sa propre police. Pas de police embarquée (clean-room).
- **Taille approximative en pouces** (curseur), plus de la mise en forme (gras, alignement… ; liste complète **À VÉRIFIER**, Q-4.6). Tout le contenu d'une boîte a **la même** mise en forme et la même couleur.
- Création : **Maj + glisser** en diagonale pour tracer une boîte, qui se réduit puis grandit pendant la frappe. Il n'y a **pas de retour à la ligne automatique** : Entrée crée une nouvelle ligne.
- La boîte se comporte comme un bloc : Ajuster, rotation, empilement, alignement, copier-coller. Pour modifier un texte désélectionné : outil Poser le texte, puis clic sur la boîte.
- **Couleur** : avec le pinceau des outils Tissus, un clic colore **tout** le texte de la boîte.
- **Impression** : seulement en **gabarits** (tous les caractères de la boîte ensemble), depuis IMPRIMER & EXPORTER, sur le calque 2 (voir ch. 9).
- Technique : il faut convertir les glyphes en contours (polygones) pour en faire des pièces d'applique.

---

## 5. Tissus, couleurs et fils (*Fabrics, Colors, Thread*) — ch. 5, p. 95-118

### 5.1 Palette « Tissus & Couleurs du carnet » — p. 96-97 — P0
- Elle s'ouvre avec les **Outils de tissu** (*Fabric Tools*) : sur le plan Bloc, onglet COLORATION ; sur le plan Quilt, onglet DESIGN.
- Deux onglets : **Tissus** (imprimés) et **Couleurs** (unis). Les vignettes défilent, et des boutons règlent leur taille.
- Une bande **« Récemment utilisés »** se trouve au-dessus des onglets (grise tant qu'elle est vide) ; on y reprend un tissu en un clic.
- **Aperçu de la sélection** : le tissu ou la couleur courant. Il est **détachable** (flèche) en fenêtre flottante, déplaçable et redimensionnable ; un X le raccroche à la palette.
- Survoler une couleur affiche son **RVB** (p. 111).
- Rappel : une coloration qui « déborde » (tout le bloc se colore d'un coup) ou une pièce impossible à colorer vient d'**erreurs de dessin** (ligne non connectée, applique non fermée). C'est la détection des pièces (ch. 6) qui doit être robuste.

### 5.2 Pinceau (*Paintbrush*) — p. 96-98 — P0
- **Pinceau un point** (*One Dot Brush*, le seul disponible sur le plan Bloc) : clic sur une pièce = elle prend le tissu ou la couleur choisis. Un nouveau clic recolore.
  - Sur le plan Quilt : **Ctrl+clic** colore cette pièce dans **tous les blocs identiques** ; **Alt+clic** le fait dans **un bloc identique sur deux**. Ces raccourcis n'existent qu'avec ce pinceau.
- **Quatre autres pinceaux**, sur le plan Quilt uniquement (pratiques pour les One Patch) : **Main levée**, **Ligne**, **Rectangle** (contour), **Ovale** (contour). On trace le chemin ; au relâchement, **toutes les pièces touchées** par le chemin prennent la couleur choisie.

### 5.3 Bombe (*Spraycan*) — p. 99-100 — P0
- Clic sur une pièce : **toutes les pièces de même couleur ou tissu dans le bloc** prennent la nouvelle couleur.
- Plan Quilt : **Ctrl+clic** = toutes les pièces semblables **du calque** ; **Alt+clic** = les pièces semblables des **blocs alternés**.
- Sous-outil **Sélectionner & vaporiser** (*Select & Spray*) : on clique d'abord une pièce, et ses semblables sont **entourées en vert**. Ensuite, chaque clic dans la palette **essaie** une couleur sur la sélection. Les **flèches du clavier** font défiler les tissus pour comparer vite. Changer d'outil ou cliquer dans le vide désélectionne. Ctrl et Alt s'appliquent comme ci-dessus.

### 5.4 Échange de couleur (*Swap Color*) — p. 100-101 — P0
- Plan Quilt uniquement. Clic : **toutes les pièces** de cette couleur ou de ce tissu, **dans tout le quilt et sur tous les calques**, prennent la nouvelle couleur.
- Sous-outil **Sélectionner & échanger** : même principe que 5.3, mais **limité au calque courant** (bordures, *cornerstones* et motifs compris).

### 5.5 Coupe ciblée (*Fussy Cut*) — p. 101 — P1
- Plan Bloc et tous les calques du plan Quilt, quand la pièce contient un tissu.
- On **tire** le tissu à l'intérieur de la pièce pour choisir la partie visible. Ensuite, les **flèches** décalent par petits pas, et **Ctrl+flèches** par grands pas. Les deux pas sont **À VÉRIFIER** (Q-5.1).
- On l'utilise d'ordinaire **après** avoir pivoté le tissu.

### 5.6 Rotation du tissu (*Rotate Fabric*) — p. 102-103 — P1
- Plan Quilt uniquement, et **pas** sur les One Patch. Trois méthodes :
  - **Simple** : +90° dans le sens horaire à chaque clic. Ctrl+clic = tous les blocs, Alt+clic = un bloc sur deux.
  - **Avancée** : un **angle de départ** (0-359, appliqué au premier clic seulement) et un **nombre de rotations** (1-16) dans 360°. Le premier clic donne départ + 360/n ; chaque clic suivant ajoute 360/n. Exemple : départ 10°, n = 8 donne 55°, 100°, 145°… Astuce du manuel : 6 pour les hexagones, 8 pour les octogones. Ctrl et Alt s'appliquent aussi.
  - **Aligner sur un bord** : le clic trouve le **bord le plus long** de la pièce (un repère s'affiche) et aligne le tissu dessus ; chaque clic suivant au centre ajoute 90° par rapport à ce bord. **Maj+clic**, ou une flèche dans la palette, passe au bord suivant. Cela agit sur **une seule pièce** (pas de Ctrl ni Alt).
- L'avancée est ambiguë : au premier clic, est-ce bien « départ + pas », comme dans l'exemple ? Ou bien « départ » seul ? On suit l'exemple chiffré du manuel (55° au premier clic avec départ 10° et n = 8).

### 5.7 Pipette de tissu ou couleur — p. 104 — P0
- Clic sur une pièce : la palette **saute** au tissu ou à la couleur utilisés.
- Sur le plan Bloc, l'outil revient ensuite **automatiquement** au dernier outil de tissu. Sur le plan Quilt, c'est réglable avec « Basculement automatique d'outil ».
- Sous-outils, sur le plan Quilt uniquement :
  - **Pipette tissu** : sur un tissu, elle trouve ce tissu ; sur une photo ou un uni, elle trouve le tissu du carnet dont la **couleur moyenne** est la plus proche.
  - **Pipette couleur** : sur un uni, elle trouve cet uni ; sur un tissu ou une photo, elle trouve l'uni le plus proche de la moyenne.

### 5.8 Outils Fil (*Thread Tools*) — p. 105 — P1
- Ils règlent le fil des **pochoirs** (matelassage), des **broderies**, et des **contours des pièces** des blocs et des motifs, sur le plan Bloc (onglet COLORATION) ou le plan Quilt (DESIGN).
- **Pinceau fil** : une section à la fois ; Ctrl+clic = tous les dessins identiques (plan Quilt).
- **Bombe fil** : tout le bloc, motif ou pochoir.
- **Échange de fil** (plan Quilt uniquement) : tout le quilt.
- **Propriétés du fil** (*Quilting/Outline Thread Properties*), trois cases à cocher qui disent ce que le clic change (au moins une doit être cochée) :
  - **Couleur** : un fil de la palette Fils ;
  - **Style** : continu ou **pointillé** (liste des styles **À VÉRIFIER**, Q-5.2) ;
  - **Épaisseur** : un choix d'épaisseurs (valeurs **À VÉRIFIER**, Q-5.2).
- Les réglages de fil sont enregistrés avec le bloc ou le quilt.

### 5.9 Ajouter des fils — p. 106-107 — P2
- Bibliothèque de fils > section **Mes fils favoris** (dans une bibliothèque utilisateur, ch. 8), **Carnet courant**, ou **Résultats de recherche** (couleur temporaire, utilisée comme base pour « Recherche > Par couleur »).
- Un fil a ces champs : **Nom**, **Numéro** (optionnel), **Fabricant** (optionnel), **R, V, B** (0-255), avec un aperçu.
- Pour les favoris, il faut **Enregistrer la bibliothèque** ; un rappel s'affiche si l'on change de style sans enregistrer.

### 5.10 Trier les tissus et couleurs — p. 107-108 — P1
- Clic droit sur les vignettes : **Trier les tissus** (manuel, comme en 1.12) ; **Trier les couleurs** > **Manuel**, **Automatique** ou **Défaire le tri**.
- Le tri automatique a des options **non décrites** dans le manuel : **À VÉRIFIER** (Q-5.3). Proposition : trier par teinte, luminosité ou saturation, croissant ou décroissant.
- Défaire le tri des tissus : il faut recliquer dans l'ordre d'origine. Chez nous, un bouton « Ordre d'origine » existe pour les deux (amélioration P3).

### 5.11 Colorations de blocs — p. 109-110 — P0
- Le **dessin au trait** est la « coloration 0 », qui ne compte pas comme une coloration. Les blocs de bibliothèque ont **deux colorations** : 1 en niveaux de gris, 2 en couleur.
- Ajouter au carnet un bloc recoloré **empile** la nouvelle coloration sur le bloc. Le **maximum par pile** vaut **2** par défaut et se règle dans Préférences > Propriétés du projet > Général > « Nombre maximal de colorations par bloc ».
- La règle exacte vient du Quick Start, p. 30 :
  - si le bloc a **moins** que le maximum, la nouvelle coloration s'empile (exemple : « 2 sur 2 ») ;
  - s'il l'a **atteint**, un **nouveau bloc** est créé : même dessin, une seule coloration (« 1 sur 1 ») ;
  - avec le maximum à **1**, rien ne s'empile, et les blocs de bibliothèque ajoutés au carnet se **dépilent** (le gris et la couleur deviennent deux blocs).
  - Les anciennes versions empilaient jusqu'à 10 colorations.
- Navigation : 4 flèches (début = dessin au trait, précédente, suivante, dernière), un indicateur « 2 sur 5 », et clic droit > **Choisir une coloration** (une bande de vignettes).
- **Scinder les colorations** : à partir de la coloration choisie, la pile est coupée en **deux blocs** identiques au dessin près.
- Les colorations de **quilts** sont toujours des quilts séparés.

### 5.12 Nouvelles couleurs unies — p. 110-111 — P1
- Clic droit sur une couleur > **Ajouter des couleurs**. EQ8 ouvre le sélecteur de couleur Windows standard (48 couleurs de base, 16 couleurs perso à remplir dans l'ordre, RVB 0-255 ou TSL 0-240).
- Chez nous : **notre propre sélecteur** (roue ou carré TSV, saisie RVB, TSL et hexadécimal, ajout de plusieurs couleurs d'affilée), sans la contrainte « remplir les cases dans l'ordre ».

### 5.13 Nuances, teintes, tons, dégradés — p. 112-113 — P1
- Clic droit sur une couleur :
  - **Nuances & teintes** (*Shades & Tints*) : une gamme du plus foncé au plus clair ;
  - **Tons** (*Tones*) : la couleur de plus en plus grise ;
  - **Dégradés** (*Grades*) : un mélange entre la couleur choisie (à gauche) et une **seconde couleur** prise dans la palette (à droite). Avec du blanc, on obtient des teintes ; avec du noir, des nuances ; avec un gris, des tons.
- Dans les trois cas, la gamme compte **de 4 à 16** couleurs. **Insérer** ajoute une couleur avant la sélection, **Retirer** l'enlève. **Ajouter au carnet** les place **à la fin** de la palette.
- Le nombre initial de couleurs et la formule de mélange (RVB linéaire ou autre) sont **À VÉRIFIER** (Q-5.4).

### 5.14 Palette par défaut — p. 114 — P2
- Voir 0.8 : on supprime des éléments du carnet, on en ajoute depuis les bibliothèques, puis Fichier > **Enregistrer la palette comme défaut**. On revient à l'origine par Préférences > Restaurer avec la case « …blocs, tissus, couleurs et fils ».

### 5.15 Outil Aléatoire (*Randomize*) — p. 115-118 — P1
- Plan Quilt uniquement. Chaque clic sur le quilt applique l'option choisie à **tout** le quilt. Les zones **non colorées** (hachurées) ne sont jamais touchées.
- **Modifier la couleur** : chaque tissu est d'abord remplacé par sa **couleur moyenne unie**, puis :
  - **Décaler la teinte** (−40 à +40) : un mouvement **circulaire**. À 0, cela convertit simplement les tissus en unis.
  - **Saturation** (−20 à +20) : elle **sature** aux extrêmes (plus gris ou plus pur).
  - **Luminosité** (−20 à +20) : elle **sature** aussi (plus sombre ou plus clair).
  - **Aléatoire** : chaque couleur est remplacée par un **uni du carnet** pris au hasard, en évitant les doublons tant que c'est possible.
  - L'unité des pas (sur quelle échelle TSL) est **À VÉRIFIER** (Q-5.5). Proposition : la teinte sur 0-240 comme le sélecteur Windows, ou en degrés.
- **Faire correspondre au carnet** (indispensable après une modification, car les couleurs calculées ne sont pas dans le carnet) :
  - **…aux couleurs** : chaque tissu ou couleur devient l'**uni le plus proche** (pour un tissu, on compare sa couleur moyenne) ;
  - **…aux tissus** : chaque couleur devient le **tissu dont la moyenne est la plus proche** ;
  - **« Ne remplacer que si l'écart est inférieur à »** + une **tolérance** de 0 à 500. Valeur conseillée : 100-200. La métrique de distance est **À VÉRIFIER** (Q-5.6). Proposition : la distance euclidienne RVB (max ≈ 441), ou ΔE.
- Le Photo Patchwork utilise les mêmes correspondances (2.11).

---

## 6. Dessin de blocs (*Drawing Blocks*) — ch. 6, p. 119-170

### 6.0 Vue d'ensemble — P0
- Plan Bloc > onglet **NOUVEAU BLOC** : on choisit le **type** dans le ruban, puis le **style** dans la palette :
  - **Pièces** (*Pieced*) : **EasyDraw** ou **PolyDraw** ;
  - **Applique** : **Bloc** (avec un fond) ou **Motif** (sans fond) ;
  - **Pièces & Applique** : **Easy + Applique** ou **Poly + Applique** ;
  - **Serendipity** (*Create Serendipity*) : des blocs générés sans dessin (6.6).
- On passe ensuite sur l'onglet **DESSIN** (outils de dessin) puis sur **COLORATION** (outils tissu et fil, ch. 5).
- Le style du bloc s'affiche au-dessus des outils de dessin. Un bloc modifié depuis le carnet revient avec **ses** outils.
- Une **image de décalque** (*Tracing Image*) est disponible dans tous les styles (6.5).

### 6.1 Barre de précision (*Precision Bar*) — p. 121-122, 130-131, 138-139 — P0
Elle se lit de gauche à droite :
- **Taille du bloc** : largeur et hauteur **finies**.
- **Points d'accrochage** (*Snaps*) H et V : le nombre de points sur la largeur et la hauteur. Il doit égaler la taille, ou en être un **multiple**. Exemples : un bloc de 6 po avec 24 points donne un point tous les ¼ po ; un bloc de 15 cm avec 150 points, un point par mm. Les points trop denses ne sont pas tous affichés, mais l'accrochage fonctionne quand même. EasyDraw et Applique ont ce réglage ; PolyDraw le remplace par sa grille (6.3).
- **Papier millimétré** (*Graph Paper*) : afficher ou masquer, avec un nombre de divisions H et V. Il ne s'imprime pas.
- **Options d'accrochage** :
  - EasyDraw : **à la grille** (actif par défaut), **aux nœuds du dessin** (actif par défaut), **aux lignes et arcs** (inactif par défaut, rarement utile, sauf pour le *foundation piecing*).
  - Applique : à la grille ; aux nœuds (actif par défaut) ; **accrocher toute la pièce à la grille** (le nœud le plus proche se cale sur le point de grille le plus proche) ; **aligner les segments** (bords de pièces côte à côte, par exemple des triangles ou des hexagones) ; **joindre automatiquement les segments** en dessinant (actif par défaut ; s'il est coupé, aucune pièce fermée ne se forme).
- **Remplissage auto** (*Auto Fill*, PolyDraw et Applique) : les pièces fermées se remplissent en **crème**. C'est le test visuel qu'une pièce est bien fermée.
- **Repères** (*Guides*) : « Convertir la sélection en repères » (sans sélection, **tout** le dessin devient repères) et « Effacer les repères ». Les repères ne s'impriment pas et **persistent** même quand on commence un nouveau bloc.
- **Afficher/masquer l'image de décalque**.

### 6.2 EasyDraw (blocs pièces au crayon) — p. 120-128 — P0
**Règle fondamentale** : on dessine les **coutures**. Chaque extrémité d'une ligne ou d'un arc doit toucher **une autre ligne, un arc ou le contour du bloc**. Les pièces sont les **faces** du graphe planaire formé par les segments et le contour.
- Au passage à COLORATION ou à l'ajout au carnet :
  - les segments **pendants** (une ou deux extrémités libres) **disparaissent**, de façon itérative (un îlot non relié au contour disparaît aussi : l'exemple du Log Cabin p. 120 ne garde que la « bordure ») ;
  - les segments **hors du contour** sont interdits ;
  - un **nœud** est ajouté automatiquement à **chaque intersection**.
  - L'algorithme exact de nettoyage est **À VÉRIFIER** (Q-6.1) : un îlot fermé relié au reste seulement par un sommet ? Proposition : retirer itérativement les arêtes de degré 1, puis garder la composante connexe du contour.
- Il ne faut pas superposer deux lignes. Une ligne qui s'écarte d'un cheveu du contour fait « baver » la couleur : l'accrochage sert à l'éviter.
- **Ligne** : on tire de A à B, et chaque extrémité s'accroche (grille ou nœud) au relâchement.
- **Arc** : un **demi-cercle** de A à B ; la **barre d'espace** pendant le tracé inverse son sens. Sa courbure se règle ensuite (voir Edition).
- **Grille** (*Grid tool*) : des colonnes et des lignes (avec des flèches) ; on tire un rectangle en diagonale et toutes les lignes se dessinent d'un coup. On peut dessiner une **grille dans une grille**. Attention aux grilles incompatibles avec l'accrochage (par exemple 3 × 3 sur 7 po).
- **Sélection** (*Pick*) : un clic sur un segment, Maj+clic pour en ajouter, **Ctrl+A** pour tout. On **déplace** en tirant le centre (avec accrochage) et on **supprime** avec le bouton ou la touche Suppr. Une **symétrie avancée** propose : miroir gauche-droite, haut-bas, diagonale G, diagonale D ; **Cloner** ; **Pivoter 90/180/270** ; **Pivoter** d'un angle libre (case + curseur) ; **Redimensionner** en % horizontal et vertical. Après chaque action la sélection reste active, pour la remettre en place.
- **Édition** (*Edit*) : on sélectionne un segment ; la palette AJOUTER DES NŒUDS propose :
  - **À l'emplacement** (clic sur le segment) ;
  - **Aux intersections** (aux croisements avec les autres segments) ;
  - **Moitié** ; **Tiers** ;
  - **Partitionner** en N parts égales (Appliquer) ;
  - **Décaler** (*Stagger*) en N parts « en quinconce ». La définition exacte est **À VÉRIFIER** (Q-6.2). Proposition : des nœuds à (i − ½)/N, avec les deux parts d'extrémité valant une demi-part.
  - On **déplace un nœud** en le tirant (avec accrochage).
  - **Courbure d'un arc** : un clic sur l'arc affiche la « **tente** » (*tent*, le point de contrôle) et le « **point chaud** » (*hot spot*, le milieu de l'arc), qu'on tire pour régler la profondeur et le sens. L'arc doit rester dans le bloc.
  - Le **contour** d'un bloc EasyDraw ne se coupe pas, mais une ligne dessinée par-dessus peut l'être.
  - Usage : partitionner deux segments en N donne des lignes droites ; partitionner l'un et décaler l'autre donne un zigzag.
- Modèle d'arc retenu : un **arc de conique ou de cercle** défini par ses extrémités et un point de contrôle. La nature exacte (arc de cercle ou Bézier quadratique) est **À VÉRIFIER** (Q-6.3).

### 6.3 PolyDraw (pièce par pièce, façon CAO) — p. 129-136 — P1
- On dessine des **pièces complètes**. Il n'y a **pas** de contour du bloc : le fond est aussi fait de pièces, et tout le bloc doit être **rempli**. Les pièces voisines partagent leurs bords (dessinés deux fois). **Pas de chevauchement.**
- **Six grilles** (les PROPRIÉTÉS DE GRILLE, avec deux compteurs) :
  - **Rectangle** : accrochage H et V (exemple : Log Cabin) ;
  - **Cercle** : *Anneaux* (le centre compte pour 1, et il y a des anneaux partiels dans les coins) et *Rayons* (le nombre d'espaces entre les rayons depuis le centre) — exemple : boussole ;
  - **Arc** : la même chose en quarts de cercle depuis un **coin** — exemple : New York Beauty ;
  - **Étoile 8 branches** : Dimension 1 et 2 = accrochage H et V dans un carré de coin ; les côtés des losanges s'alignent dessus — exemple : LeMoyne Star ;
  - **Kaléidoscope** : Dimension 1 = anneaux, Dimension 2 = rangées diagonales par secteur — exemple : croix de Malte ;
  - **Octogone** : même chose que le kaléidoscope, en octogone.
  - La géométrie exacte de chaque grille est **À VÉRIFIER** (Q-6.4, captures p. 129-130).
  - (illustration) Ce que montrent les captures :
    - **Rectangle** : une simple grille de points (24 × 24 par défaut à l'écran).
    - **Cercle** : des cercles concentriques centrés, plus des rayons depuis le centre, qui débordent en arcs partiels dans les coins.
    - **Arc** : des quarts de cercle concentriques centrés sur le coin **bas-gauche**, plus des rayons depuis ce coin.
    - **Étoile 8 branches** : un carré découpé en LeMoyne Star, avec 4 carrés de coin, 4 triangles de côté et 8 losanges au centre.
    - **Kaléidoscope** : 8 secteurs formés par les diagonales et les médianes, avec des anneaux carrés ou polygonaux.
    - **Octogone** : un octogone central avec ses 8 rayons, et des triangles de coin entre l'octogone et le carré.
    - On peut changer de grille en cours de dessin (exemple : Étoile 8 branches dans deux quarts, puis Cercle dans les deux autres).
- On peut **changer de grille ou de compteurs en cours de dessin**, par exemple pour combiner des arcs et des droites.
- **PolyLigne** (toutes les grilles) : un **double-clic** pose le premier nœud, un **clic** ajoute chaque nœud suivant (accroché au point de grille le plus proche, avec un élastique bleu), et un **double-clic sur le premier nœud** ferme la pièce. **Échap** (ou un double-clic ailleurs) abandonne la pièce. **Maj+clic** retire le dernier nœud, de façon répétable.
- **PolyArc** (grilles Cercle et Arc seulement ; ailleurs il trace des droites) : la même chose, mais le segment **suit l'arc de la grille** entre deux nœuds, ou devient une droite sur le contour et les rayons. Il faut cliquer à chaque intersection.
- **Sélection** : un clic sur un bord sélectionne la pièce (un cadre à 8 nœuds). Maj+clic, Ctrl+A. On déplace, on supprime, et on a : miroir G-D et H-B, **Cloner** (la copie est posée par-dessus, à déplacer) et **Pivoter** selon les **angles propres à la grille**. La méthode « cloner et pivoter » sert par exemple aux branches d'étoile.
- **Édition** : on déplace un nœud (vers un point de grille), un **double-clic sur un trait** ajoute un nœud, un **double-clic sur un nœud** le supprime.

### 6.4 Applique (Bloc ou Motif) — p. 138-154 — P0
- **Bloc d'applique** = les formes **plus une pièce de fond** créée automatiquement. Il va dans l'onglet Blocs et se pose sur tous les calques. Le Quick Start (p. 34) précise que ce style a deux onglets de calque : un calque **PolyDraw**, qui porte le fond uni automatique et peut servir à dessiner un **fond pièces**, et le calque **Applique**. **Motif** = sans fond ; il va dans l'onglet Motifs et se pose sur les calques 2 et 3.
- **Les pièces se superposent** : l'ordre de dessin donne l'ordre d'empilement (le premier dessiné est en dessous), et cet ordre est modifiable.
- **Une pièce = un contour fermé**, sans auto-intersection (sinon une erreur s'affiche à l'impression des gabarits). Une pièce **ne partage pas** de trait avec une autre. Les **tracés non fermés sont des fils** (matelassage ou broderie, comme des moustaches de chat) : ils se colorent avec les outils Fil mais ne s'impriment pas en gabarit.
- **Outil Dessin**, cinq sous-outils :
  1. **Ligne** : on enchaîne des segments ; chacun part de la fin du précédent ; revenir au point de départ ferme la pièce.
  2. **Courbe de Bézier** : chaque segment est au plus une courbe en « S » (Bézier cubique). Maintenir **Ctrl** pendant le tracé donne des droites, le relâcher redonne des courbes.
  3. **Main levée** : une courbe libre, lissée en plusieurs segments et nœuds. Le réglage *Better Fit* ↔ *Looser Fit* (Options > Applique > Main levée) donne plus ou moins de nœuds. Revenir au départ ferme la pièce ; sinon on continue, ou on relie les nœuds avec l'Édition.
  4. **Trait de pinceau** (*Brush Stroke*) : une **épine** (la ligne tracée) plus un corps. Les propriétés sont le **Contour** (le profil d'épaisseur), les **Extrémités** (*End Caps*), la **Largeur minimale** (l'épaisseur au point le plus fin) et la **Graisse** (*Boldness*, la demi-largeur autour de l'épine, à partir de 1). Les listes de contours et d'extrémités sont **À VÉRIFIER** (Q-6.5).
  5. **Bande** (*Swath*) : une épine plus une suite d'**oies volantes** ou de **losanges** (le *Style*), avec Contour, Largeur min. et Graisse ; le nombre d'éléments s'adapte.
  - Tant que le trait ou la bande ne sont pas convertis, on peut éditer l'épine (nœuds et poignées) et les propriétés. **Convertir en pièce** les fige ; c'est aussi automatique au passage à COLORATION ou à l'ajout au carnet. Un double-clic avec ces outils sur une Ligne ou une Bézier existante la transforme en trait ou en bande.
- **Ellipse** (une forme modifiable jusqu'à sa conversion) : **Ellipse**, **Part de tarte** (*Pie*) ou **Arc**, avec un angle de début et de fin. Des **Sections** en nombre réglable, en mode **Partitionner** (égales) ou **Décaler** (les sections de début et de fin décalées). Avec Ctrl, on obtient un cercle parfait.
- **Rectangle** : **Rectangle** ou **Rectangle arrondi**, avec une **rondeur par coin**. Avec Ctrl, un carré.
- **Formes** (*Shapes*) : des **ovales** (en violet) et des **polygones** (en sarcelle) prédéfinis — cœur, feuilles, triangles, hexagone… On tire pour dessiner ; **Ctrl** garde les proportions et l'angle. La liste complète est **À VÉRIFIER** (Q-6.6) ; chez nous, nous dessinons **notre propre** jeu de formes.
- **Créateurs de pièces** (*PatchMaker*), chacun avec un aperçu en direct :
  - **StarMaker** : une étoile (nombre de branches, taille du centre…), posée **au centre** ;
  - **PosieMaker** : une fleur, avec des modèles prédéfinis, posée **en haut à gauche** ;
  - **StencilMaker** (Motif uniquement) : un **pochoir** de matelassage, avec la case « boucle au bout des pétales ». Il va dans l'onglet **Pochoirs**.
  - Leurs paramètres exacts sont **À VÉRIFIER** (Q-6.7).
- **Sélection** : clic, Maj+clic, **rectangle de sélection** (qui doit entourer entièrement), Ctrl+A. On déplace par le centre ou avec **X/Y** (avec des flèches). Les propriétés de la sélection : **Largeur/Hauteur**, **Redimensionner** en %, **Rotation** (0-360 puis Appliquer, ou 90/180/270), les **4 miroirs**, **Centrer dans le bloc**, **Cloner** (posé par-dessus), **Supprimer**, **Premier plan** et **Arrière-plan**, et **Couronne**.
- **Couronne** (*WreathMaker*) : sur la sélection, on règle le **nombre de groupes** (3-20), l'**espacement** (0-100 % ; à 0 les groupes se touchent au centre ; à 100 %, la taille peut être réduite automatiquement pour tenir dans le bloc) et la **taille des groupes** (100 % = inchangée). La couronne est **toujours centrée** ; elle marche aussi sur une couronne existante, et convient aux pochoirs. Elle ne s'applique pas à un tracé en cours (non converti).
- **Édition** (des nœuds et segments, selon ce qui est sélectionné) :
  - ajouter un nœud (double-clic, ou « Ajouter un nœud » au milieu) ; supprimer un nœud (double-clic, ou bouton) ; déplacer un nœud ;
  - **Couper au nœud** (la pièce s'ouvre) ; **Joindre** deux nœuds (clic puis Maj+clic ; cela peut fermer la pièce) ;
  - **Convertir en ligne** et **Convertir en courbe** ; les poignées des courbes ;
  - **Type de nœud** : **Coin** (poignées indépendantes), **Pointe** (*Cusp*, poignées superposées, d'où une pointe), **Lisse** (poignées alignées, de longueurs libres), **Symétrique** (poignées alignées et de même longueur).
- **D'un bloc d'applique à un motif** : on copie les pièces (Ctrl+A, Ctrl+C), puis NOUVEAU BLOC > Motif et Ctrl+V. Les pièces arrivent **légèrement décalées** et sélectionnées ; on utilise « Centrer dans le bloc ». Chez nous, une commande directe « Convertir en motif » est en plus (P3).

### 6.5 Pièces & Applique, et décalque — p. 156-162 — P1
- **Easy + Applique** et **Poly + Applique** : deux **onglets de calque** sous le plan de travail, le calque **Pièces** (avec les outils EasyDraw ou PolyDraw) et le calque **Applique** (avec les outils Applique). Les règles de chaque style s'appliquent sur leur calque.
- On peut combiner des blocs existants en copiant-collant les segments d'un bloc pièces sur le calque Pièces, puis les pièces d'un bloc d'applique sur le calque Applique. Les réglages d'accrochage doivent être identiques ; le collage arrive décalé et il faut le recaler. Un nouveau bloc demande d'enregistrer le bloc courant s'il n'est pas dans le carnet.
- **Image de décalque** (tous les styles) :
  - On l'importe depuis le disque (ruban Image de décalque > Importer ; une boîte de recadrage s'ouvre d'abord) ou depuis le carnet (section Photos > Modifier > vers le plan Bloc).
  - **Position et taille par rapport au bloc** : *Inside Fit*, *Outside Fit*, *Distort Fit* (voir 2.11), **Centrer** à la taille réelle (pixels), **Haut-gauche** à la taille réelle.
  - **Clarté de l'image** pour décalquer (un curseur ; plus haut = plus clair).
  - **Recadrer** : à l'œil (avec des poignées) ou aux nombres (X, Y, Largeur, Hauteur), puis ✓ pour appliquer ou ↺ pour réinitialiser.
  - On **masque** l'image avec le bouton de la barre de précision ; on la **supprime** depuis le ruban.
  - On enregistre l'image et le dessin séparément pour décalquer en plusieurs séances (1.11).
- Conseils : couper le remplissage auto pendant le décalque ; changer le nombre de points d'accrochage pendant le travail ; utiliser « aux lignes et arcs » et « Aux intersections » pour le *foundation piecing*.

### 6.6 Serendipity (blocs générés) — p. 164-170 — P2
Ruban NOUVEAU BLOC > **Créer Serendipity**. Chaque générateur est une boîte en trois zones (la source, le résultat, les options). Le **résultat est interactif** : un clic le pivote de 90° si le bloc est asymétrique. On a des flèches de coloration sous chaque liste et un bouton **Ajouter au carnet**, désactivé tant que rien n'a changé.
- **Cadre** (*Frame Block*) : un cadre prédéfini autour d'un bloc. EQ8 en a plus de 140 ; chez nous, nous en dessinons **nous-mêmes** (une vingtaine). Les cadres ont des colorations (gris ou sans couleur).
- **Inclinaison** (*Tilt Block*) : le bloc tourne d'un angle (un curseur) **dans un carré**, comme un « diamant dans le carré » ; 45° le pose sur la pointe. La règle d'inscription (la taille du bloc intérieur) est **À VÉRIFIER** (Q-6.8). Proposition : le plus grand carré tourné qui tient dans le carré extérieur, avec les coins de fond devenant des pièces.
- **Fusion** (*Merge Blocks*) : un bloc **de fond** (seuls ceux qui « répondent aux exigences » sont listés, d'après l'aide d'EQ8) reçoit un **bloc intérieur** dans l'une de ses zones à **4 côtés** ; un clic dans une autre zone y déplace le bloc. Les exigences sont **À VÉRIFIER** (Q-6.9). Proposition : une zone quadrilatère convexe, avec une déformation bilinéaire ou projective du bloc intérieur.
- **Couper & retourner** (*Clip & Flip*) : on garde le **quart haut-gauche**, qu'on recopie dans les 4 quarts avec des miroirs et des rotations, selon des **« drapeaux »** (des orientations prédéfinies) ou un **dé** (aléatoire).
- **Réduire & retourner** (*Shrink & Flip*) : le bloc **entier** est réduit de moitié et posé dans les 4 quarts, avec des orientations par drapeaux ou au dé.
- Le nombre et la nature des « drapeaux » sont **À VÉRIFIER** (Q-6.10). Proposition : toutes les combinaisons des 8 symétries par quart, avec quelques préréglages.
- **Kaléidoscope** : on choisit l'une des **8 portions triangulaires** du bloc (les huitièmes découpés par les diagonales et les médianes), qui est reproduite par réflexions sur les 8 secteurs.
- **Étoile fantaisie** (*Fancy Star*) : le bloc remplit les **branches d'une étoile** de **5 à 10 branches** (p. 170 ; la référence des outils, p. 254, dit « 5 à 8 » : la contradiction est dans Q-6.11). Avec la case « Ajouter un fond », on obtient un bloc (avec un curseur pour la taille de l'étoile sur le fond) ; sans elle, un **motif**. La géométrie de l'étoile est **À VÉRIFIER** (Q-6.11).
- EQ8 recommande de **ne pas** rééditer les blocs Clip & Flip, Shrink & Flip, Kaléidoscope et Étoile fantaisie sur le plan Bloc. Ils restent coloriables, imprimables et posables. Chez nous, leur structure est une composition de blocs transformés, aplatie en pièces si l'on édite (P3).

### 6.7 Exigences géométriques transverses (cœur du logiciel) — P0
Ces exigences découlent de 6.2 à 6.6 et de la MISSION.
- **Pièces EasyDraw** : la planarisation des segments (lignes et arcs, avec les intersections) donne un graphe planaire ; on retire les arêtes pendantes de façon itérative ; on extrait les **faces bornées** dans le contour ; une face = une pièce ; on garde l'adjacence.
- **Pièces PolyDraw et Applique** : des polygones et courbes fermés, avec un test de fermeture (tolérance) et un test d'auto-intersection ; l'ordre d'empilement compte (applique).
- **Courbes** : arcs et Béziers aplatis en polylignes pour le découpage (*clipping*), avec une tolérance réglable ; on garde les courbes exactes pour l'export vectoriel et l'impression.
- **Marges de couture** : un décalage (*offset*) extérieur de chaque pièce, avec des coins en **onglet** (*miter*) ou coupés, et une largeur réglable (voir ch. 9).
- **Pochoirs et fils** : des polylignes ouvertes.
- **Transformations** : translation, rotation, miroir, inclinaison, mise à l'échelle non uniforme, déformation dans une cellule de disposition (losange, parallélogramme pour Variable Point et Baby Blocks).
- **Découpe** (*clip*) des blocs de quilt au centre ou à la bordure (4.13), pour l'affichage et l'export.
- Les **tests** sont prioritaires pour ces fonctions (cas de MISSION : unions, différences, faces fermées, marges).

---

## 7. Photos et images de tissus (plan Image) — ch. 7, p. 171-196

### 7.1 Notions — p. 172-174 — P1
- Une « **image** » est tout fichier image qu'on peut modifier sur le plan Image. EQ8 accepte BMP, GIF, JPG, PNG et TIF. **Chez nous** : **JPG et PNG en P0** (MISSION) ; BMP, GIF, TIF et WebP en P2.
- Ce qui est importé ou enregistré depuis le plan Image va dans la section **Photos**, même un tissu scanné. Pour l'utiliser comme tissu : **Ajouter comme tissu** (*Add as Fabric*, sur le plan Image), ou **Copier vers Tissus** (dans le carnet). Inversement, **Copier vers Photos** (dans la section Tissus) permet de retoucher un tissu.
- Usages : poser une photo dans un quilt (4.7), faire un Photo Patchwork (2.11), décalquer (6.5).
- **Les tissus se répètent en mosaïque** (*tiling*) à leur **échelle réelle**. Il faut donc recadrer l'image sur le **raccord du motif** pour que la mosaïque ne se voie pas.
- Conseils de scan (pour l'aide intégrée, P3) : environ 5 × 5 po (350 px), entre 3 et 7 po ; 72-75 ppp (96 pour GIF et PNG) pour les tissus ; 72 ppp pour une photo d'affichage, **150 ppp ou plus** pour une photo à imprimer sur tissu, en gardant une marge pour la couture ; détramage contre le moiré ; recadrer le bord blanc du scanner.
- **L'échelle d'un tissu importé dépend de sa résolution** : taille réelle = pixels ÷ ppp. Il faut lire le ppp du fichier (métadonnées JFIF ou PNG pHYs) et choisir une valeur par défaut s'il manque. Laquelle ? **À VÉRIFIER** (Q-7.1).

### 7.2 Importer — p. 174 — P0
- Plan Image > onglet IMAGE > Modifier > **Importer une image** : **une seule image à la fois** sur le plan. L'import multiple passe par la bibliothèque de photos (ch. 8).
- Remplacer une image modifiée non enregistrée demande s'il faut l'enregistrer dans Photos.
- Sources d'une retouche : un import, la **bibliothèque de photos** (« Modifier vers le plan Image » l'ajoute aussi au carnet) ou le **carnet** (Photos > Modifier > vers le plan Image).

### 7.3 Redimensionner, supprimer — p. 175-176 — P1
- **Redimensionner** : **Unités** (pixels, pouces, cm), **Largeur** et **Hauteur** (avec des flèches et la case « Garder les proportions »), et la **Résolution** (pixels par pouce ou par cm ; en unité pixels, changer la résolution recalcule la taille). Le **rééchantillonnage** est *Normal* (pour réduire) ou *Bicubique et moyenne* / *Linéaire et moyenne* (pour agrandir). L'écran et les règles se mettent à l'échelle. On recommande 150-200 ppp pour imprimer sur tissu.
- **Supprimer l'image** : vide le plan, sans toucher au carnet, avec une confirmation.

### 7.4 Mettre un tissu à l'échelle (*Scale Fabric*) — p. 177 — P0
- On mesure le tissu réel, on compare aux **règles** à l'écran, puis on saisit la **vraie taille** (les flèches avancent par **¼ po**) et on clique **Appliquer l'échelle** : l'image et les règles se recalent.
- Il faut ensuite recadrer sur le raccord, puis **Ajouter comme tissu**.
- La valeur saisie est-elle la largeur de l'image entière, ou celle d'une zone mesurée ? Cela n'est **pas clair** : **À VÉRIFIER** (Q-7.2).

### 7.5 Redresser, retourner, pivoter, incliner — p. 178-180 — P1
- **Redresser** : on trace une ligne le long d'un élément qui devrait être droit (on peut la retracer), puis **Appliquer** : l'image tourne pour rendre la ligne horizontale ou verticale (**la plus proche** des deux). Il faut ensuite recadrer les coins de fond ajoutés.
- **Retourner** horizontalement ou verticalement.
- **Pivoter** de 90°, de −90°, ou d'un **angle** de −360 à 360 (Appliquer). Une **couleur de fond** du canevas se choisit (dans une boîte TSL). La case **« Recadrer après rotation »** : décochée, on voit les quatre coins de l'image (le canevas grandit) ; cochée, l'image garde ses dimensions et ce qui dépasse est coupé.
- **Incliner** (*Shear*) horizontalement et/ou verticalement, de −45 à 45 (unité : degrés ? **À VÉRIFIER**, Q-7.3), avec une couleur de fond.

### 7.6 Recadrer — p. 180-181 — P0
- Un cadre pointillé avec des poignées ; la partie coupée apparaît transparente. On peut aussi saisir **X, Y, Largeur, Hauteur**, ou choisir un **préréglage** de dimensions (une liste **À VÉRIFIER**, Q-7.4 ; un préréglage trop grand est refusé). Le cadre se déplace en le tirant.
- **Appliquer** (✓ vert) ou **Réinitialiser** (↺ bleu).

### 7.7 Outils du plan Image — p. 181 — P0
**Taille réelle** (1 pixel écran = 1 pixel image), **Ajuster à la fenêtre**, **Panoramique** (main), **Ajouter comme tissu**.

### 7.8 Couleurs de l'image — p. 182-187 — P2
La palette AJUSTER LA COULEUR propose ces options, chacune avec un aperçu **Avant/Après**, un bouton **Aperçu** (sur le plan), **Ajouter au carnet** (qui enregistre et pose le résultat, la boîte reste ouverte) et **Fermer** (pour abandonner) :
- **Équilibre des couleurs** : avec un réglage automatique ; les pixels sombres plus sombres, les clairs plus clairs.
- **Rouge / Vert / Bleu** : des décalages (0 = inchangé).
- **Teinte / Sat. / Lum.** : un aperçu en direct (0 = inchangé).
- **Coloriser** : une image bicolore à partir d'une couleur et d'une intensité (effet sépia).
- **Accent de couleur** : on garde une plage de teintes et on atténue le reste.
- **Carte des teintes** (*Hue Map*) : une roue de **12 secteurs de 30°**. On choisit un secteur, puis on tire un curseur vertical vers la teinte cible. On peut répéter pour plusieurs secteurs (remettre le curseur en haut annule). Il y a aussi un **décalage de saturation** et un **décalage de luminosité** globaux.
- **Mélangeur de canaux** : par **canal de sortie** (R, V ou B), la contribution de chaque canal d'entrée.
- **Créer une gamme de couleurs** (*Create Colorway*) : l'image est analysée en 1 à 4 « couleurs » (les pics de l'histogramme), et chaque couleur est remplacée par une couleur d'une palette — palettes **toutes faites** (12, selon une roue choisie, avec saturation et luminosité), **personnalisée** (des numéros à placer sur une roue) ou **aléatoire** (bouton répétable). **Réarranger/Décaler** permute l'attribution. L'image doit être en **24 bits** (sinon une conversion est proposée).
- Les plages exactes des curseurs sont **À VÉRIFIER** (Q-7.5).

### 7.9 Histogramme, luminosité, contraste — p. 187-189 — P2
- Menu Image > Histogramme : une fenêtre qui montre la distribution, avec des cases pour choisir les canaux.
- **Égaliser** : en espace **RVB** (chaque canal séparément), **YUV** (recommandé, il suit la luminance perçue) ou **niveaux de gris**. Annuler est possible.
- **Ajuster** : des préréglages **Lueur**, **Éclaircir**, **Chaud**, **Pastel**, plus « Réinitialiser » et des réglages fins (non décrits : **À VÉRIFIER**, Q-7.6). On voit deux histogrammes superposés (gris = avant, rose = après).
- **Luminosité et contraste** : chacun de −100 à 100 (0 = inchangé).

### 7.10 Effets spéciaux, filtres, symétries — p. 190-195 — P3
- **Effets** et **Filtres** : des menus de catégories et d'effets, avec des échantillons automatiques (4 exemples, qu'on peut désactiver), des contrôles propres à chaque effet, un **dé** pour des réglages aléatoires et un aperçu. **Ces effets ne s'annulent pas** dans EQ8 (on revient à l'original du carnet). Chez nous, nous définissons **notre propre** liste restreinte : flou, netteté, pixelisation, mosaïque, détection de contours, postérisation, niveaux de gris, sépia, inversion.
- **Symétries circulaires** : une forme de **pétale** (liste), le **nombre** de pétales, un **reflet un pétale sur deux** (si le nombre est pair), des miroirs H et V de l'image source, une **couleur de fond**. Le pétale se manipule sur l'image : on le **déplace** (par le centre) ; **un clic** passe en mode redimensionnement, **deux clics** en mode rotation, un clic de plus ramène au mode normal. Chaque résultat va dans Photos.
- **Symétries carrées** : un **style** (liste), un **nombre de répétitions** (une grille), des miroirs, un fond ; le carré source se déplace, se redimensionne et pivote comme le pétale.
- Les listes de pétales, de styles et de grilles sont **À VÉRIFIER** (Q-7.7). Proposition : nos propres jeux (P3).

### 7.11 Profondeur de couleur — p. 196 — P3
- Menu Image > Augmenter/Diminuer la profondeur : la profondeur actuelle s'affiche, et l'on choisit la profondeur cible. En **1, 4 ou 8 bits**, on choisit aussi la palette et le **tramage** (*dithering*). Annuler est possible.
- Beaucoup d'effets exigent du 24 bits ; une conversion est alors proposée.
- Chez nous, on travaille toujours en RVBA 32 bits. « Diminuer » devient une **quantification** de couleurs (2, 16 ou 256 couleurs, avec ou sans tramage) ; « Augmenter » est inutile.

---

## 8. Bibliothèques (*Libraries*) — ch. 8, p. 197-212

### 8.1 Structure — p. 198-199 — P0
- **Six bibliothèques** : **Blocs**, **Tissus**, **Dispositions**, **Broderies**, **Photos**, **Fils**. On les ouvre par le menu Bibliothèques, ou avec le bouton « Ouvrir la bibliothèque » (0.4).
- Chaque bibliothèque a **cinq sections** (quatre pour les Fils, qui n'ont pas d'import) :
  - **Bibliothèque intégrée** (EQ Library) : en lecture seule, organisée en **catégories** (« 01 Pièces classiques », « 02 Pièces contemporaines », « 04 Applique classique »…) et, dans chacune, en **styles** (Paniers, Oiseaux, Papillons…), dans un arbre dépliable (+). La bibliothèque Photos n'a que 4 catégories.
  - **Mes favoris** (*My Favorite*) : des bibliothèques personnelles, vides au départ.
  - **Carnet courant** : le contenu du carnet du projet pour ce type d'élément.
  - **Résultats de recherche**.
  - **Résultats d'import**.
- **Le contenu intégré est à créer nous-mêmes** (MISSION, règle 1) :
  - **Blocs** : quelques dizaines de blocs classiques du **domaine public**, dessinés par code (Nine Patch, Four Patch, Log Cabin, Ohio Star, Flying Geese, Churn Dash, Bear's Paw, Sawtooth Star, Pinwheel, Rail Fence, Courthouse Steps, Card Trick, Friendship Star, Shoo Fly, Variable Star, Dresden Plate, Drunkard's Path, Double Wedding Ring (P2), Hexagone Grand-mère, LeMoyne Star, Mariner's Compass (P2), New York Beauty (P2)…). La liste exacte est à valider (Q-8.1).
  - **Tissus** : générés (unis, rayures, pois, damiers, carreaux vichy, bruit, dégradés), plus l'import des images de l'utilisateur.
  - **Fils** : une gamme de couleurs générée, avec des noms génériques.
  - **Dispositions**, **bordures auto**, **cadres** et **broderies** : des petits jeux faits maison.
  - **Photos** : vide (ou quelques images générées par code).
- Barre de boutons : nombre d'éléments affichés ; **Importer** ; **Rechercher** ; **Fermer** ; **Tout sélectionner** ; **Ajouter au carnet** ; **Modifier vers le plan** (Blocs, Photos et Dispositions : ajoute au carnet et pose l'élément sur le plan) ; les **flèches de coloration** (Blocs) ; la **fiche** (visible partout, modifiable hors bibliothèque intégrée).
- Boutons contextuels : **Créer une bibliothèque**, **Lier une bibliothèque**, **Couper**, **Copier**, **Coller** (vers Mes favoris), **Supprimer** et **Trier** (pas dans la bibliothèque intégrée), **Enregistrer la bibliothèque**.
- Le nombre d'éléments du style s'affiche en bas à droite.

### 8.2 Utiliser des éléments — p. 200 — P0
- On sélectionne (contour bleu ; **Ctrl+clic**, **Maj+clic** pour une plage, **Tout sélectionner**), puis **Ajouter au carnet** : l'élément « disparaît » un instant pour le signaler.
- On ne dessine qu'avec ce qui est **dans le carnet**.

### 8.3 Recherche par fiche — p. 201 — P1
- On coche les champs **Nom**, **Référence** et **Notes**. « **Trouver au plus N** » va de **1 à 999**, **50 par défaut**. Une recherche **par sous-chaîne**, **sensible à l'ordre des mots**, et la casse est ignorée (à **vérifier**, Q-8.2).
- On a donc dans la fiche un champ **Référence** en plus de Nom et Notes. Les champs complets d'une fiche de bloc sont **À VÉRIFIER** (Q-8.3).

### 8.4 Recherche de blocs par catégorie — p. 202-203 — P2
- Les catégories sont regroupées en **5 sections** : *Difficulté & infos de piéçage*, *Fêtes*, *Événements*, *Pièces*, *Applique*. Un clic sur l'icône d'une catégorie l'ajoute (l'icône passe de gris à couleur ; un nouveau clic la retire). Les catégories choisies s'affichent en bas.
- On peut choisir **jusqu'à 20 catégories**, et les résultats doivent les satisfaire **toutes** (ET logique). Maximum 1-999, 50 par défaut.
- Les catégories d'un bloc sont au **verso de sa fiche** (bouton Retourner).
- Nos propres catégories sont à définir (Q-8.1).

### 8.5 Recherche de tissus et de fils par couleur — p. 203-205 — P1
- **Tissus** : il faut d'abord sélectionner un tissu ; la couleur de recherche peut être changée pour une couleur du carnet. On coche les **bibliothèques à fouiller** ; maximum 1-999, 50 par défaut. Le tri se fait par proximité de la **couleur moyenne**. La case **« Afficher la couleur moyenne »** montre un petit carré dans le coin haut-gauche de chaque tissu.
- **Fils** : par **texte** (nom ou numéro) ou par **couleur** (même principe).

### 8.6 Lier, importer — p. 206-209
- **Lier une bibliothèque** (des dossiers de bibliothèques externes ; Ajouter, Modifier le chemin, Retirer ; Ajout auto) : les formats d'EQ8 (.blk, .fab, .qlt, .thd, .ebr, .pix) sont **hors périmètre** (MISSION, règle 5). Chez nous, on peut **lier un dossier de bibliothèques de notre format** (P3).
- **Importer depuis un projet** — P1 : on ouvre un **autre projet de notre format**, et son carnet apparaît dans Résultats d'import, prêt à ajouter au carnet courant.
- **Importer des images** dans Tissus ou Photos — P0 : la **sélection multiple** est permise (Ctrl, Maj, Ctrl+A dans la boîte de fichiers) ; ensuite Ajouter au carnet, ou Copier vers Mes favoris.
- **Importer des broderies .EXP** (format Melco) : **À VÉRIFIER** (Q-4.2). Proposition : P3, ou hors périmètre.

### 8.7 Mes favoris — p. 210-212 — P1
- **Créer une bibliothèque** : un **nom** et un **nombre de styles** de départ (**1 à 59**). Clic droit > **Modifier** (nom, nombre de styles). On renomme par clic-pause-clic.
- On **ajoute** des éléments par Copier (depuis n'importe quelle section) puis Coller dans un style ; **254 éléments au plus par style**. Il faut ensuite **Enregistrer la bibliothèque** (un rappel s'affiche si l'on change de style sans enregistrer).
- On **supprime** des éléments (avec une confirmation, puis Enregistrer). Pour supprimer une bibliothèque entière, EQ8 oblige à effacer le fichier dans `My EQ8\User Favorites`. Chez nous, il y a une commande « Supprimer la bibliothèque » (amélioration).
- **Stockage** : un dossier « Favoris utilisateur » **séparé des projets**, dans notre format, qu'on copie pour migrer vers un autre PC (1.9).

---

## 9. Impression (*Printing*) — ch. 9, p. 213-236

> Exigence MISSION : un **PDF vectoriel à l'échelle 1:1**, testé automatiquement (un carré de 6 po = **432 points PDF**). L'impression passe par le **dialogue Windows** (le PDF ou la page d'aperçu sont envoyés à l'imprimante **sans mise à l'échelle**, en « taille réelle »).

### 9.1 Principes communs — p. 214-215 — P0
- Onglet **IMPRIMER & EXPORTER** > Imprimer, sur le plan Bloc (le bloc du plan) ou sur le plan Quilt. Sur le plan Quilt, on choisit le **calque**, puis on clique l'élément : il s'entoure **en vert** et sa **taille finie** s'affiche.
- La palette IMPRIMER DES PATRONS **n'active que les styles applicables** (par exemple pas de découpe rotative pour une applique). Plan Quilt : Quilt, Métrage, Bloc, Gabarits, Fondation, Découpe rotative, Photo, Broderie. Plan Bloc : les styles de bloc. Plan Image : Photo Layout (9.10).
- **Nom** : il s'affiche en en-tête (« Sans nom » ou « Bloc du plan » s'il est vide). **Modifier le nom** puis Appliquer **met aussi à jour la fiche** du carnet.
- **Taille finie du bloc** :
  - **Utiliser la taille du quilt** (plan Quilt) ou **Utiliser la taille du plan** (plan Bloc). C'est **recommandé** ; les valeurs s'affichent grisées.
  - **Taille personnalisée** : largeur et hauteur.
- **Copies** : 1 à 99.
- Boutons du bas : **Aide**, **Mise en page**, **Polices**, **Aperçu** (recommandé), **Imprimer**, **Fermer**.
- **Aperçu** : Imprimer, **Zoom avant** (un rectangle à tracer), **Zoom arrière**, **Ajuster à l'écran**, Fermer. Pour les gabarits et fondations, on peut aussi **déplacer, supprimer et pivoter** les pièces (9.5).
- **Mosaïque sur plusieurs pages** (*tiling*) : un patron plus grand que la page se répartit sur plusieurs pages, avec des **repères de raccord** au bord droit (si la marge droite est trop petite, ce repère manque). Les **pages vides ne s'impriment pas**. Le recouvrement et les marques d'assemblage sont **À VÉRIFIER** (Q-9.1). Proposition : des repères de coupe, un numéro « ligne-colonne » par page, et un recouvrement de 0,5 po.
- **Épaisseur minimale des traits** à l'impression : Préférences > Général > Options d'impression, **1 px par défaut**, réglable à 2, 3 ou 4.

### 9.2 Imprimer un bloc, motif ou pochoir — p. 216-217 — P0
- **Style** :
  - **Dessin au trait** : des traits noirs continus, avec les superpositions visibles ;
  - **Pochoir de matelassage** : des pointillés noirs ;
  - **Patron d'applique** : des traits noirs et des pièces **remplies de blanc**, qui montrent l'empilement ;
  - **Avec les tissus** : en couleur, selon la coloration affichée dans la boîte (avec ses flèches de coloration, quelle que soit la coloration du plan). Pour un pochoir, les fils sont rendus en couleur, style et épaisseur. Ce style est **indisponible** si l'aperçu n'est qu'un trait (coloration 0).
- **Options** :
  - **Imprimer le nom du bloc** ;
  - **Autant que la page en contient** : plusieurs petits blocs par page, selon les marges ;
  - **Miroir** : le bloc retourné horizontalement ;
  - **Épaisseur de trait** (une liste) pour le trait et l'applique ;
  - pour « Avec les tissus » : **contour du bloc** et/ou **contour des pièces**.

### 9.3 Gabarits (*Templates*) — p. 218-219 — P0
- **Chaque pièce** est imprimée séparément, pour tous les types de blocs (pièces et applique) ; les textes en applique s'impriment ensemble, par boîte (4.15).
- **Marge de couture** : une case « Imprimer la marge » plus une **largeur**. La valeur par défaut est **À VÉRIFIER** (Q-9.2) ; on propose 0,25 po (0,75 cm en métrique ?). Le gabarit montre la **ligne de couture** (pointillée, d'après p. 226 : « les lignes pointillées de la marge ») et la **ligne de coupe**. Le style exact des traits est **À VÉRIFIER** (Q-9.3).
- **Bloc clé** (*Key Block*) : **Aucun**, **Petit** ou **Grand**. C'est une miniature du bloc, en haut à gauche, avec **une lettre par pièce**. Les gabarits portent les mêmes lettres.
- **Épaisseur de trait**, **Bloc en miroir** (retourne les pièces), **Copies**.
- Sur papier congélation (*freezer paper*) sans marge : décocher la marge.
- **Règle d'étiquetage** : les pièces **identiques** (même forme à une isométrie près, même tissu ?) partagent-elles une lettre et un compte ? C'est **À VÉRIFIER** (Q-9.4). Le tableau de coupe rotative (9.6) indique en tout cas « couper N carrés bleus, M roses » : il compte donc les pièces par lettre **et** par couleur.
- Erreur si une pièce s'auto-intersecte (6.4).
- (illustration, p. 218-219) La boîte « Imprimer des gabarits » réunit : Modifier le nom ; la taille finie (Utiliser la taille du quilt ou personnalisée) ; la marge (**0,25** et « Imprimer la marge » coché) ; le bloc clé (**Petit** par défaut) ; l'épaisseur de trait ; Miroir ; les copies ; et un aperçu du bloc.
  - Sur la page imprimée, le **bloc clé** est en haut à gauche, avec le nom au-dessus. Les gabarits sont rangés à la suite, chacun avec sa ligne de marge **en pointillés** autour de la forme et un **repère central** (point ou lettre).
  - Une ligne de pied de page donne le nom, la taille et le projet.
  - L'aperçu montre **deux pages côte à côte**, avec des pages vides non imprimées.

### 9.4 Fondation (*Foundation*, paper piecing) — p. 219-221 — P1
- Onglet **Options** : taille ; marge de couture (autour de **chaque section**) ; épaisseur ; copies.
- **Style** : **Trait**, **Remplissage gris** ou **Remplissage couleur** (des unis proches de la couleur moyenne des tissus).
- **Options** :
  - **Imprimer la numérotation** (une lettre par section, un numéro par pièce : A1, A2, B1…) ;
  - **Séparer les unités** (indispensable pour déplacer ou supprimer des sections dans l'aperçu) ;
  - **Miroir** ;
  - **Imprimer le nom** ;
  - **Autant de blocs que la page en contient** (incompatible avec la modification de l'aperçu).
- (illustration, p. 220) Défauts vus sur la capture : style **Remplissage couleur** ; Numérotation, Séparer les unités, Miroir et Nom **cochés** ; « Autant que la page en contient » **décoché** (si on le coche, déplacer et supprimer sont désactivés dans l'aperçu) ; marge 0,25.
  - L'impression montre chaque section entourée de sa marge en pointillés, avec les numéros dans les pièces.
- Onglet **Sections** (fenêtre redimensionnable) : EQ8 propose un découpage (des traits bleus). **Recommencer** efface tout ; on clique les pièces d'une section (elles deviennent grises) puis **Grouper**. **Maj+clic** retire une pièce de la sélection.
- Onglet **Numérotation** : **Changer les numéros**, puis un clic sur les pièces **dans l'ordre de couture**. Maj+clic retire, Recommencer remet à zéro.
- Case **« Je découpe et numérote moi-même »** : seules les sections définies s'impriment.
- Le sectionnement peut être **enregistré avec le bloc** (Aperçu, Fermer, Fermer, Enregistrer).
- Les blocs **PolyDraw** et les blocs **EasyDraw courbes** demandent un sectionnement et une numérotation **manuels**.
- **Algorithme de découpage automatique** : **À VÉRIFIER** (Q-9.5). Proposition : un découpage récursif par des lignes droites qui traversent toute la région, et une numérotation par ajout successif de pièces le long d'une couture droite.

### 9.5 Modifier l'aperçu des gabarits et fondations — p. 222-223 — P1
- Un clic sélectionne une pièce (**contour rouge**). **Supprimer** : les autres pièces se **réorganisent** pour combler le vide (il vaut donc mieux supprimer avant de déplacer). **Déplacer** en tirant. **Pivoter** (gabarits seulement) par pas de **30°**.
- Fermer l'aperçu **réinitialise** la mise en page ; changer le bloc clé aussi. Dans EQ8, un « enregistrer l'aperçu » passe par une imprimante PDF. Chez nous, **Exporter en PDF** depuis l'aperçu conserve la mise en page (P1).

### 9.6 Tableau de découpe rotative (*Rotary Cutting Chart*) — p. 224-227 — P0
- Il est disponible seulement pour les pièces découpables au cutter : **carrés, rectangles, triangles (demi-carré et quart de carré), parallélogrammes, losanges**. Les autres pièces sont **omises** (il faut imprimer leurs gabarits). La liste exacte des formes reconnues et le contenu de leurs diagrammes sont **À VÉRIFIER** (Q-9.6).
- **Paramètres** : la taille (« Utiliser la taille du quilt » recommandé) ; la **marge de couture** ; le **bloc clé** (Petit ou Grand) ; l'**arrondi** en pouces (**1/8**, **1/16** ou **aucun** ; en métrique, toujours au **mm**) ; les copies.
- **Contenu** (exemple p. 225), pour chaque lettre de pièce :
  - un diagramme de découpe ;
  - « couper une **bande** de largeur L, puis des carrés de L » ;
  - pour les triangles demi-carré : « couper des carrés de c, puis **une diagonale** » ;
  - pour les triangles quart de carré : « couper des carrés, puis **deux diagonales** » ;
  - le **nombre de pièces par couleur** (« 4 carrés bleus, 4 roses, 1 rouge »).
- **Formules conventionnelles** à reproduire : pour un carré ou un rectangle, fini + 2 × marge. Pour un triangle demi-carré, côté fini + **7/8 po** (valeur exacte : 2 × marge × (1 + √2/2) = 0,85355 po avec une marge de ¼) — avec l'arrondi au 1/8, cela donne bien 7/8. Pour un triangle quart de carré, hypoténuse finie + **1¼ po** (valeur exacte 2√2 × marge × … — à calculer par décalage plutôt que par formule).
- **Méthode exacte recommandée** : on décale la pièce de la marge (avec des coins en onglet), on prend la **boîte englobante** dans l'orientation de coupe, puis on arrondit. Ce principe est cohérent avec la p. 226 : « prolonger les lignes de marge aux coins jusqu'à leur croisement, puis mesurer ».
- Sans arrondi, les valeurs vont au **millième**.
- (illustration, p. 224-225) La boîte montre l'arrondi **1/16 coché par défaut**, une marge de 0,25, le bloc clé Petit, des flèches de coloration sous l'aperçu, et un texte « certaines pièces peuvent manquer ».
  - **Mise en page** : en haut, le bloc clé (dans un cercle, avec des lettres) et l'aperçu en couleur. Puis **une ligne par lettre**, avec à gauche le **diagramme de découpe** et à droite le **compte par couleur** (une pastille de couleur + « N pièces »).
  - **Diagramme de découpe** : une bande grise de largeur L (cotée verticalement), avec le premier carré découpé en gris foncé et coté horizontalement. Une diagonale signale le triangle demi-carré, deux diagonales le triangle quart de carré.
- **Tests** : les cas de la p. 225-226 (carré 2½, triangle demi-carré 2⅞, triangle quart de carré 3¼, l'exemple 7 × 5 sur 10 po : un rectangle fini de 1,428571 × 2 donne 1 7/8 × 2½ avec l'arrondi au 1/8).
- Une aide intégrée rappelle les bonnes pratiques (la taille du bloc doit être un multiple de sa grille, l'arrondi au 1/16, vérifier avec les gabarits).

### 9.7 Blocs de bordure et de lattis — p. 228 — P0
- Sur le calque 1, un clic sur un bloc de bordure, de lattis ou de *cornerstone* le sélectionne entièrement (une bande longue, un bloc, ou un bloc découpé), puis on choisit Gabarits, Fondation ou Découpe rotative avec « Utiliser la taille du quilt ».
- Une bordure se compose de plusieurs blocs, donc de **plusieurs impressions**. Les bordures auto « en un seul bloc » s'impriment en une fois.
- Amélioration chez nous (P2) : **« Imprimer toute la bordure »**, qui regroupe tous les blocs d'une bordure dans un même travail.

### 9.8 Imprimer le quilt — p. 229 — P0
- **Style** : **Dessin au trait** ou **Avec les tissus**.
- **Options** : **nom**, **taille hors-tout** en en-tête, **contour des blocs**, **contour des pièces**. Copies.
- Le quilt est mis à l'échelle de la page (ce n'est pas du 1:1). Une impression partielle passe par Exporter > Sélection > Imprimer (10.2).
- Astuce : pour un trait sans superpositions d'applique, colorer tout en blanc et imprimer « avec les tissus ».

### 9.9 Photo et broderie depuis le plan Quilt — p. 230 — P2
- Sur le calque de l'élément, on le sélectionne, et l'option **Photo** ou **Broderie** s'active. Taille : **Utiliser la taille du quilt** (recommandé) ou personnalisée. Copies, épaisseur de trait (broderie).
- Conseil pour une photo imprimée sur tissu : l'imprimer un peu plus grande (1/16 po par côté) pour couvrir la marge.

### 9.10 Mise en page de photos (*Photo Layout*, plan Image) — p. 231-232 — P2
- Une **page** blanche, avec les photos du carnet à droite. On glisse une photo sur la page : elle se pose à sa **taille enregistrée**, ou bien on propose de la réduire si elle ne tient pas. On peut en mettre plusieurs.
- Sur la sélection : **déplacer** ; **Redimensionner** (une boîte, avec les proportions) ; **pivoter ±90°** ; **miroir H/V** ; des préréglages (centrer sur la page, horizontalement, verticalement ; aller en haut, en bas, à gauche, à droite) ; **Copier/Coller** ; **Supprimer** ; **Mosaïque** (*Tile* : répéter l'image sur toute la page, comme une bascule).
- **Grille** : afficher, accrocher, et un réglage (Affichage > Grille : **origine** et **pas**). Conseil : origine haut-gauche, pas de ¼ po. La grille ne s'imprime pas.
- **Aligner** (sur la première sélectionnée, avec Maj+clic) : haut, bas, gauche, droite.
- On **imprime** ; la page reste ouverte. La fermer **efface** la page. Chez nous, la mise en page est **enregistrée dans le projet** (P3).

### 9.11 Métrage (*Yardage*) — p. 233-234 — P0
- **Paramètres** :
  - la **laize** (*Fabric Width*) : une liste dont les valeurs sont **À VÉRIFIER** (Q-9.7) ; proposition : 36, 40, 42, 44, 45, 54, 60, 90, 108 po, et 90, 110, 112, 140, 150, 240, 280 cm ;
  - la case **« Coupons (fat quarters) uniquement »** (le résultat est alors donné en nombre de coupons ; la taille d'un coupon, 18 × 21-22 po, est **À VÉRIFIER**, Q-9.8) ;
  - la **marge de couture**.
- **Algorithme** (décrit p. 233) :
  1. on ajoute la marge à chaque pièce, puis on prend son **rectangle englobant** ;
  2. on range ces rectangles sur une bande de la **laize** choisie ;
  3. à chaque « rangée » remplie, on commence une nouvelle rangée, et **toute la hauteur de la rangée** compte.
  - Le résultat est en général **surestimé** (surtout pour les lattis sur la pointe).
  - **Bordures** : on suppose que les **longues bandes sont raboutées**, et la longueur de raboutage se base sur la laize.
  - Le **dos** et le **biais** ne sont **pas** estimés.
- **Ce qui reste flou** et est **À VÉRIFIER** (Q-9.9) : l'orientation des rectangles (rotation de 90° permise ?), l'ordre de rangement (par hauteur décroissante ?), l'arrondi final (au 1/8 de yard ?), le pas de raboutage. Proposition : un « shelf packing » trié par hauteur décroissante, avec rotation autorisée si elle réduit la hauteur, et un arrondi au 1/8 yd (ou 10 cm) supérieur.
- **Sortie** : par tissu ou couleur, une vignette, le **nom** (et la référence s'il y en a une), le **nombre de pièces** et le **métrage**. Un uni compte comme un « tissu » à part.
- Astuces d'usage (p. 234) : colorer le centre et les bordures différemment pour avoir des métrages séparés ; compter des blocs en colorant une pièce par bloc avec Ctrl+clic ; concevoir le dos comme un second quilt (un Custom Set avec un bloc uni de la taille du quilt).
- **Tests** : des cas calculés à la main (MISSION), par exemple 20 carrés de 4,5 po sur une laize de 42 po = 9 par rangée, donc 3 rangées de 4,5 po = 13,5 po = 0,375 yd.

### 9.12 Polices d'impression — p. 235 — P1
Fichier > Polices de l'imprimante, ou le bouton Polices. Cinq rôles, chacun avec une **police** et une **taille** :
- **Symbole** (Arial 8) : les lettres du bloc clé et des gabarits ;
- **Nombre** (Arial 8) : la taille du quilt, les étiquettes des fondations, des gabarits et du tableau de coupe, et la police principale du métrage ;
- **En-tête** (Arial 12) : le nom ;
- **Pied de page** (Arial 7) : en bas à gauche, le nom, la taille du bloc et le nom du projet ;
- **Données** (Arial 8) : les légendes, comptes et étiquettes de la découpe rotative.
- Chez nous, les polices par défaut sont **des polices système** présentes sous Windows (Arial ou Segoe UI), sans police embarquée ; elles sont intégrées au PDF par sous-ensemble si la licence le permet. **À VÉRIFIER** (Q-9.10).

### 9.13 Mise en page et imprimante — p. 236 — P0
- Fichier > Configuration de l'impression (choix de l'imprimante).
- Fichier > Mise en page : **format** du papier, **alimentation**, **orientation** (portrait ou paysage), **marges** gauche, droite, haut et bas (le minimum dépend de l'imprimante).
- Chez nous, le format par défaut est **Lettre US ou A4** selon les paramètres régionaux de Windows (**À VÉRIFIER**, Q-9.11).

---

## 10. Export — ch. 10, p. 237-242

### 10.1 Exporter une image — p. 238-239 — P0
- Plans Quilt, Bloc et Image > IMPRIMER & EXPORTER > Exporter > **Image**. Sur le plan Quilt, on exporte le quilt **ou le bloc sélectionné**.
- **Formats d'EQ8** : TIF (impression haute résolution), JPG, GIF, BMP, PNG. **Chez nous**, MISSION : **PNG, JPG, SVG** (P0), et **PDF** (P0, voir 10.4) ; TIF et BMP en P3.
- **Dimensions de l'image** : largeur et hauteur, avec « Garder les proportions » (coché pour un quilt). L'unité est **À VÉRIFIER** (Q-10.1). Proposition : en pouces ou cm, avec un affichage en pixels.
- **Résolution** : une liste (72-75, 150-300, 300-600 ppp ; valeurs exactes **À VÉRIFIER**, Q-10.1). Proposition : 72, 96, 150, 200, 300, 600.
- **Options** : **contour des pièces** et **contour des blocs** (cochés par défaut, puisqu'on « peut les décocher »).
- **JPG** : qualité de 0 à 100, **50 par défaut**. **TIF** : compression LZW ou aucune, 24 ou 32 bits.
- Conseil : exporter à la taille d'utilisation finale.

### 10.2 Exporter une sélection — p. 240 — P1
- Un curseur spécial ; on tire un rectangle sur le plan Quilt ou Bloc. Une boîte propose trois choix :
  - **Enregistrer** : en .bmp dans EQ8 ; **chez nous en PNG** ;
  - **Copier dans le presse-papiers** ;
  - **Imprimer**.
- Annuler : changer d'outil, d'onglet ou de plan, ou fermer la boîte.

### 10.3 Métafichier de bloc — p. 241-242 — P2
- Plan Bloc uniquement. **Qualité** : brouillon, moyenne ou haute. **Options** : contour + remplissage, contour seul, **remplissage seul** (recommandé). Les remplissages sont **unis**, à la couleur moyenne des tissus.
- Sortie EQ8 : .EMF ou presse-papiers. **Chez nous**, c'est l'**export SVG** du bloc (vectoriel, avec un groupe par pièce et les mêmes trois options), plus « Copier en SVG ». L'EMF est P3 (ou hors périmètre).

### 10.4 Export PDF — exigence MISSION — P0
- Tout ce qui s'imprime (ch. 9) peut aussi s'exporter en **PDF vectoriel**, à **l'échelle 1:1** pour les patrons. Le quilt et les images sont mis à l'échelle de la page.
- On garde la **mise en page modifiée** de l'aperçu (9.5).
- **Test automatique** : un carré de 6 po mesure **432 points** dans le PDF (1 po = 72 pt) ; un carré de 10 cm mesure 283,46 pt.

### 10.5 Partage Facebook — p. 242 — **hors périmètre**
Il faudrait une connexion à un service tiers. On le remplace par l'export d'une image.

---

## 11. Raccourcis clavier — p. 249 et Quick Start p. 36

| Action | Raccourci | Contexte | Prio |
|---|---|---|---|
| Nouveau projet | Ctrl+N | global | P0 |
| Ouvrir un projet | Ctrl+O | global | P0 |
| Enregistrer / Ajouter au carnet | Ctrl+S | global | P0 |
| Annuler | Ctrl+Z | global | P0 |
| Rétablir | **non listé dans le manuel** (Q-11.1 ; proposition : Ctrl+Y et Ctrl+Maj+Z) | global | P0 |
| Couper / Copier / Coller | Ctrl+X / Ctrl+C / Ctrl+V | sélection | P0 |
| Supprimer / Effacer | Suppr (et Retour arrière ?) | sélection | P0 |
| Tout sélectionner | Ctrl+A | plan Bloc, bibliothèques | P0 |
| Sélectionner le(s) dernier(s) segment(s) dessiné(s) | Barre d'espace | plan Bloc | P1 |
| Inverser l'arc pendant le tracé | Barre d'espace (pendant le tracé) | EasyDraw | P0 |
| Afficher le carnet | F8 | global | P0 |
| Fermer une boîte de dialogue | Échap | global | P0 |
| Zoom avant / arrière | Ctrl++ / Ctrl+− ; Ctrl + molette | plans | P0 |
| Ajuster à la zone de travail | Ctrl+0 | plans | P0 |
| Rafraîchir l'écran | F5 | plans | P3 (sans objet chez nous, mais gardé) |
| Remplir **tous** les emplacements / colorer la pièce dans **tous** les blocs identiques / toutes les pièces semblables / pivoter ou retourner tous les blocs / effacer tout | **Ctrl+clic** | plan Quilt | P0 |
| La même chose, **un bloc sur deux** | **Alt+clic** | plan Quilt (calque 1) | P1 |
| Mode rotation et inclinaison de l'outil Ajuster | Ctrl+clic au centre | plan Quilt | P0 |
| Sélection additive, ancre | Maj+clic | partout | P0 |
| Tracer une boîte de texte | Maj+glisser | plan Quilt, calque 2 | P1 |
| Abandonner la pièce en cours | Échap | PolyDraw | P1 |
| Retirer le dernier nœud | Maj+clic | PolyDraw | P1 |
| Droites dans l'outil Bézier | maintenir Ctrl | Applique | P1 |
| Cercle ou carré parfait, proportions gardées | Ctrl + glisser | Applique | P1 |
| Bord d'alignement suivant | Maj+clic | Rotation du tissu | P2 |
| Décaler le tissu (coupe ciblée) | flèches / Ctrl+flèches | Fussy Cut | P1 |
| Faire défiler les tissus en essai | flèches | Sélectionner & vaporiser | P2 |
| Changer de champ dans les palettes | Tab | palettes | P0 |

---

## 12. Barres d'outils et palettes — p. 250-256 et Quick Start p. 38-48

### 12.1 Barre principale et barre verticale — P0
- Le manuel cite : Nouveau projet, Ouvrir un projet, Ajouter au carnet, Afficher le carnet, Annuler, Afficher/masquer les contours des pièces, Ouvrir la bibliothèque, Options du plan (*Worktable Options*), Mètre ruban, Zoom avant, Zoom arrière, Rafraîchir, Ajuster à la zone. L'**ordre exact** et la répartition entre la barre horizontale et la barre verticale gauche sont **À VÉRIFIER** (Q-12.1). Chez nous, la disposition est **la nôtre**, avec nos propres icônes.

### 12.2 Plan Quilt — onglet DESIGN
- **Outils de bloc** : Poser un bloc · Effacer le bloc · Pivoter · Miroir · Ajuster · Symétrie · Pipette · Ouvrir la bibliothèque.
- **Outils de tissu** : Pinceau (5 styles) · Bombe (+ Sélectionner & vaporiser) · Échange de couleur (+ Sélectionner & échanger) · Pipette (+ tissu, + couleur) · Coupe ciblée · Rotation du tissu · Aléatoire · Ouvrir la bibliothèque.
- **Outils de photo** : Poser une photo · Effacer · Ajuster · Ouvrir la bibliothèque.
- **Outils de texte** (calque 2) : Poser le texte · Ajuster.
- **Outils de broderie** (calque 3) : Poser une broderie · Effacer · Pivoter · Miroir · Ajuster · Ouvrir la bibliothèque.
- **Outils de fil** : Pinceau fil · Bombe fil · Échange de fil · Ouvrir la bibliothèque.
- **Bordures auto**.
- Les autres onglets du plan Quilt sont NOUVEAU QUILT (les 10 dispositions), DISPOSITION, BORDURES (les 22 styles), DESIGN, et IMPRIMER & EXPORTER.

### 12.3 Plan Quilt — IMPRIMER & EXPORTER
- **Imprimer** : Quilt · Métrage · Bloc · Gabarits · Fondation · Découpe rotative · Broderie · Photo · Configuration de l'impression.
- **Exporter** : Image · Sélection · (Facebook, hors périmètre).

### 12.4 Plan Bloc
- Onglets : NOUVEAU BLOC · DESSIN · COLORATION · IMPRIMER & EXPORTER.
- **EasyDraw** : Sélection · Édition · Ligne · Arc · Grille.
- **PolyDraw** : Sélection · Édition · PolyLigne · PolyArc.
- **Applique** : Sélection · Édition · Dessin (5 sous-outils) · Formes (ovales, polygones, StarMaker, PosieMaker, StencilMaker) · Ellipse · Rectangle.
- **Image de décalque** : Importer · Position & taille · Recadrer · Supprimer.
- **Serendipity** : Cadre · Inclinaison (0-90°) · Fusion · Couper & retourner · Réduire & retourner · Kaléidoscope · Étoile fantaisie · Ouvrir la bibliothèque.
- **Exporter** : Image · Sélection · Métafichier (chez nous, SVG).

### 12.5 Plan Image
- **Modifier** : Importer · Redimensionner · Échelle du tissu · Pivoter (Redresser, Miroirs, ±90°, angle, Inclinaison) · Recadrer · Supprimer · Ouvrir la bibliothèque.
- **Couleur** : Équilibre · R/V/B · T/S/L · Coloriser · Accent · Carte des teintes · Mélangeur · Gamme de couleurs.
- **Histogramme** : Ajuster · Égaliser · Luminosité/Contraste.
- **Effets spéciaux** : Effets (plus de 45 dans EQ8) · Filtres (9) · Symétries circulaires · Symétries carrées.
- **Imprimer** : Mise en page de photos · Configuration de l'impression.
- **Exporter** : Image · Sélection.
- **Outils du plan** : Taille réelle · Ajuster à la fenêtre · Panoramique · Ajouter comme tissu.

### 12.6 Personnalisation de l'interface — Quick Start p. 26 — P2
- Les palettes sont **redimensionnables**, et leurs boîtes à outils **repliables** (avec un triangle).
- **Aperçu du tissu** détachable.
- Préférences > Affichage : **ruban sur le côté** de l'écran, **petites icônes**, **masquer les astuces** des palettes.
- MISSION en plus : **thème clair et sombre** (P1) et **interface en français** (P0).

---

## 13. Préférences et options : récapitulatif

| Où | Réglage | Défaut | Réf. |
|---|---|---|---|
| Préférences > Espace de travail > Mesure | pouces ou cm | pouces | 0.6 |
| Préférences > Espace de travail > Restaurer | réglages (+ contenu par défaut) | — | 0.7 |
| Préférences > Affichage | ruban latéral, petites icônes, astuces | **À VÉRIFIER** (Q-13.2) | 12.6 |
| Préférences > Général (projet) | nombre maximal de colorations par bloc | 2 | 5.11 |
| Préférences > Général > Impression | épaisseur minimale des traits (px) | 1 (choix 1-4) | 9.1 |
| Options du plan Quilt > Disposition > Tous les styles | nombre maximal de blocs H et V | 24 (jusqu'à 100) | 2.2 |
| Options du plan Quilt > Nouveaux quilts | style de bordure par défaut | Longue horizontale (1 po) | 3.1 |
| Options du plan Quilt > Pose des blocs | glisser-déposer : taille d'origine ou taille par défaut (valeur ?) ; garder la rotation au remplacement | **À VÉRIFIER** (Q-4.7) | 4.2, 4.12 |
| Options du plan Quilt > Accrochage | afficher la grille, accrocher la position, accrocher la taille, pas | **À VÉRIFIER** (Q-4.3) | 4.8 |
| Options du plan Quilt > Affichage | origine des règles (3 choix) | **À VÉRIFIER** (Q-4.4) | 4.8 |
| Options du plan Bloc > Applique | lissage de la main levée (Better ↔ Looser) | **À VÉRIFIER** (Q-13.3) | 6.4 |
| Barre de précision | accrochage EasyDraw grille / nœuds / lignes | oui / oui / non | 6.1 |
| Barre de précision | accrochage Applique nœuds / jonction auto | oui / oui | 6.1 |
| Impression > Polices | 5 rôles | Arial 8 / 8 / 12 / 7 / 8 | 9.12 |
| Export image JPG | qualité | 50 | 10.1 |
| Recherche en bibliothèque | nombre maximal de résultats | 50 (1-999) | 8.3 |
| (Chez nous) Sauvegarde automatique | intervalle | **À VÉRIFIER** (Q-13.1) | 1.4 |
| (Chez nous) Thème | clair, sombre ou système | système | 12.6 |
| (Chez nous) Langue | français | français | MISSION |

---

## 14. Table des priorités

**P0 — indispensable (le produit minimal utile)**
- Les projets dans notre format : nouveau, ouvrir, enregistrer, enregistrer sous ; le carnet avec ses sections Quilts, Blocs (Blocs, Motifs, Pochoirs), Tissus, Couleurs, Photos et Fils ; modifier, supprimer ; annuler et rétablir illimités ; les unités pouces et cm.
- Le plan Bloc **EasyDraw** : la barre de précision, l'accrochage, Ligne, Arc, Grille, Sélection, Édition (nœuds, partitionner, courbure), la **détection des pièces** (planarisation, nettoyage) et le **papier millimétré**.
- Le plan Bloc **Applique** (Bloc et Motif) : Ligne, Bézier, Ellipse, Rectangle, quelques Formes, Sélection (déplacer, redimensionner, pivoter, miroirs, cloner, ordre), Édition des nœuds ; pièces fermées et fils.
- La coloration : pinceau un point, bombe, échange de couleur, pipette ; les palettes Tissus et Couleurs ; les colorations empilées.
- Les dispositions **Horizontal**, **Sur la pointe** et **Custom Set** ; la pose (clic, Ctrl+clic) et le glisser-déposer ; l'outil Ajuster (déplacer, redimensionner, pivoter, incliner) ; copier, coller, supprimer ; les trois calques.
- Les **bordures** : ajouter, insérer, supprimer, les tailles avec verrouillages, au moins les styles 1 à 6 ; des blocs dans les bordures.
- Les **tissus** : la bibliothèque générée (unis, rayures, pois, damiers, bruit), l'**import JPG et PNG**, l'**échelle** et le recadrage.
- L'**impression et le PDF 1:1** : un bloc, des **gabarits avec marge de couture**, le **tableau de découpe rotative**, le **métrage**, le quilt, l'aperçu avant impression, la **mosaïque sur plusieurs pages**, la mise en page.
- L'**export** PNG, JPG, SVG et PDF.
- Les bibliothèques : la structure, Blocs (quelques dizaines dans le domaine public), Tissus, Ajouter au carnet.
- L'interface en **français**, les raccourcis P0, le paquet **.exe** (NSIS et portable).

**P1 — important**
- PolyDraw (les 6 grilles) ; Pièces + Applique ; l'**image de décalque** ; les autres Formes ; Trait de pinceau et Bande.
- Les dispositions Pointe variable, **Bandes** (11 styles) et One Patch ; le Custom Set à partir d'un bloc ; le mètre ruban ; les règles du quilt ; la grille d'accrochage du quilt.
- Les bordures 7 à 22, le clonage des bordures, « Garder les bordures ».
- Les motifs au calque 2, les pochoirs au calque 3, le bloc uni, la pipette de bloc, Symétrie, empiler, centrer, découper, aligner, même taille, le **texte en applique** (polices système).
- La coupe ciblée (*fussy cut*), la rotation du tissu, Sélectionner & vaporiser, les outils Fil (couleur, style, épaisseur), le tri manuel, nuances, teintes, tons et dégradés, nos propres couleurs, Aléatoire et la correspondance au carnet.
- Le plan Image : import, redimensionner, recadrer, redresser, pivoter, retourner, ajouter comme tissu.
- La **fondation** (sections, numérotation), la modification de l'aperçu, les polices d'impression, les fiches, la recherche par fiche et par couleur, Mes favoris, l'import depuis un projet, l'import d'images multiples.
- La sauvegarde automatique, le thème clair et sombre, Créer une copie du projet.

**P2 — confort**
- Baby Blocks, Blocs variables, les pièces personnalisées du One Patch, Photo Patchwork ; les bordures auto, les styles par côté, les bordures alignées ; la bibliothèque de dispositions.
- Les broderies (notre format), les photos dans le quilt ; Serendipity (Cadre, Inclinaison, Fusion, Couper & retourner, Réduire & retourner, Kaléidoscope, Étoile fantaisie) ; Couronne, StarMaker, PosieMaker, StencilMaker.
- Les couleurs de l'image (les 8 outils), l'histogramme, luminosité et contraste ; la mise en page de photos ; l'impression d'une photo ou d'une broderie ; « Imprimer toute la bordure ».
- Les quilts rapides (les nôtres), le projet par défaut personnalisé, compresser un projet, l'écran d'accueil, la recherche par catégorie, la personnalisation de l'interface ; les formats BMP, GIF, TIF et WebP.

**P3 — bonus**
- Les effets et filtres, les symétries circulaires et carrées, la profondeur de couleur ; l'export TIF, BMP et EMF ; lier des bibliothèques (notre format) ; imprimer les fiches ; le tri automatique des couleurs et « l'ordre d'origine » ; l'assistant « style par côté » ; « Convertir en motif » direct ; la mise en page de photos enregistrée ; l'astuce du jour ; la rééditabilité des blocs Serendipity.

---

## 15. Hors périmètre (décidé par la MISSION ou par nature)
- La lecture et l'écriture des fichiers EQ8 et des anciennes versions (.PJ8, .PJ7, .PJ6, BlockBase, .blk, .fab, .qlt, .thd, .ebr, .pix) ; l'import des broderies .EXP (sauf décision contraire, Q-4.2).
- Tout contenu d'EQ8 : blocs, tissus, fils, dispositions, quilts rapides, cadres, bordures auto, broderies, photos, polices, icônes, captures.
- L'activation et la licence, l'installation en ligne, les liens vers le support et le site de l'éditeur, le partage Facebook.
- La version Mac (la cible est **Windows .exe**).
