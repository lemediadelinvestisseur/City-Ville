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
            │   src/services : paiement · stockage · sons · en ligne · natif · notifications │
            │   src/i18n : traductions (11 langues, chargées à la demande)                 │
            └──────────────────────────────────────────────────┬───────────────────────────┘
                                                               │ (si VITE_CONVEX_URL)
                                                    convex/ : serveur (comptes, sauvegarde,
                                                    voisins, marché, chat, rôles, admin)
```

### `src/core` — le moteur de règles (pur)

- `Game` (`game.ts`) détient l'état (`GameState`) et expose **toutes** les actions : `place`, `move`, `sell`,
  `finishBuild`, `collectRent`, `plant`, `harvest`, `supply`, `collectBusiness`, `speedUp`, `buyExpansion`,
  `buyCashOffer`, `grantStoreProduct`…
- Chaque action renvoie un `Result` (`{ ok: true, … }` ou `{ ok: false, reason }`) : l'interface traduit la
  raison en message (`ui/messages.ts`).
- Les changements sont diffusés par `game.events` (`change`, `entityAdded`, `reward`, `levelUp`,
  `questCompleted`…). Le rendu et l'interface ne modifient jamais l'état directement.
- Le temps est injecté (`Clock`) : les minuteurs sont des horodatages, donc la progression hors-ligne est
  naturelle et les tests utilisent une horloge factice.
- Aucune dépendance à Phaser ni au DOM (règle ESLint). Ce code pourra tourner côté serveur pour valider les
  actions (anti-triche) le jour où la sauvegarde passera en ligne.
- **Défis du jour** (`daily.ts`, modèles dans `data/daily.ts`) : trois tâches tirées chaque jour (minuit
  local) selon le niveau et les constructions, récompenses à réclamer et bonus (`claimDaily`,
  `claimDailyBonus`).
- **Attentes terminées** : `tick()` émet `ready` (culture mûre, chantier fini, bateau rentré, clients servis) ;
  `readySince()` sert au résumé « pendant votre absence ».
- **Rappels** (`reminders.ts`) : liste des notifications à programmer (regroupées, heures calmes 22 h – 8 h).
- `chat.ts` : règles du chat partagées avec le serveur (longueur, cadence, liens et insultes masqués).

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
- Paysage (`MapLayer`) : sols peints pixel par pixel (`art/ground.ts`, motifs périodiques sans couture),
  rivages et bordures d'herbe en transitions arrondies, teintes douces aux coins des cases (prairie, sous-bois,
  profondeur de l'eau : `groundStyle.ts`), arbres et sous-bois (`art/nature.ts`), montagnes rendues depuis un
  relief (`art/mountains.ts`). Ces visuels sont dessinés à la demande et regroupés dans des atlas
  (`TerrainAtlas`) pour ne coûter que quelques appels de dessin ; les petits détails sont masqués quand on
  dézoome.

### `src/ui` — l'interface (HTML/CSS)

Interface en DOM (et non dans le canevas) : texte net, mise en page fluide, accessibilité, défilement natif.
`UI.ts` orchestre les composants : `Hud`, `QuestTracker`, `BuildMenu`, `CropPicker`, `Bubble`, `Shop`,
`Modals`, `Toasts`, `FlyingRewards`, et à droite les raccourcis `SideButtons` : `DailyPanel` (défis du jour),
`InboxPanel` (centre de notifications) et `ChatPanel` (chat). `Notices` transforme les évènements du jeu en
messages en jeu (regroupés) rangés dans le centre de notifications ; `NotificationsUi` propose d'activer les
notifications de l'appareil au bon moment et gère leurs réglages.

### `src/i18n` — les langues

- `fr.ts` : tous les textes de l'interface en français (langue source), `{paramètres}` et pluriels
  (`clé#one` / `clé#other`). `t('clé', { … })`, `tn('clé', n)`, `tParts` (texte avec icônes).
- `locales/<code>.ts` : une langue = un fichier (textes + contenu : bâtiments, cultures, objectifs, produits,
  enseignes). TypeScript impose toutes les clés ; `i18n.test.ts` vérifie paramètres, pluriels et contenu.
- `content.ts` : noms traduits du contenu (`buildingName`, `questTitle`…) ; les données restent en français.
- La langue est choisie à la première ouverture (proposée d'après l'appareil), modifiable dans les
  réglages ; elle est chargée avant l'interface (un changement recharge le jeu).
- **Ajouter une langue** : une entrée dans `data/languages.ts` + `locales/<code>.ts`. **Ajouter un texte** : la
  clé dans `fr.ts` puis dans chaque fichier de `locales/` (sinon `npm run check` échoue).

### `src/app` — la colle

- `context.ts` : `AppContext` (jeu, bus, visuels, paiement, sons) et la liste typée des évènements du **bus**
  monde ↔ interface (`world:*`, `ui:*`, `fx:*`).
- `sounds.ts` : branche les évènements sur les bruitages.

### `src/services`

- `payments/` : interface `PaymentProvider` + `MockPaymentProvider` (voir [MONETIZATION.md](MONETIZATION.md)).
- `storage.ts` : `localStorage` tolérant aux pannes (bascule en mémoire si indisponible).
- `sound.ts` : bruitages synthétisés en Web Audio (aucun fichier).
- `online/` : interface `Backend` (compte, sauvegarde, voisins, classement, marché, mesures) avec deux
  implémentations : `ConvexBackend` (serveur) et `LocalBackend` (démo hors-ligne, voisins fictifs dont les
  villes sont générées par le joueur simulé). `app/online.ts` synchronise la sauvegarde (révisions, conflits),
  envoie les sessions et récupère les coups de main.
- `native.ts` : intégrations Capacitor (copie de la sauvegarde dans le stockage natif, vibrations, barre d'état).
- `notifications.ts` : notifications de l'appareil programmées à l'avance — locales iOS (plugin
  `@capacitor/local-notifications`, même jeu fermé) ou API Notification du navigateur (tant que l'onglet reste
  ouvert). `app/reminders.ts` les reprogramme à chaque changement de la partie.
- `preferences.ts` : préférences de l'appareil (cycle jour/nuit, langue, notifications).

### `convex/` — le serveur

Fonctions Convex en TypeScript, qui réutilisent `src/core` (relecture des sauvegardes) et `src/data`
(règles des pseudos, du marché). Voir [MISE_EN_LIGNE.md](MISE_EN_LIGNE.md). L'interface admin est une page à
part (`admin.html`, `src/admin/`).

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
- **Défi du jour** : un modèle dans `data/daily.ts` + son libellé `daily.task.<type>` dans les traductions.
- Tout nouveau texte visible (contenu compris) se traduit dans `src/i18n/locales/*`.

## Qualité

- `npm run check` : TypeScript strict, ESLint, Prettier, tests Vitest (logique de jeu).
- CI GitHub Actions (`.github/workflows/ci.yml`) sur chaque push et pull request.
- En développement, `window.__cityVille` expose `{ game, bus, scene, phaser, backend, inbox, reminders }` pour
  les tests de bout en bout.
- `src/core/balance.test.ts` fait jouer un joueur simulé (`core/simulation.ts`) pendant 25 jours et vérifie
  le rythme de progression (niveau 30 en deux à trois semaines).

## Plateformes

Web (navigateur mobile et ordinateur, installable en PWA) et **iOS** via Capacitor (`ios/`, voir
[IOS.md](IOS.md)). Android suivra avec `npx cap add android`.
