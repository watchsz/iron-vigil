# Iron Vigil — Plan

Tower defense 3D, rendu PSX, dark fantasy médiévale (ambiance « Berserk » : ciel d'éclipse, forteresses de pierre noire, mercenaires, démons difformes).
Univers **original** : aucun personnage, nom, symbole ou design repris de Berserk.

---

## 1. Choix techniques

| Besoin | Choix | Pourquoi |
|---|---|---|
| Moteur | **Three.js + TypeScript + Vite** | Tourne dans le navigateur → testable e2e avec Playwright, déployable en statique, dockerisable trivialement. Le rendu PSX se fait en quelques shaders, pas besoin d'un gros moteur. |
| Format 3D | **glTF binaire (.glb)** | Export natif Blender, chargé nativement par Three.js, animations incluses. |
| Création assets | **Blender 5.3 + blender-mcp** (ahujasid) | Je modélise en direct dans ton Blender, tu vois et tu commentes. |
| Export assets | **Blender headless dans Docker** + `gltf-transform` | Les `.blend` sont la source, les `.glb` sont générés de façon reproductible (même en CI). |
| Gros binaires | **Git LFS** (`.blend`, `.png`, `.wav`) | Le repo reste léger. |
| UI | HTML/CSS par-dessus le canvas | Pas de framework : quelques menus, un HUD. |
| Audio | Web Audio via `THREE.Audio` | Déjà dans Three.js. |
| Sauvegarde | `localStorage` | Progression de campagne seulement. |
| Tests unitaires | **Vitest** | Même config que Vite. |
| Tests e2e | **Playwright** (image Docker officielle) | WebGL via SwiftShader en headless, screenshots comparables. |
| CI/CD | **GitHub Actions** → **GitHub Pages** | Gratuit, chaque merge sur `main` = jeu jouable en ligne. |

Écartés : Godot (export web + e2e beaucoup plus pénibles), React (inutile pour un HUD), lib ECS (quelques centaines d'entités max, des tableaux suffisent — à revoir si le profiler dit le contraire).

---

## 2. Architecture

Règle centrale : **la simulation ne connaît pas Three.js**. Elle est pure, déterministe (pas fixe 30 Hz, RNG seedé), donc testable sans navigateur et rejouable à l'identique en e2e.

```
iron-vigil/
├─ src/
│  ├─ sim/              # Logique pure, zéro import Three.js/DOM
│  │  ├─ state.ts       # GameState : grille, tours, ennemis, projectiles, or, vies, vague
│  │  ├─ step.ts        # step(state, inputs) -> state  (tick fixe 1/30 s)
│  │  ├─ pathing.ts     # Flow field BFS depuis la porte ; refuse un placement qui bloque le chemin
│  │  ├─ combat.ts      # Ciblage, dégâts, effets (saignement, brûlure, lenteur)
│  │  ├─ waves.ts       # Spawner piloté par les données
│  │  └─ rng.ts         # PRNG seedé (mulberry32)
│  ├─ data/             # Contenu typé en TS : towers.ts, enemies.ts, levels/*.ts
│  ├─ render/           # Three.js : lit le GameState, ne le modifie jamais
│  │  ├─ psx/           # Shaders + post-process PSX
│  │  ├─ scene.ts       # Caméra, lumières, brouillard, chargement des .glb
│  │  └─ views/         # Une vue par type d'entité (interpolation entre ticks)
│  ├─ ui/               # HUD, menus, placement de tours (HTML/CSS)
│  ├─ input.ts          # Souris/clavier -> commandes sim (PlaceTower, Upgrade, StartWave…)
│  ├─ main.ts           # Boucle : accumulateur pas fixe -> sim.step, puis render
│  └─ testHooks.ts      # window.__game (seed, pause, avance N ticks, lecture état) — build test uniquement
├─ assets-src/          # .blend + textures sources (LFS)
├─ public/assets/       # .glb générés (ignorés par git, produits par le conteneur assets)
├─ tools/blender/export.py   # Export headless : applique modifiers, vérifie budget polys, exporte .glb
├─ tests/
│  ├─ unit/             # Vitest sur src/sim
│  └─ e2e/              # Playwright
├─ docker/              # Dockerfiles
├─ docker-compose.yml
└─ .github/workflows/ci.yml
```

### Flux d'une frame
`input → commandes → sim.step (0..n ticks fixes) → render (interpolé) → post-process PSX → écran`

### Gameplay de base
- Grille sur le terrain ; les ennemis suivent un flow field vers la porte du donjon/forteresse.
- Le joueur peut faire du « mazing » (placement qui allonge le chemin), jamais le bloquer.
- Économie : or par kill + bonus de fin de vague ; vente à 70 %.
- Tours de départ (noms provisoires) : **Arbalétriers**, **Bombarde**, **Brasier** (huile/feu), **Chapelle** (anti-démons, ralentit).
- Ennemis de départ : **Goule**, **Chien-démon** (rapide), **Chevalier déchu** (blindé), **Apôtre** (boss, plusieurs phases).

---

## 3. Rendu PSX

Tout dans `src/render/psx/`, réglable en direct via un panneau debug :
1. **Basse résolution** : rendu dans un `WebGLRenderTarget` 320×240 (ou 426×240 en 16:9), upscale en `NearestFilter`.
2. **Vertex snapping** : positions écran arrondies dans le vertex shader (le « tremblement » PS1).
3. **Mapping affine** : interpolation des UV sans correction de perspective (option, avec subdivision des grands sols pour limiter la casse).
4. **Textures 64–128 px**, `NearestFilter`, pas de mipmaps.
5. **Couleur 15 bits + dithering** ordonné 4×4 en post-process.
6. **Brouillard** linéaire fort, ciel d'éclipse rouge/noir, éclairage par vertex (Gouraud).
7. **Budgets** (vérifiés par `export.py`, l'export échoue si dépassé) : tour ≤ 1200 tris, ennemi ≤ 900, boss ≤ 1500, décor ≤ 1500 par pièce.

---

## 4. Pipeline assets (Blender + MCP)

1. **Concept** : on se met d'accord sur la liste et la palette (tu valides).
2. **Modélisation live** : je modélise via blender-mcp dans ton Blender ouvert. Tu regardes et tu commentes ; je fais **une modification à la fois**.
3. **Conventions** : 1 fichier `.blend` par asset dans `assets-src/`, échelle 1 unité = 1 m, origine au sol, nom d'objet = nom d'export, actions nommées `idle`, `walk`, `attack`, `die`.
4. **Texturing** : textures peintes basse déf (atlas 128 px par asset), palette limitée commune.
5. **Animation** : armatures simples, peu d'os ; les animations sont lues en pas saccadés (12 fps) côté jeu pour le look PSX.
6. **Export** : `docker compose run assets` → Blender headless exporte tous les `.blend` en `.glb` dans `public/assets/`, puis `gltf-transform` optimise.

---

## 5. Docker

| Service (compose) | Image | Rôle |
|---|---|---|
| `dev` | `node:22-bookworm-slim` | `vite` avec hot reload, port 5173 |
| `assets` | Debian + Blender 5.3 Linux officiel (version épinglée) | Export `.blend` → `.glb` headless |
| `e2e` | `mcr.microsoft.com/playwright` (version épinglée = version du package) | Tests e2e contre le build |
| `web` | `nginx:alpine` (multi-stage depuis node) | Build de prod servi en statique |

Blender de bureau (pour toi + MCP) reste sur ton Mac : le MCP a besoin de l'interface pour que tu suives.

---

## 6. Tests

- **Unitaires (Vitest)** sur `src/sim` : pathing (placement bloquant refusé, chemin le plus court), dégâts/armure, économie, vagues. Rapides, lancés à chaque commit.
- **Simulation headless** : une partie complète jouée par un script (seed fixe, placement scripté) doit donner le même résultat à chaque fois → détecte les régressions de gameplay.
- **E2E (Playwright)**, via `window.__game` :
  - le jeu charge, aucune erreur console, les `.glb` se chargent ;
  - placer une tour via un clic réel sur le canvas, l'or baisse ;
  - lancer une vague, avancer N ticks, les ennemis meurent, la vague se termine ;
  - défaite quand les vies tombent à 0 ; sauvegarde/rechargement de la progression ;
  - **régression visuelle** : screenshot du rendu PSX à un tick figé (seed + pause), comparé à la référence.
- **Assets** : `export.py` échoue si budget de polys, noms d'actions ou échelle incorrects.

---

## 7. GitHub & CI

- Repo privé `iron-vigil`, branche `main` protégée, travail en PR.
- `ci.yml` : typecheck + lint → Vitest → build → export assets (conteneur Blender, mis en cache) → Playwright en conteneur → upload du rapport Playwright en artefact → déploiement GitHub Pages sur `main`.
- Issues GitHub = backlog, un milestone par phase ci-dessous.

---

## 8. Feuille de route

| Phase | Contenu | Fini quand |
|---|---|---|
| **0. Socle** | Vite/TS, Docker compose, CI, Pages, Playwright « le jeu charge » | Le pipeline est vert et le jeu vide est en ligne |
| **1. Greybox** | Sim complète avec cubes : 1 carte, 2 tours, 2 ennemis, 5 vagues, HUD minimal | On peut gagner/perdre ; tests unitaires + e2e gameplay verts |
| **2. Look PSX** | Post-process, shaders, brouillard, ciel, panneau de réglage | Tu valides le rendu sur la greybox |
| **3. Premiers assets** | Via MCP : terrain/forteresse, Arbalétriers, Goule ; pipeline export Docker | Les cubes sont remplacés, budgets vérifiés |
| **4. Contenu** | 4 tours ×3 niveaux d'amélioration, 4 ennemis + boss Apôtre, 3 cartes, audio | Campagne courte jouable du début à la fin |
| **5. Polish** | Effets (sang, braises), écran-titre, équilibrage, perf | Tests de régression visuelle stables |

Prochaine étape proposée : **phase 0**.
