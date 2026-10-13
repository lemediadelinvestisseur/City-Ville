# Game design — V1

## Intention

Recréer le plaisir des city-builders sociaux des années 2010 (construire, récolter, voir sa ville s'animer) dans
un format **mobile d'abord**, en sessions courtes : on ouvre le jeu, on encaisse, on replante, on lance un
chantier, on revient plus tard.

## Boucle principale

```
 Champs ──récolte──► Marchandises ──approvisionnement──► Commerces ──recette──► Pièces
   ▲                                                                          │
   └──── graines ◄──────────── Habitations ──loyers──► Pièces ◄───────────────┘
                                     │
                                     └─ habitants (plafonnés par les bâtiments publics)
 Pièces ──► nouvelles constructions, agrandissements ──► XP ──► niveaux ──► déblocages
```

- **Énergie** : chaque action « de travail » (coup de marteau, loyer, récolte, recette) coûte 1 énergie.
  +1 toutes les 2 minutes, recharge complète à chaque niveau. C'est le rythme de la session… et le principal
  levier de monétisation.
- **Habitants** : apportés par les habitations, plafonnés par les bâtiments publics (mairie, école…). Certains
  commerces exigent un nombre d'habitants minimum.
- **Marchandises** : produites par les champs, stockées (grange, entrepôt), consommées par les commerces.
- **Décorations** : bonus de revenus (%) sur les habitations et commerces proches (plafond +50 %).
- **Agrandissements** : zones de 8 × 8 cases autour de la ville, de plus en plus chères.

## Ressources

| Ressource    | Rôle                                                               |
| ------------ | ------------------------------------------------------------------ |
| Pièces       | Monnaie courante : constructions, graines, agrandissements         |
| Cash         | Monnaie premium : accélérations, objets premium, échanges, énergie |
| Énergie      | Limite le nombre d'actions par session                             |
| XP / niveaux | Progression, déblocages, recharge d'énergie, 1 cash par niveau     |
| Marchandises | Lien entre agriculture et commerce                                 |
| Habitants    | Débloquent les commerces, plafonnés par les services publics       |

## Contenu et équilibrage

Les valeurs ci-dessous sont générées à partir de `src/data/` (source de vérité). Les durées sont
**volontairement courtes** pour le prototype : elles seront allongées pour une vraie version.

| Habitation      | Taille | Prix        | Débloquée | Chantier | Habitants | Loyer        |
| --------------- | ------ | ----------- | --------- | -------- | --------- | ------------ |
| Maisonnette     | 2×2    | 250 pièces  | niv. 1    | 3        | 15        | 30 / 3 min   |
| Bungalow        | 2×2    | 600 pièces  | niv. 2    | 4        | 25        | 60 / 8 min   |
| Maison de ville | 2×2    | 1400 pièces | niv. 4    | 5        | 40        | 120 / 20 min |
| Villa           | 3×3    | 3500 pièces | niv. 6    | 6        | 70        | 300 / 45 min |
| Immeuble        | 3×3    | 8000 pièces | niv. 9    | 8        | 150       | 700 / 2 h    |
| Chalet de luxe  | 2×2    | 25 cash     | niv. 1    | 0        | 60        | 200 / 10 min |

| Commerce    | Taille | Prix        | Débloqué          | Chantier | Marchandises | Service             | Recette |
| ----------- | ------ | ----------- | ----------------- | -------- | ------------ | ------------------- | ------- |
| Boulangerie | 2×2    | 500 pièces  | niv. 1            | 4        | 20           | 10 clients / 2 min  | 150     |
| Fleuriste   | 2×2    | 900 pièces  | niv. 2, 40 hab.   | 4        | 30           | 15 clients / 6 min  | 260     |
| Café        | 2×2    | 1600 pièces | niv. 3, 70 hab.   | 5        | 45           | 20 clients / 15 min | 450     |
| Pizzeria    | 2×2    | 2600 pièces | niv. 5, 120 hab.  | 5        | 60           | 25 clients / 30 min | 750     |
| Épicerie    | 3×3    | 5000 pièces | niv. 7, 200 hab.  | 6        | 100          | 40 clients / 1 h    | 1400    |
| Cinéma      | 3×3    | 9000 pièces | niv. 10, 350 hab. | 7        | 160          | 60 clients / 2 h    | 2600    |

| Service public / stockage | Prix        | Débloqué | Chantier | Effet         |
| ------------------------- | ----------- | -------- | -------- | ------------- |
| Mairie                    | —           | départ   | 0        | +80 hab. max  |
| École                     | 1500 pièces | niv. 2   | 6        | +100 hab. max |
| Bureau de poste           | 2500 pièces | niv. 4   | 6        | +120 hab. max |
| Commissariat              | 5000 pièces | niv. 6   | 8        | +200 hab. max |
| Caserne de pompiers       | 8000 pièces | niv. 8   | 8        | +300 hab. max |
| Grange                    | 800 pièces  | niv. 1   | 4        | +150 stockage |
| Entrepôt                  | 4000 pièces | niv. 5   | 6        | +400 stockage |

| Décoration       | Prix       | Débloquée | Bonus           |
| ---------------- | ---------- | --------- | --------------- |
| Chêne            | 30 pièces  | niv. 1    | +1 % (rayon 1)  |
| Sapin            | 30 pièces  | niv. 1    | +1 % (rayon 1)  |
| Massif de fleurs | 50 pièces  | niv. 1    | +2 % (rayon 2)  |
| Banc public      | 80 pièces  | niv. 2    | +2 % (rayon 2)  |
| Lampadaire       | 120 pièces | niv. 3    | +2 % (rayon 2)  |
| Drapeau          | 150 pièces | niv. 4    | +3 % (rayon 2)  |
| Statue           | 400 pièces | niv. 5    | +4 % (rayon 2)  |
| Fontaine         | 15 cash    | niv. 1    | +10 % (rayon 3) |

| Culture     | Pousse | Graines | Marchandises | XP  | Débloquée |
| ----------- | ------ | ------- | ------------ | --- | --------- |
| Fraises     | 1 min  | 10      | 8            | 1   | niv. 1    |
| Blé         | 5 min  | 25      | 18           | 2   | niv. 2    |
| Carottes    | 15 min | 50      | 35           | 3   | niv. 3    |
| Maïs        | 45 min | 90      | 70           | 4   | niv. 5    |
| Citrouilles | 2 h    | 150     | 130          | 6   | niv. 7    |

| Niveau | XP cumulée | Énergie max |
| ------ | ---------- | ----------- |
| 1      | 0          | 12          |
| 2      | 15         | 13          |
| 3      | 55         | 14          |
| 4      | 120        | 15          |
| 5      | 210        | 16          |
| 6      | 320        | 17          |
| 7      | 450        | 18          |
| 8      | 605        | 19          |
| 9      | 780        | 20          |
| 10     | 975        | 21          |

| Agrandissement | Prix         | Niveau requis |
| -------------- | ------------ | ------------- |
| 1              | 2000 pièces  | 3             |
| 2              | 4400 pièces  | 5             |
| 3              | 9700 pièces  | 7             |
| 4              | 21300 pièces | 9             |
| 5              | 46900 pièces | 11            |

Autres règles : départ avec 3 000 pièces, 5 cash, 40 marchandises ; vente d'une construction = 20 % du prix en
pièces ; accélération = 1 cash par tranche de 10 minutes restantes (ou par coup de marteau restant).

## Objectifs (tutoriel guidé)

Léa, l'adjointe au maire, propose des objectifs qui s'enchaînent : encaisser des loyers → récolter → planter →
construire une boulangerie (acheter, terminer le chantier, approvisionner, encaisser) → décorer → construire
des maisons → poser des routes → école → fleuriste → agrandir la ville → 150 habitants → niveau 6.
Tant que le joueur est au niveau 4 ou moins, une flèche montre quoi toucher et le bouton « Construire »
clignote quand il faut acheter quelque chose.

## Ville de départ

Mairie, grange, 4 champs de fraises mûres, 2 maisonnettes avec loyer prêt, deux routes en croix, quelques
arbres et massifs ; une forêt couvre les zones à acheter.

## Ce qui n'est pas (encore) dans la V1

Voisins et visites, trains et cadeaux, collections, matériaux de construction, événements saisonniers,
musique. Voir [ROADMAP.md](ROADMAP.md).
