# Architecture

## Vue d'ensemble

```
            ┌──────────────────────────── navigateur / WebView ────────────────────────────┐
            │                                                                              │
  données   │   src/data ──► src/core (Game) ──évènements──► src/render (Phaser, canvas)   │
  (contenu) │                    ▲      │                          │   ▲                   │
            │                    │      └──évènements──► src/ui (HTML/CSS) │               │
            │                    │                               │   │   │               │
            │          actions ──┴───────────────────────────────┘   └───┴── bus (app/)   │
            │                                                                              │
            │   src/services : paiement · stockage · sons                                  │
            └──────────────────────────────────────────────────────────────────────────────┘
```

### `src/core` — le moteur de règles (pur)

- `Game` (`game.ts`) détient l'état (`GameState`) et expose **toutes** les actions : `place`, `move`, `sell`,
  `buildStep`, `collectRent`, `plant`, `harvest`, `supply`, `collectBusiness`, `speedUp`, `buyExpansion`,
  `buyCashOffer`, `grantStoreProduct`…
- Chaque action renvoie un `Result` (`{ ok: true, … }` ou `{ ok: false, reason }`) : l'interface traduit la
  raison en message (`ui/messages.ts`).
- Les changements sont diffusés par `game.events` (`change`, `entityAdded`, `reward`, `levelUp`,
  `questCompleted`…). Le rendu et l'interface ne modifient jamais l'état directement.
- Le temps est injecté (`Clock`) : les minuteurs sont des horodatages, donc la progression hors-ligne est
  naturelle et les tests utilisent une horloge factice.
- Aucune dépendance à Phaser ni au DOM (règle ESLint). Ce code pourra tourner côté serveur pour valider les
  actions (anti-triche) le jour où la sauvegarde passera en ligne.

### `src/data` — contenu et équilibrage

Tout ce qui se règle sans toucher au code : `buildings.ts`, `crops.ts`, `quests.ts`, `products.ts`,
`balance.ts` (durées, courbe d'XP, énergie, prix des agrandissements), `startingTown.ts`.

### `src/render` — le monde (Phaser 4)

- `WorldScene` : sol, constructions, bulles d'état, placement (construction « fantôme »), sélection, aides
  visuelles, gestes tactiles.
- `CameraController` : glisser avec inertie, pincement, molette, limites de la carte. Le canevas est rendu à la
  densité de l'écran (plafonnée à 2) pour rester net sur mobile.
- `Effects`, `WalkerSystem` : effets éphémères et habitants décoratifs.
- `art/` : **tous les visuels sont dessinés par le code** (Canvas 2D) au démarrage via `IsoPainter`
  (projection isométrique 2:1, cases de 128 × 64). `ArtLibrary` les enregistre comme textures Phaser et fournit
  des vignettes pour l'interface. Remplacer par de vraies illustrations = remplacer ces textures par des images
  chargées, sans toucher au reste.

### `src/ui` — l'interface (HTML/CSS)

Interface en DOM (et non dans le canevas) : texte net, mise en page fluide, accessibilité, défilement natif.
`UI.ts` orchestre les composants : `Hud`, `QuestTracker`, `BuildMenu`, `CropPicker`, `Bubble`, `Shop`,
`Modals`, `Toasts`, `FlyingRewards`.

### `src/app` — la colle

- `context.ts` : `AppContext` (jeu, bus, visuels, paiement, sons) et la liste typée des évènements du **bus**
  monde ↔ interface (`world:*`, `ui:*`, `fx:*`).
- `sounds.ts` : branche les évènements sur les bruitages.

### `src/services`

- `payments/` : interface `PaymentProvider` + `MockPaymentProvider` (voir [MONETIZATION.md](MONETIZATION.md)).
- `storage.ts` : `localStorage` tolérant aux pannes (bascule en mémoire si indisponible).
- `sound.ts` : bruitages synthétisés en Web Audio (aucun fichier).

## Flux d'une action

1. Le joueur touche une maison → `WorldScene.handleTap` trouve la construction (test au pixel près).
2. `game.primaryAction(entity)` indique quoi faire (`collectRent`) → `game.collectRent(id)`.
3. `Game` dépense l'énergie, crédite les pièces, émet `reward`, `entityUpdated`, `gameplay`, `change`.
4. `WorldScene` affiche « +30 », fait jaillir des pièces et émet `fx:reward` ; l'interface fait voler les
   icônes vers la barre de ressources ; les objectifs progressent ; la sauvegarde est programmée.

## Sauvegarde

`core/save.ts` : JSON versionné `{ version, savedAt, state }` sous la clé `city-ville:save`. Pour changer le
format : incrémenter `SAVE_VERSION` (`core/newGame.ts`) et ajouter une migration dans `MIGRATIONS`.
Sauvegarde 0,8 s après chaque changement, et quand l'onglet passe en arrière-plan.

## Ajouter du contenu

- **Bâtiment** : une entrée dans `data/buildings.ts` + un visuel dans `render/art/buildings.ts` (ou
  `decorations.ts`). `ArtLibrary` vérifie au démarrage que chaque bâtiment a un visuel.
- **Culture** : `data/crops.ts` (+ un cas dans `cropOverlay` de `render/art/terrain.ts` pour l'aspect mûr).
- **Objectif** : `data/quests.ts` (prérequis, tâches, libellés, récompense).

## Qualité

- `npm run check` : TypeScript strict, ESLint, Prettier, tests Vitest (logique de jeu).
- CI GitHub Actions (`.github/workflows/ci.yml`) sur chaque push et pull request.
- En développement, `window.__cityVille` expose `{ game, bus, scene }` pour les tests de bout en bout.

## Plateformes

Aujourd'hui : web (navigateur mobile et ordinateur, installable en PWA). Pour les stores : empaqueter avec
**Capacitor** (Android / iOS) — le build Vite (`base: './'`) est déjà compatible. Voir [ROADMAP.md](ROADMAP.md).
