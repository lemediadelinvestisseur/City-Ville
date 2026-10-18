# Game design

## Intention

Recréer le plaisir des city-builders sociaux des années 2010 (construire, récolter, voir sa ville s'animer) dans
un format **mobile d'abord**, en sessions courtes : on ouvre le jeu, on encaisse, on replante, on lance un
chantier, on revient plus tard.

## Boucle principale

```
 Champs, bateaux ──► Marchandises ──approvisionnement──► Commerces ──recette──► Pièces
   ▲                                                                          │
   └──── graines ◄──────────── Habitations ──loyers──► Pièces ◄───────────────┘
                                     │
                                     └─ habitants (plafonnés par les bâtiments publics)
 Pièces ──► nouvelles constructions, agrandissements ──► XP ──► niveaux ──► déblocages
```

- **Chantiers** : une construction achetée devient un chantier avec un minuteur, de 30 secondes (maisonnette)
  à plus de 16 heures (manoir, stade). À la fin, on touche le bâtiment pour l'**inaugurer** et gagner son XP.
  Le cash permet de terminer tout de suite.
- **Énergie** : encaisser un loyer ou une recette, récolter, décharger un bateau coûtent 1 énergie.
  +1 toutes les 3 minutes, recharge complète à chaque niveau. C'est le rythme de la session… et un levier de
  monétisation.
- **Grande carte** (128 × 96 cases, 192 zones) : mer au sud et à l'ouest, montagnes enneigées au nord et
  massif au nord-est (non constructibles), lacs, forêts denses, grandes routes qui se prolongent au loin.
  Acheter une zone offre ses routes et ses arbres (à défricher en mode édition).
- **Deux rives** : la carte est coupée du nord au sud par un bras de mer. La rive est s'ouvre au
  niveau 15 : on y pose un **pont** (20 000 pièces, chantier de 3 h) d'une rive à l'autre, puis on achète ses
  zones.
- **Jour et nuit** : cycle de 30 minutes commun à tous (20 min de jour, 2 de crépuscule, 6 de nuit, 2 d'aube),
  purement visuel (fenêtres et lampadaires allumés). Option « heure réelle » ou « toujours le jour ».
- **Voisins** : on ajoute des voisins, on visite leur ville et on les aide une fois par jour (pièces pour les
  deux). Classements par niveau et par population.
- **Marché** (niveau 5) : vente de lots de 10 à 500 marchandises, de 1 à 12 pièces l'unité, 5 lots au plus,
  taxe de 10 %, invendus rendus après 48 h.
- **Pêche** : la ville est au bord de la mer. Un ponton, un port de pêche ou un port industriel se pose au bord
  de l'eau ; son bateau part en mer (choix de la sortie, comme une culture) et rapporte des marchandises.
- **Habitants** : apportés par les habitations, plafonnés par les bâtiments publics (mairie, école…). Certains
  commerces exigent un nombre d'habitants minimum.
- **Marchandises** : produites par les champs, stockées (grange, entrepôt), consommées par les commerces.
- **Décorations** : bonus de revenus (%) sur les habitations et commerces proches (plafond +50 %).
- **Agrandissements** : zones de 8 × 8 cases voisines de celles déjà achetées. Plus la zone est loin de la ville
  de départ, plus elle est chère et tardive ; chaque achat renchérit un peu les suivants.
- **Animations** : chantier ouvert à coups de marteau, ouvrier au travail, bâtiment qui s'élève à
  l'inauguration ; pièces et étoiles d'XP qui tombent au sol et se ramassent (toucher, survol, ou
  automatiquement) ; camion de déménagement à l'arrivée des habitants.

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

Les valeurs ci-dessous sont générées à partir de `src/data/` (source de vérité). La progression vise le
**niveau 30 en trois semaines environ** pour un joueur qui se connecte quatre fois par jour : la courbe d'XP est
calibrée par un joueur simulé (`src/core/simulation.ts`, vérifié par `src/core/balance.test.ts`). Plus on
avance, plus les chantiers, les cultures et les sorties en mer sont longs, et plus ils rapportent.

| Habitation        | Taille | Prix           | Débloquée | Chantier | Habitants | Loyer        |
| ----------------- | ------ | -------------- | --------- | -------- | --------- | ------------ |
| Maisonnette       | 2×2    | 250 pièces     | niv. 1    | 30 s     | 15        | 30 / 5 min   |
| Bungalow          | 2×2    | 600 pièces     | niv. 2    | 2 min    | 25        | 65 / 15 min  |
| Maison de ville   | 2×2    | 1 400 pièces   | niv. 4    | 10 min   | 40        | 140 / 30 min |
| Villa             | 3×3    | 3 500 pièces   | niv. 6    | 30 min   | 70        | 320 / 1 h    |
| Immeuble          | 3×3    | 8 000 pièces   | niv. 9    | 1 h      | 150       | 700 / 3 h    |
| Résidence         | 3×3    | 14 000 pièces  | niv. 12   | 2 h      | 220       | 1 100 / 4 h  |
| Maison de maître  | 3×3    | 22 000 pièces  | niv. 15   | 3 h      | 260       | 1 700 / 6 h  |
| Lofts             | 2×2    | 30 000 pièces  | niv. 18   | 4 h      | 300       | 2 100 / 6 h  |
| Tour d’habitation | 3×3    | 50 000 pièces  | niv. 21   | 6 h      | 450       | 3 600 / 8 h  |
| Gratte-ciel       | 3×3    | 80 000 pièces  | niv. 25   | 10 h     | 700       | 5 800 / 12 h |
| Manoir            | 4×4    | 120 000 pièces | niv. 28   | 16 h     | 800       | 8 500 / 12 h |
| Chalet de luxe    | 2×2    | 25 cash        | niv. 1    | immédiat | 60        | 220 / 10 min |

| Commerce           | Taille | Prix           | Débloqué            | Chantier | Marchandises | Service             | Recette |
| ------------------ | ------ | -------------- | ------------------- | -------- | ------------ | ------------------- | ------- |
| Boulangerie        | 2×2    | 500 pièces     | niv. 1              | 1 min    | 20           | 10 clients / 3 min  | 150     |
| Fleuriste          | 2×2    | 900 pièces     | niv. 2, 40 hab.     | 3 min    | 30           | 15 clients / 10 min | 270     |
| Café               | 2×2    | 1 600 pièces   | niv. 3, 70 hab.     | 5 min    | 45           | 20 clients / 30 min | 480     |
| Pizzeria           | 2×2    | 2 600 pièces   | niv. 5, 120 hab.    | 15 min   | 65           | 25 clients / 1 h    | 780     |
| Épicerie           | 3×3    | 5 000 pièces   | niv. 7, 200 hab.    | 30 min   | 110          | 40 clients / 2 h    | 1 450   |
| Cinéma             | 3×3    | 9 000 pièces   | niv. 10, 350 hab.   | 1 h      | 170          | 60 clients / 3 h    | 2 600   |
| Boutique de mode   | 2×2    | 11 000 pièces  | niv. 11, 450 hab.   | 1 h 30   | 200          | 50 clients / 3 h    | 3 100   |
| Librairie          | 2×2    | 15 000 pièces  | niv. 13, 600 hab.   | 2 h      | 240          | 60 clients / 4 h    | 3 900   |
| Restaurant         | 3×3    | 18 000 pièces  | niv. 14, 700 hab.   | 2 h 30   | 280          | 80 clients / 4 h    | 4 700   |
| Supermarché        | 3×3    | 28 000 pièces  | niv. 17, 1 000 hab. | 4 h      | 420          | 120 clients / 6 h   | 7 600   |
| Hôtel              | 3×3    | 38 000 pièces  | niv. 19, 1 300 hab. | 5 h      | 520          | 100 clients / 6 h   | 9 800   |
| Centre commercial  | 4×4    | 60 000 pièces  | niv. 22, 1 800 hab. | 8 h      | 820          | 200 clients / 8 h   | 16 500  |
| Bowling            | 3×3    | 75 000 pièces  | niv. 24, 2 200 hab. | 10 h     | 950          | 160 clients / 10 h  | 19 500  |
| Parc d’attractions | 4×4    | 110 000 pièces | niv. 27, 2 800 hab. | 14 h     | 1350         | 300 clients / 12 h  | 29 000  |
| Stade              | 4×4    | 160 000 pièces | niv. 30, 3 500 hab. | 24 h     | 2000         | 500 clients / 24 h  | 46 000  |

| Service public / stockage | Prix           | Débloqué | Chantier | Effet           |
| ------------------------- | -------------- | -------- | -------- | --------------- |
| Mairie                    | —              | départ   | immédiat | +80 hab. max    |
| École                     | 1 500 pièces   | niv. 2   | 3 min    | +100 hab. max   |
| Bureau de poste           | 2 500 pièces   | niv. 4   | 10 min   | +120 hab. max   |
| Commissariat              | 5 000 pièces   | niv. 6   | 30 min   | +200 hab. max   |
| Caserne de pompiers       | 8 000 pièces   | niv. 8   | 1 h      | +300 hab. max   |
| Bibliothèque              | 12 000 pièces  | niv. 11  | 1 h 30   | +350 hab. max   |
| Hôpital                   | 20 000 pièces  | niv. 13  | 3 h      | +500 hab. max   |
| Gare                      | 30 000 pièces  | niv. 16  | 4 h      | +600 hab. max   |
| Université                | 45 000 pièces  | niv. 20  | 6 h      | +800 hab. max   |
| Musée                     | 60 000 pièces  | niv. 23  | 8 h      | +900 hab. max   |
| Palais des congrès        | 90 000 pièces  | niv. 26  | 12 h     | +1 200 hab. max |
| Aéroport                  | 140 000 pièces | niv. 29  | 20 h     | +1 600 hab. max |
| Grange                    | 800 pièces     | niv. 1   | 1 min    | +150 stockage   |
| Entrepôt                  | 4 000 pièces   | niv. 5   | 20 min   | +400 stockage   |
| Silo                      | 9 000 pièces   | niv. 12  | 1 h      | +600 stockage   |
| Grand entrepôt            | 25 000 pièces  | niv. 18  | 4 h      | +1 200 stockage |
| Centre logistique         | 50 000 pièces  | niv. 24  | 8 h      | +2 500 stockage |

| Port (au bord de l’eau) | Taille | Prix          | Débloqué | Chantier | Bateau   |
| ----------------------- | ------ | ------------- | -------- | -------- | -------- |
| Ponton de pêche         | 2×2    | 1 200 pièces  | niv. 4   | 5 min    | niveau 1 |
| Port de pêche           | 3×3    | 15 000 pièces | niv. 12  | 2 h      | niveau 2 |
| Port industriel         | 3×3    | 50 000 pièces | niv. 22  | 8 h      | niveau 3 |

| Sortie en mer           | Durée  | Coût  | Marchandises | XP  | Bateau    | Débloquée |
| ----------------------- | ------ | ----- | ------------ | --- | --------- | --------- |
| Sortie côtière          | 30 min | 40    | 45           | 3   | niveau 1+ | niv. 1    |
| Pêche au large          | 3 h    | 150   | 180          | 8   | niveau 1+ | niv. 8    |
| Marée de nuit           | 8 h    | 350   | 420          | 15  | niveau 1+ | niv. 15   |
| Campagne de chalut      | 6 h    | 700   | 750          | 25  | niveau 2+ | niv. 12   |
| Grande campagne         | 12 h   | 1 200 | 1 400        | 40  | niveau 2+ | niv. 18   |
| Expédition industrielle | 24 h   | 3 000 | 3 200        | 90  | niveau 3+ | niv. 22   |

| Décoration           | Prix          | Débloquée | Bonus           |
| -------------------- | ------------- | --------- | --------------- |
| Chêne                | 30 pièces     | niv. 1    | +1 % (rayon 1)  |
| Sapin                | 30 pièces     | niv. 1    | +1 % (rayon 1)  |
| Palmier              | 60 pièces     | niv. 1    | +1 % (rayon 1)  |
| Massif de fleurs     | 50 pièces     | niv. 1    | +2 % (rayon 2)  |
| Banc public          | 80 pièces     | niv. 2    | +2 % (rayon 2)  |
| Lampadaire           | 120 pièces    | niv. 3    | +2 % (rayon 2)  |
| Drapeau              | 150 pièces    | niv. 4    | +3 % (rayon 2)  |
| Statue               | 400 pièces    | niv. 5    | +4 % (rayon 2)  |
| Phare                | 3 000 pièces  | niv. 9    | +6 % (rayon 3)  |
| Parterre de tulipes  | 600 pièces    | niv. 11   | +4 % (rayon 2)  |
| Kiosque à musique    | 4 000 pièces  | niv. 14   | +6 % (rayon 3)  |
| Arche fleurie        | 2 500 pièces  | niv. 17   | +5 % (rayon 2)  |
| Statue équestre      | 9 000 pièces  | niv. 20   | +8 % (rayon 3)  |
| Fontaine monumentale | 25 000 pièces | niv. 24   | +12 % (rayon 4) |
| Arc de triomphe      | 45 000 pièces | niv. 28   | +15 % (rayon 4) |
| Fontaine             | 15 cash       | niv. 1    | +10 % (rayon 3) |

| Culture     | Pousse | Graines | Marchandises | XP  | Débloquée |
| ----------- | ------ | ------- | ------------ | --- | --------- |
| Fraises     | 5 min  | 10      | 10           | 1   | niv. 1    |
| Blé         | 30 min | 25      | 30           | 2   | niv. 2    |
| Carottes    | 1 h    | 45      | 50           | 3   | niv. 3    |
| Maïs        | 2 h    | 80      | 85           | 4   | niv. 5    |
| Tomates     | 4 h    | 120     | 140          | 6   | niv. 7    |
| Citrouilles | 8 h    | 180     | 240          | 8   | niv. 10   |
| Tournesols  | 12 h   | 250     | 330          | 10  | niv. 14   |
| Raisin      | 16 h   | 320     | 430          | 12  | niv. 19   |
| Pommes      | 24 h   | 450     | 620          | 16  | niv. 24   |

| Niveau | XP cumulée | Énergie max |
| ------ | ---------- | ----------- |
| 1      | 0          | 16          |
| 2      | 15         | 17          |
| 3      | 55         | 18          |
| 4      | 120        | 19          |
| 5      | 210        | 20          |
| 6      | 400        | 21          |
| 8      | 760        | 23          |
| 10     | 1 350      | 25          |
| 12     | 2 500      | 27          |
| 15     | 4 700      | 30          |
| 18     | 6 650      | 33          |
| 20     | 8 100      | 35          |
| 22     | 9 700      | 37          |
| 25     | 12 200     | 40          |
| 28     | 15 000     | 43          |
| 30     | 17 000     | 45          |

| Distance à la ville (zones) | Prix (premier achat) | Niveau requis |
| --------------------------- | -------------------- | ------------- |
| 1                           | 1 500 pièces         | 3             |
| 2                           | 2 200 pièces         | 5             |
| 3                           | 3 200 pièces         | 7             |
| 5                           | 6 600 pièces         | 11            |
| 8                           | 20 200 pièces        | 17            |
| 12                          | 89 400 pièces        | 25            |

Chaque zone déjà achetée renchérit les suivantes de 8 % (et retarde d'un niveau toutes les quatre zones).

Autres règles : départ avec 3 000 pièces, 5 cash, 40 marchandises ; vente d'une construction = 20 % du prix en
pièces ; terminer une attente coûte `⌈0,8 × √minutes restantes⌉` cash (1 cash pour quelques minutes, 6 cash pour
une journée). Les zones de l'extrême est sont la mer : elles ne s'achètent pas.

## Objectifs (tutoriel guidé)

Léa, l'adjointe au maire, propose des objectifs qui s'enchaînent : encaisser des loyers → récolter → planter →
construire une boulangerie (acheter, inaugurer, approvisionner, encaisser) → décorer → construire des maisons →
poser des routes → école → fleuriste → agrandir la ville → 150 habitants → niveau 6 → pêche (niveau 4) → puis un
grand objectif tous les deux ou trois niveaux jusqu'au stade du niveau 30 (cinéma, port de pêche, hôpital, gare,
université, centre commercial, gratte-ciel, aéroport…).
Tant que le joueur est au niveau 4 ou moins, une flèche montre quoi toucher et le bouton « Construire »
clignote quand il faut acheter quelque chose.

## Ville de départ

Mairie, grange, 4 champs de fraises mûres, 2 maisonnettes avec loyer prêt, deux routes en croix, quelques
arbres, palmiers et massifs. La ville est une île : une plage la borde et la mer s'étend à l'est. Une forêt
couvre les zones à acheter.

## Ce qui n'est pas (encore) dans la V1

Voisins et visites, trains et cadeaux, collections, matériaux de construction, événements saisonniers,
musique. Voir [ROADMAP.md](ROADMAP.md).
