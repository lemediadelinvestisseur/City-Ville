# City Ville

City-builder isométrique **mobile-first** (jouable aussi sur ordinateur), inspiré des jeux de gestion de ville
des années 2010 : on encaisse des loyers, on cultive des champs, on approvisionne des commerces, on agrandit
sa ville et on suit les objectifs de Léa, l'adjointe au maire.

> **Prototype V1** : graphismes générés par le code (provisoires), paiements simulés, sauvegarde locale.

![Aperçu mobile](docs/images/apercu-mobile.jpg)

## Démarrer

Prérequis : Node.js 22.12 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173 (et l'adresse réseau pour tester sur téléphone)
```

Pour jouer sur votre téléphone pendant le développement : connectez-le au même Wi-Fi que l'ordinateur et ouvrez
l'adresse « Network » affichée par `npm run dev`.

| Commande          | Rôle                                            |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Serveur de développement (rechargement à chaud) |
| `npm run build`   | Vérification des types puis build de production |
| `npm run preview` | Sert le build de production localement          |
| `npm test`        | Tests unitaires (Vitest) de la logique de jeu   |
| `npm run lint`    | ESLint                                          |
| `npm run format`  | Formatage Prettier                              |
| `npm run check`   | Types + lint + format + tests (comme la CI)     |

La planche de tous les visuels générés est disponible en développement sur `/art.html`.

## Ce que contient la V1

- **Carte isométrique** de 40 × 40 cases : déplacement au doigt avec inertie, zoom par pincement ou molette.
- **Constructions** : habitations (loyers + habitants), commerces (marchandises → recettes), bâtiments publics
  (population maximale), stockage, champs, décorations (bonus de revenus à proximité) et routes.
- **Chantiers** en plusieurs coups de marteau (1 énergie chacun), accélérables contre du cash.
- **Cultures** : fraises, blé, carottes, maïs, citrouilles ; mode plantation en série.
- **Économie** : pièces, cash (monnaie premium), énergie qui se recharge, XP et niveaux avec déblocages.
- **Objectifs guidés** (12) avec flèches d'aide, récompenses et passages de niveau.
- **Agrandissements** de la ville par zones de 8 × 8.
- **Mode édition** : déplacer ou vendre une construction.
- **Boutique** : packs de cash (paiement simulé) et échanges cash → pièces / énergie.
- **Sauvegarde automatique** locale, progression hors-ligne (les cultures poussent pendant votre absence).
- **Bruitages** synthétisés, habitants qui se promènent, nuages, effets de récompense.
- **Outils de test** dans les réglages (pièces, niveau, avance rapide du temps).

## Structure

```
src/
  core/        Logique de jeu pure (aucune dépendance au rendu) + tests
  data/        Contenu et équilibrage : bâtiments, cultures, objectifs, produits, ville de départ
  render/      Rendu Phaser 4 : scène, caméra, effets, habitants, dessins procéduraux (art/)
  ui/          Interface HTML/CSS superposée : barre de ressources, menus, fenêtres, boutique
  services/    Paiement (interface + fournisseur de test), stockage, sons
  app/         Contexte partagé et bus d'évènements entre le monde et l'interface
docs/          Architecture, game design, monétisation, feuille de route
```

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) ·
[docs/MONETIZATION.md](docs/MONETIZATION.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

## Contrôles

| Action                    | Mobile                   | Ordinateur                      |
| ------------------------- | ------------------------ | ------------------------------- |
| Se déplacer               | Glisser                  | Cliquer-glisser                 |
| Zoomer                    | Pincer                   | Molette                         |
| Agir sur une construction | Toucher                  | Clic                            |
| Placer une construction   | Toucher la carte, puis ✓ | Survoler puis clic (Entrée = ✓) |
| Annuler                   | ✗                        | Échap                           |

## Nom et droits

« CityVille » est une marque de Zynga. **City Ville** est un nom de travail : prévoir un nom, un univers et des
visuels originaux avant toute publication (le nom est centralisé dans `src/config.ts`). Les mécaniques de jeu
ne sont pas protégées, mais les noms, personnages et graphismes le sont.
