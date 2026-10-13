# CLAUDE.md

City-builder isométrique mobile-first : TypeScript strict, Vite, Phaser 4 (monde) + HTML/CSS (interface).
Textes du jeu, commentaires et documentation en **français**.

## Commandes

- `npm run dev` — serveur de développement ; `/art.html` affiche tous les visuels procéduraux.
- `npm run check` — types + ESLint + Prettier + tests. À lancer avant chaque commit.
- `npm test` — tests Vitest de `src/core` (logique de jeu).

## Règles d'architecture

- `src/core` et `src/data` sont **purs** : jamais d'import de Phaser, du DOM, de `src/render` ou `src/ui`
  (ESLint l'impose).
- Toute modification de l'état passe par une méthode de `Game` (`src/core/game.ts`) qui renvoie un `Result`
  et émet des évènements ; le rendu et l'interface ne font que réagir à ces évènements.
- Monde ↔ interface : uniquement via le bus typé `AppEvents` (`src/app/context.ts`).
- Nouveau contenu : données dans `src/data/*`, visuel dans `src/render/art/*` (`ArtLibrary` échoue au
  démarrage si un bâtiment n'a pas de visuel).
- Changement du format de sauvegarde : incrémenter `SAVE_VERSION` et ajouter une migration (`src/core/save.ts`).
- Paiements : uniquement via `PaymentProvider` ; ne jamais créditer d'achat sans succès du fournisseur.

## Vérifier dans un navigateur

En développement, `window.__cityVille` expose `{ game, bus, scene }` (ex. `scene.entityScreenPoint(id)` pour
viser une construction dans un test Playwright). Tester en vue mobile (390 × 844, tactile) et ordinateur.
