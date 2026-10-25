# Quilt Studio

Logiciel de conception de quilts (patchwork) pour Windows : dessin de blocs, dispositions, bordures, tissus, patrons imprimés à l'échelle exacte.

> **État : jalon M0** — le squelette de l'application s'ouvre et s'installe ; les fonctions de conception arrivent aux jalons suivants (voir `PLAN.md` et `PROGRESS.md`).

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

## Limites connues (M0)

- Les onglets du ruban sont présents mais vides : aucune fonction de conception n'est encore disponible.
- Les menus Nouveau / Ouvrir / Ajouter au carnet sont désactivés jusqu'au jalon M1.
- Le thème choisi est mémorisé par le stockage local de l'interface ; il passera dans les préférences du projet au M1.
- Exécutables non signés (pas de certificat de signature de code).
