# PROGRESS — Quilt Studio

> Pour reprendre après `/clear` : « lis PROGRESS.md, PLAN.md et SPEC.md, puis lance le M2 ».
> Références : `SPEC.md` (validé), `QUESTIONS.md` (toutes les recommandations ➜ adoptées), `PLAN.md` (jalons acceptés), `MISSION.md`.

## Où en est-on

| Jalon | État | Date |
|---|---|---|
| Étape 0 — SPEC | ✅ validé | 2026-10-25 |
| M0 — Squelette, empaquetage, outillage | ✅ terminé | 2026-10-25 |
| **M1 — Projets, carnet, annuler/rétablir, unités** | ✅ terminé | 2026-10-26 |
| M2 — Éditeur de blocs EasyDraw (dessin) | ⏭️ prochain | — |
| M3 … M9 | à faire | — |

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

## Reste à faire — M2 (voir PLAN.md)

Éditeur de blocs EasyDraw : moteur de scène Canvas (zoom, défilement), barre de précision et accrochage, outils Ligne / Arc / Grille, sélection et symétries, édition des nœuds. Le plan Bloc affichera alors son premier contenu, et « Ajouter au carnet » aura enfin un élément à ajouter (il appellera `addColoredBlock` puis `afterAddToSketchbook`).

## Notes pratiques

- `npm run e2e` reconstruit `out/` avant de tester ; `npm run e2e:dist` suppose `npm run dist` déjà fait.
- Mettre à jour les captures de référence après un changement d'interface voulu : **supprimer** les PNG concernés (ou `npx playwright test --project=app --update-snapshots`) puis relancer — vérifier l'image avant de valider.
- La fenêtre modale masque la barre d'outils : dans les tests, annuler/rétablir se pilote par `menuCommand(app, "undo")` quand le carnet est ouvert.
- Rendu d'une page du manuel (pour lever un doute) : `.venv\Scripts\python.exe -I tools\render_pages.py refs\EQ8_Reference_Manual.pdf refs\img 110 <pages…>`.
- Versions figées et choix de M0 (Electron 44.7.0, React 19.3.0, Vite 8.3.4, TypeScript 7.0.2, electron-builder 26.17.0, clipper2-ts 2.0.1, pdf-lib 1.17.1, fflate 0.8.3, opentype.js 2.0.0) : inchangés.
