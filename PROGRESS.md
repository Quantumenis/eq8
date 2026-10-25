# PROGRESS — Quilt Studio

> Pour reprendre après `/clear` : « lis PROGRESS.md et SPEC.md puis continue ».
> Références : `SPEC.md` (validé), `QUESTIONS.md` (toutes les recommandations ➜ adoptées), `PLAN.md` (jalons acceptés), `MISSION.md`.

## Où en est-on

| Jalon | État | Date |
|---|---|---|
| Étape 0 — SPEC | ✅ validé | 2026-10-25 |
| **M0 — Squelette, empaquetage, outillage** | ✅ terminé | 2026-10-25 |
| M1 — Projets, carnet, annuler/rétablir, unités | ⏭️ prochain | — |
| M2 … M9 | à faire | — |

## M0 — fait

- Dépôt git (branche `main`), `.gitignore` excluant `node_modules/`, `out/`, `dist/`, `.cache/`, `.venv/` et **`refs/`** (manuel sous droit d'auteur, local uniquement).
- Electron 44.7.0 + React 19.3.0 + Vite 8.3.4 + TypeScript 7.0.2 ; fenêtre « Quilt Studio — Sans titre », menus français (Fichier, Édition, Affichage > Thème, Aide > À propos), sécurité : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, navigation bloquée, CSP.
- Interface : barre du haut (logo, nom du projet), boutons des 3 plans de travail (code couleur Quilt bleu / Bloc ambre / Image vert), ruban avec les onglets du SPEC §12 (vides), palette, zone de travail, barre d'état (unités, thème Clair/Sombre/Système, version).
- Thème clair/sombre/système (jetons CSS, synchronisé avec `nativeTheme`).
- Empaquetage electron-builder 26.17.0 : `dist\Quilt Studio Setup 0.1.0.exe` (NSIS, français, choix du dossier, raccourcis) et `dist\Quilt Studio 0.1.0.exe` (portable). Icône maison générée par `tools/make-icon.mjs`.
- Bibliothèques de M3+ déjà installées et figées : clipper2-ts 2.0.1, pdf-lib 1.17.1 (+ @pdf-lib/fontkit 1.1.1), fflate 0.8.3, opentype.js 2.0.0.

### Vérifications (toutes vertes)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | 7/7 — unités (6 po = **432 pt**, 10 cm = 283,46 pt, aller-retour cm↔po < 10⁻⁹) ; clipper2-ts : carré 6 po + ¼ → **6½**, triangle demi-carré 2 po + ¼ → **2,85355** (p. 225) |
| `npm run e2e` | 5/5 — titre, 3 plans de travail, ruban, version, captures clair/sombre (`tests/e2e/__screenshots__/m0-*.png`) |
| `npm run dist` | 2 exe produits (≈ 120 Mo chacun) |
| `npm run e2e:dist` | 3/3 — les 2 exe existent ; l'app empaquetée démarre en 1,3 s ; **l'exe portable ouvre sa fenêtre** (≈ 8 s, extraction comprise) |

## Décisions prises pendant M0

- **Clipper2 → `clipper2-ts` 2.0.1** (port TypeScript pur, licence Boost BSL-1.0, déc. 2025) ; validé par les tests de décalage ci-dessus.
- Versions npm : dernière version stable publiée **avant le 2026-10-11** (≥ 2 semaines) ; `--save-exact` ; intégrité SHA-512 dans `package-lock.json` (381 entrées).
- Electron 44 n'a plus de script post-installation : le binaire s'installe par `node node_modules\electron\install.js` ; empreinte SHA-256 du zip vérifiée contre `checksums.json` (`eee30dc8…2665c`).
- electron-builder utilise `electronDist = node_modules/electron/dist` (aucun nouveau téléchargement d'Electron à l'empaquetage) ; ses outils NSIS sont en cache dans `.cache/electron-builder` (conservé, ≈ 30 Mo).
- Téléchargements envoyés à la corbeille : cache npm temporaire (283 Mo), zip Electron 44.7.0 (151 Mo), roue pypdfium2 (étape 0).
- Le préchargement (bac à sable) ne fait que des imports de types ; ses noms de canaux IPC sont vérifiés contre `src/shared/api.ts` à la compilation (`satisfies typeof IPC`).
- Identité git limitée à ce dépôt (`git config --local`).

## Reste à faire (M1, voir PLAN.md)

Modèle du projet et des 7 sections du carnet, format `.qsp` (ZIP : `project.json` + `assets/`), Assistant projet, enregistrement via « Ajouter au carnet », annuler/rétablir illimité, sauvegarde automatique (2 min) + restauration, fenêtre du carnet (vignettes, tri, suppression), préférences (unités, colorations max, restauration, palette par défaut).

## Notes pratiques

- `npm run e2e` reconstruit `out/` avant de tester ; `npm run e2e:dist` suppose `npm run dist` déjà fait.
- Mettre à jour les captures de référence après un changement d'interface voulu : `npx playwright test --project=app --update-snapshots`.
- Rendu d'une page du manuel (pour lever un doute) : `.venv\Scripts\python.exe -I tools\render_pages.py refs\EQ8_Reference_Manual.pdf refs\img 110 <pages…>`.
