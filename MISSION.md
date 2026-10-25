## Mission

Crée une **réimplémentation « clean-room »** du logiciel de conception de quilts **Electric Quilt 8**
(« EQ8 »), avec le plus de fonctionnalités possible, sous forme d'**application Windows (.exe)**.
Ce logiciel permet de dessiner des blocs de patchwork, d'assembler des quilts (dispositions,
bordures), de colorer avec des tissus, et d'imprimer des patrons. Le produit final porte **un nom
différent** de l'original (propose-moi 3 noms, je choisis ; rien qui rappelle « Electric Quilt »).

## Règles non négociables

1. **Clean-room** : aucun code, aucune image, aucun tissu, aucune bibliothèque de blocs, aucune
   police, aucune icône ni capture copiés depuis EQ8. Tu t'appuies sur les manuels que je te
   fournis (pour savoir **quoi** faire) et sur ta propre conception (pour **comment**).
   Les bibliothèques de contenu (blocs, tissus, motifs) sont à créer toi-même : quelques dizaines de
   blocs classiques du domaine public (Nine Patch, Log Cabin, Ohio Star, Flying Geese…) dessinés
   par code, et des tissus générés (unis, rayures, pois, damiers, bruit) plus l'import de mes images.
2. **Ne devine pas.** Si le manuel ne tranche pas, écris la question dans `QUESTIONS.md` et pose-la-moi.
3. **N'utilise pas REA.** Il n'y a aucun binaire à analyser, seulement des manuels.
4. Demande-moi l'accord avant d'installer un outil ou de télécharger quoi que ce soit, et
   vérifie les empreintes (SHA-256) quand elles existent. Supprime (corbeille) ce que tu as
   téléchargé une fois installé.
5. Le format de fichier du projet est **le nôtre** (JSON versionné + images). Ne tente pas de lire
   ni d'écrire les fichiers d'EQ8.

## Étape 0 — Digérer les manuels (avant tout code)

- Les PDF sont dans `refs\` : `EQ8_Reference_Manual.pdf` (guide complet) et
  `EQ8-QuickStartGuide-web.pdf`. Le lecteur de PDF intégré ne marche pas sur cette machine :
  utilise **`pdftotext -layout`** (déjà installé) pour extraire le texte dans `refs\text\`.
- Les captures et schémas du manuel peuvent être utiles : regarde-les seulement quand le texte
  est ambigu (convertis la page en image si un outil le permet, sinon demande-moi).
- Produis un fichier **`SPEC.md`** condensé et structuré par chapitre du manuel :
  1. Projets et carnet de croquis (Project Sketchbook) ; 2. Dispositions de quilts ;
  3. Bordures ; 4. Quilts avec blocs, photos, broderies ; 5. Tissus, couleurs, fils ;
  6. Dessin de blocs ; 7. Photos et images de tissus ; 8. Bibliothèques ; 9. Impression ;
  10. Export ; plus raccourcis clavier et barres d'outils.
  Pour chaque fonction : ce qu'elle fait, ses paramètres et plages, ses valeurs par défaut, ses
  interactions. Marque « À VÉRIFIER » ce qui est ambigu. Ajoute une table de **priorités**
  (P0 indispensable, P1 important, P2 confort, P3 bonus).
- Arrête-toi et attends ma validation de `SPEC.md`. Ensuite, travaille **à partir de `SPEC.md`**,
  pas des PDF (économie de tokens), sauf pour lever un doute précis.

## Pile technique recommandée (conteste-la seulement avec une bonne raison)

- **Electron + TypeScript + React**, empaqueté en `.exe` avec **electron-builder**
  (installateur NSIS + version portable). Node.js 24 est déjà installé ; pas besoin de Visual Studio.
- Dessin 2D : **Canvas/SVG** avec un moteur de scène maison ou Konva/Paper.js ; ton choix, justifié.
- Géométrie : **clipper2 / polygon-clipping** pour découper un bloc en pièces (patches) à partir des
  lignes et arcs dessinés, détecter les zones fermées, faire les unions/différences et calculer
  les marges de couture. C'est le cœur du logiciel : soigne-le et teste-le beaucoup.
- Impression et export : **PDF vectoriel à l'échelle 1:1** (pdf-lib ou PDFKit) pour les patrons et
  gabarits, export PNG/JPG/SVG ; impression via le dialogue Windows.
- Tests : **Vitest** (géométrie, calculs de métrage) et **Playwright** pour piloter l'application
  Electron et vérifier l'interface avec des captures.

## Fonctionnalités visées (le détail vient de SPEC.md)

- **Projets** : créer/ouvrir/enregistrer/dupliquer, carnet de croquis (quilts, blocs, photos,
  tissus), notes, annuler/rétablir illimité, sauvegarde automatique, unités pouces/cm.
- **Dessin de blocs** : grille réglable, outils ligne, arc, courbe, polygone, rectangle, cercle ;
  accrochage (snap) ; détection automatique des pièces ; applique (formes superposées) ;
  motifs et pochoirs ; texte ; rotation, miroir, symétrie ; copier/coller ; calques.
- **Coloration** : pot de peinture, pinceau, pipette, échange de couleurs, aléatoire (randomize),
  « fussy cut » (centrer un motif du tissu dans une pièce), palettes, nuances et teintes.
- **Quilts** : dispositions (blocs côte à côte, sur la pointe, avec lattis/sashing, bandes
  horizontales/verticales, one-patch, sets personnalisés), nombre de blocs et tailles, blocs
  unis, rotation/miroir de chaque bloc, bordures multiples (styles, coins, côtés différents),
  broderie et photos dans le quilt.
- **Tissus** : bibliothèque, import d'images (JPG/PNG), échelle et rotation du motif, fils/thread.
- **Impression** : patrons de blocs à l'échelle, gabarits avec marges de couture, **tableaux de
  coupe au cutter rotatif**, bordures, **calcul du métrage de tissu (yardage)**, aperçu avant
  impression, mosaïque sur plusieurs pages.
- **Export** : images, PDF.
- Interface en **français**, thème clair/sombre, raccourcis clavier du manuel, barres d'outils.

## Méthode de travail (pour ne pas manquer de tokens)

- Après `SPEC.md`, propose un **plan par jalons** et attends mon OK. Exemple :
  M0 squelette qui s'ouvre et se package en .exe → M1 projets et enregistrement →
  M2 éditeur de blocs (lignes, grille, snap) → M3 détection des pièces + coloration →
  M4 tissus et import d'images → M5 quilt : dispositions et placement des blocs →
  M6 bordures → M7 impression/PDF à l'échelle + métrage → M8 applique, photos, broderie →
  M9 finitions, performances, installateur.
- À la fin de **chaque** jalon : build, tests, **commit git**, mise à jour de `PROGRESS.md`
  (fait / reste / décisions). Je pourrai alors faire `/clear` sans rien perdre ; je reprendrai
  avec « lis PROGRESS.md et SPEC.md puis continue ».
- Vérifie par la mesure : les patrons imprimés doivent faire **exactement** la taille annoncée
  (test automatique : un carré de 6 po = 432 points PDF), les calculs de métrage doivent être
  testés sur des cas à la main.
- Lis seulement les fichiers utiles. Ne relis pas tout le projet à chaque étape.
- Livrable : `.exe` fonctionnel, `README.md` (utilisation, compilation, limites connues).
