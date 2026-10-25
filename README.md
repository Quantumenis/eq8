# Quilt Studio

Logiciel de conception de quilts (patchwork) pour Windows : dessin de blocs, dispositions, bordures, tissus, patrons imprimés à l'échelle exacte.

> **État : jalon M1** — projets (`.qsp`), carnet du projet, annuler/rétablir, sauvegarde automatique et préférences sont en place ; les éditeurs (blocs, quilts, tissus) arrivent aux jalons suivants (voir `PLAN.md` et `PROGRESS.md`).

## Utiliser

Deux exécutables sont produits dans `dist\` :

- **`Quilt Studio Setup 0.1.0.exe`** — installateur : choix du dossier, raccourcis Bureau et menu Démarrer, désinstallation via les Paramètres Windows.
- **`Quilt Studio 0.1.0.exe`** — version portable : double-cliquer, rien n'est installé (premier démarrage ≈ 8 s, le temps de l'extraction).

Les exécutables ne sont pas signés : au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*.

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
```

`npm run dist` télécharge une fois les outils NSIS d'electron-builder dans `.cache\` (ignoré par git).

## Organisation

| Dossier | Contenu |
|---|---|
| `src/core/` | Cœur métier en TypeScript pur (unités, géométrie, modèle…), testé sans interface |
| `src/main/` | Processus principal Electron et préchargement |
| `src/renderer/` | Interface React (textes français dans `i18n/fr.ts`) |
| `src/shared/` | Contrat entre processus principal et interface |
| `tests/unit/`, `tests/e2e/` | Tests Vitest et Playwright (captures de référence dans `tests/e2e/__screenshots__/`) |
| `tools/` | Scripts (icône, empaquetage, rendu des pages du manuel de référence) |
| `SPEC.md`, `PLAN.md`, `PROGRESS.md` | Spécification, plan par jalons, avancement |

## Données et fichiers

- **Projets** : `Documents\Quilt Studio\Projets\<nom>.qsp` — une archive ZIP (`project.json` + `assets/` des images, nommées par leur empreinte SHA-256). Un projet est autonome et transportable.
- **Préférences, sauvegarde automatique, palette par défaut** : dans le dossier de données de l'application (`%APPDATA%\Quilt Studio`). La sauvegarde automatique s'écrit toutes les 2 minutes quand le projet est modifié ; après un plantage, la relance propose de restaurer.
- Les variables d'environnement `QUILT_STUDIO_DATA_DIR`, `QUILT_STUDIO_DOCUMENTS_DIR` et `QUILT_STUDIO_AUTOSAVE_MS` redirigent ces dossiers et l'intervalle (utilisées par les tests).

## Limites connues (M1)

- Les onglets du ruban sont présents mais vides : le dessin, les quilts et les tissus arrivent aux jalons M2 à M5.
- Le carnet n'a pas encore d'éléments à créer, hormis les couleurs : « Ajouter au carnet » depuis un plan de travail attend les éditeurs. Les blocs, quilts et tissus ne sont donc créés que par le code et les tests pour l'instant, et le bouton « Modifier » du carnet est désactivé.
- Les quilts rapides, le renommage et la suppression de projets depuis l'assistant ne sont pas encore proposés.
- Le thème choisi est mémorisé par le stockage local de l'interface (et non dans les préférences).
- Exécutables non signés (pas de certificat de signature de code).
