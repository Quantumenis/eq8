# Quilt Studio

Logiciel de conception de quilts (patchwork) pour Windows : dessin de blocs (pièces et applique), dispositions, bordures, tissus, photos, broderies, et patrons imprimés **à l'échelle exacte** (PDF 1:1). Interface en français, thème clair et sombre, unités en pouces ou en centimètres.

Tout le contenu intégré (blocs, motifs, pochoirs, tissus, fils, broderies, dispositions, quilts rapides, bordures automatiques) est **créé pour ce projet** : aucun fichier, aucune image ni aucune donnée d'un autre logiciel n'est utilisé (voir `MISSION.md`).

## Installer et lancer

Deux exécutables sont produits dans `dist\` (voir « Compiler ») :

- **`Quilt Studio Setup 0.1.0.exe`** — installateur : choix du dossier d'installation, raccourcis Bureau et menu Démarrer, association des fichiers `.qsp` (un double-clic ouvre le projet), désinstallation par les Paramètres Windows. L'installation silencieuse (`/S /D=dossier`) est vérifiée par `tools\test-installer.ps1`.
- **`Quilt Studio 0.1.0.exe`** — version portable : double-cliquer, rien n'est installé (premier démarrage ≈ 8 s, le temps de l'extraction).

Les exécutables ne sont pas signés : au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*.

Les projets sont enregistrés dans `Documents\Quilt Studio\Projets\` (`.qsp`), les favoris dans `Documents\Quilt Studio\Favoris\`, les exports dans `Documents\Quilt Studio\Exports\`.

## Utiliser

L'application a **trois plans de travail** (en haut à droite) et un **ruban** d'onglets qui change avec le plan. Le bouton *Carnet* ouvre le carnet du projet (quilts, blocs, motifs, pochoirs, tissus, couleurs, photos, fils, broderies), *Accueil* l'écran de départ (quilts rapides, astuce du jour), *Aide* (ou F1) un résumé de ce qui suit.

### Plan Bloc

- **NOUVEAU BLOC** : EasyDraw (on dessine les coutures), PolyDraw (pièces entières sur l'une des 6 grilles), Applique — *Bloc* (avec fond) ou *Motif* (sans fond) —, et les mélanges *Easy + Applique* et *Poly + Applique* (deux calques).
- **DESSIN** : lignes, arcs, grille, nœuds (EasyDraw) ; PolyLigne, PolyArc, cloner et pivoter (PolyDraw) ; Ligne, Bézier, main levée, trait de pinceau, bande, ellipse, rectangle, formes, StarMaker, PosieMaker, StencilMaker, couronne, édition des nœuds (applique). Une **image de décalque** est disponible dans tous les styles.
- **COLORATION** : tissu, couleur ou fil par pièce ou par couture ; pinceau, bombe, échange, coupe ciblée, pipette ; jusqu'à 10 colorations par bloc.
- **IMPRIMER & EXPORTER** : bloc, gabarits (avec marge de couture et lettres), fondation (paper piecing), découpe rotative ; export PNG, JPG, SVG, PDF.

### Plan Quilt

- **NOUVEAU QUILT** (10 dispositions) → **DISPOSITION** → **BORDURES** (22 styles, tailles par côté) → **DESIGN** (poser des blocs au calque 1, des motifs au calque 2, des pochoirs au calque 3 ; texte en applique ; photos ; broderies ; Photo Patchwork sur un One Patch) → **IMPRIMER & EXPORTER** (quilt, **métrage**, bloc, gabarits, fondation, découpe rotative, photo, broderie).
- *Fichier › Ouvrir un quilt rapide…* et *Bibliothèques › Dispositions…* donnent des points de départ.

### Plan Image

Importer une image, mettre un tissu à l'échelle, recadrer, redresser, pivoter, redimensionner ; **Couleurs…** (équilibre, rouge/vert/bleu, teinte/saturation/luminosité, coloriser, accent, carte des teintes, mélangeur, gamme de couleurs) et **Histogramme…** (égaliser, préréglages, luminosité/contraste) avec aperçu avant/après ; **Mise en page de photos…** (une page, des photos du carnet, impression à l'échelle) ; *Ajouter comme tissu* ou *Enregistrer dans Photos*.

### Bibliothèques

*Bibliothèques › Blocs / Tissus / Fils / Broderies / Dispositions*. Recherche par fiche (nom, référence, notes ; casse et accents ignorés), par catégories (jusqu'à 20, toutes obligatoires) et par couleur ; import depuis un autre projet ; **Mes favoris** (bibliothèques personnelles, dans un dossier séparé des projets).

### Imprimer à l'échelle

Tout passe par un **PDF à 100 %** : gabarits, fondations, quilt, photos. Avant un gros tirage, imprimez la **page de test** (*Fichier › Mise en page…*) : un carré de 1 po (ou 2 cm) doit mesurer 1 po (ou 2 cm).

### Raccourcis utiles

Ctrl+Z / Ctrl+Y annuler et rétablir · Ctrl+S enregistrer · Ctrl+Maj+A ajouter au carnet · Ctrl+B carnet · Ctrl+L bibliothèque de blocs · Ctrl+A tout sélectionner · Suppr supprimer · Échap abandonner le geste · F1 aide. Les onglets du ruban se parcourent aux flèches.

Dans *Préférences › Affichage* : ruban sur le côté, petites icônes, astuces des palettes masquées, accueil au démarrage.

## Compiler

Prérequis : Windows 10/11 x64, Node.js 24, Git.

```powershell
npm ci                 # dépendances figées (intégrité SHA-512 vérifiée par npm)
node node_modules\electron\install.js   # binaire Electron (empreinte SHA-256 vérifiée)
npm start              # construit puis lance l'application
npm run typecheck      # vérification de types
npm test               # tests unitaires (Vitest)
npm run e2e            # tests de l'interface (Playwright + Electron)
npm run dist           # installateur NSIS + exe portable dans dist\
npm run e2e:dist       # tests de l'application empaquetée et de l'exe portable
powershell -File tools\test-installer.ps1   # installation silencieuse, .qsp, désinstallation
```

`npm run dist` télécharge une fois les outils NSIS d'electron-builder dans `.cache\` (ignoré par git). Les versions des dépendances sont figées (voir `PLAN.md` § 2) ; rien n'est installé globalement.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/core/` | Cœur métier en TypeScript pur, sans DOM, très testé : modèle du projet, géométrie (planarisation, Béziers en arcs), dessin (EasyDraw, PolyDraw, applique), quilt, bordures, impression (liste d'affichage → PDF, SVG, écran), image, bibliothèques, texte |
| `src/main/` | Processus principal Electron (fichiers, dialogues, impression, polices) et préchargement |
| `src/renderer/` | Interface React (textes français dans `i18n/`) |
| `src/shared/` | Contrat entre processus principal et interface |
| `tests/unit/`, `tests/e2e/` | Vitest et Playwright (captures de référence dans `tests/e2e/__screenshots__/`) |
| `tools/` | Construction de l'installateur, icône, test de l'installateur |

Format de projet `.qsp` : une archive ZIP avec `project.json` (versionné, `formatVersion`) et `assets/` (images nommées par leur empreinte SHA-256).

## Limites connues

- **Windows seulement** ; exécutables non signés.
- **Serendipity** (blocs générés : cadre, inclinaison, fusion, couper & retourner, kaléidoscope, étoile fantaisie), Baby Blocks, Blocs variables, pièces personnalisées du One Patch, effets et filtres d'image, symétries d'image, profondeur de couleur, exports TIF/BMP/EMF : non faits (lots optionnels).
- **Formats d'un autre logiciel** (blocs, quilts, tissus, broderies .EXP…) : hors périmètre.
- Les formes de l'applique sont converties en tracés dès leur création (pas de forme paramétrique rééditable) ; le recadrage du décalque et de la photo se fait par saisie de nombres ; la mise en page de photos n'est pas enregistrée dans le projet.
- Les photos du quilt : au calque 1 seulement en Custom Set (pas dans l'emplacement d'une disposition Horizontal) ; rotation et miroir de bloc ne s'appliquent pas aux photos.
- L'impression par le dialogue de Windows n'est pas testée automatiquement (le même chemin l'est en PDF) : essayez-la une fois avec la page de test.
- La géométrie de certains styles (bordures, grilles PolyDraw, formes) est reconstituée d'après la description du logiciel de référence : à comparer à vos attentes (`SPEC.md`, `QUESTIONS.md`).
