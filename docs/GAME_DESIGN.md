# Game design

## Intention

Recréer le plaisir des city-builders sociaux des années 2010 (construire, récolter, voir sa ville s'animer) dans
un format **mobile d'abord**, en sessions courtes : on ouvre le jeu, on encaisse, on replante, on lance un
chantier, on revient plus tard.

## Boucle principale

```
 Champs, bateaux, élevage ──► Produits ──► Ateliers (farine, pain, fromage…) ──► Produits transformés
        ▲                         │                                                      │
        │                         ├──► Commerces ──recette──► Pièces ◄── loyers ── Habitations
        │                         ├──► Repas de la ville ──► Bonheur ──► loyers et habitants max
        │                         └──► Commandes, visiteurs, voisins, marchand ──► Pièces, XP
        └──── graines, nourriture des bêtes ◄──────────── Pièces
 Pièces ──► nouvelles constructions, agrandissements ──► XP ──► niveaux ──► déblocages
```

- **Chantiers** : une construction achetée devient un chantier avec un minuteur, de 30 secondes (maisonnette)
  à plus de 16 heures (manoir, stade). À la fin, on touche le bâtiment pour l'**inaugurer** et gagner son XP.
  Le cash permet de terminer tout de suite.
- **Énergie** : encaisser un loyer ou une recette, récolter, décharger un bateau coûtent 1 énergie.
  +1 toutes les 3 minutes, recharge complète à chaque niveau. C'est le rythme de la session… et un levier de
  monétisation.
- **Grande carte** (128 × 96 cases, 192 zones) : mer au sud et à l'ouest ; au nord, une bande de forêt à acheter
  mène aux montagnes enneigées (au-delà de la carte) ; massif au nord-est (ses zones ne s'achètent pas), lacs,
  forêts denses, grandes routes qui se prolongent au loin, voie ferrée à l'ouest de la ville.
  Acheter une zone offre ses routes et ses arbres (à défricher en mode édition).
- **Deux rives** : la carte est coupée du nord au sud par un bras de mer. La rive est s'ouvre au
  niveau 15 : on y pose un **pont** (20 000 pièces, chantier de 3 h) d'une rive à l'autre, puis on achète ses
  zones.
- **Jour et nuit** : cycle de 30 minutes commun à tous (20 min de jour, 2 de crépuscule, 6 de nuit, 2 d'aube),
  purement visuel (fenêtres et lampadaires allumés). Option « heure réelle » ou « toujours le jour ».
- **Voisins** : on ajoute des voisins, on visite leur ville et on les aide une fois par jour (pièces pour les
  deux). Classements par niveau et par population.
- **Marché** (niveau 5) : vente de lots de 10 à 500 unités d'un produit, à un prix plafonné selon le produit
  (12 pièces l'unité pour un produit brut, plus pour un produit transformé), 5 lots au plus, taxe de 10 %,
  invendus rendus après 48 h.
- **Pêche** : la ville est au bord de la mer. Un ponton, un port de pêche ou un port industriel se pose au bord
  de l'eau ; son bateau part en mer (choix de la sortie, comme une culture) et rapporte du poisson.
- **Habitants** : apportés par les habitations, plafonnés par les bâtiments publics (mairie, école…). Certains
  commerces exigent un nombre d'habitants minimum.
- **Produits** : blé, fraises, poisson, œufs, farine, pain, fromage… (21 produits) rangés dans l'entrepôt
  (capacité : grange, entrepôts). Ils approvisionnent les commerces, nourrissent la ville, se livrent en
  commande, se donnent aux voisins, se vendent au marché ou au marchand (3 pièces par point de valeur).
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
| Produits     | Lien entre ferme, ateliers, commerces et repas de la ville         |
| Habitants    | Débloquent les commerces, plafonnés par les services publics       |
| Bonheur      | Note sur 100 (repas, services, cadre de vie) : loyers et habitants |

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

| Commerce           | Taille | Prix           | Débloqué            | Chantier | Produits                          | Service             | Recette |
| ------------------ | ------ | -------------- | ------------------- | -------- | --------------------------------- | ------------------- | ------- |
| Boulangerie        | 2×2    | 500 pièces     | niv. 1              | 1 min    | 20 blé                            | 10 clients / 3 min  | 150     |
| Fleuriste          | 2×2    | 900 pièces     | niv. 2, 40 hab.     | 3 min    | 30 fleurs                         | 15 clients / 10 min | 270     |
| Café               | 2×2    | 1 600 pièces   | niv. 3, 70 hab.     | 5 min    | 45 fraises                        | 20 clients / 30 min | 480     |
| Pizzeria           | 2×2    | 2 600 pièces   | niv. 5, 120 hab.    | 15 min   | 35 farine                         | 25 clients / 1 h    | 780     |
| Épicerie           | 3×3    | 5 000 pièces   | niv. 7, 200 hab.    | 30 min   | 55 carottes, 35 œufs              | 40 clients / 2 h    | 1 450   |
| Cinéma             | 3×3    | 9 000 pièces   | niv. 10, 350 hab.   | 1 h      | 170 maïs                          | 60 clients / 3 h    | 2 600   |
| Boutique de mode   | 2×2    | 11 000 pièces  | niv. 11, 450 hab.   | 1 h 30   | 200 coton                         | 50 clients / 3 h    | 3 100   |
| Librairie          | 2×2    | 15 000 pièces  | niv. 13, 600 hab.   | 2 h      | 40 gâteaux                        | 60 clients / 4 h    | 3 900   |
| Restaurant         | 3×3    | 18 000 pièces  | niv. 14, 700 hab.   | 2 h 30   | 45 viande, 140 tomates            | 80 clients / 4 h    | 4 700   |
| Supermarché        | 3×3    | 28 000 pièces  | niv. 17, 1 000 hab. | 4 h      | 45 conserves, 95 lait, 45 pain    | 120 clients / 6 h   | 7 600   |
| Hôtel              | 3×3    | 38 000 pièces  | niv. 19, 1 300 hab. | 5 h      | 60 pain, 45 fromage, 60 confiture | 100 clients / 6 h   | 9 800   |
| Centre commercial  | 4×4    | 60 000 pièces  | niv. 22, 1 800 hab. | 8 h      | 410 coton, 410 tournesols         | 200 clients / 8 h   | 16 500  |
| Bowling            | 3×3    | 75 000 pièces  | niv. 24, 2 200 hab. | 10 h     | 475 maïs, 160 viande              | 160 clients / 10 h  | 19 500  |
| Parc d’attractions | 4×4    | 110 000 pièces | niv. 27, 2 800 hab. | 14 h     | 110 gâteaux, 675 pommes           | 300 clients / 12 h  | 29 000  |
| Stade              | 4×4    | 160 000 pièces | niv. 30, 3 500 hab. | 24 h     | 220 viande, 220 pain, 665 maïs    | 500 clients / 24 h  | 46 000  |

| Service public / stockage | Prix           | Débloqué | Chantier | Effet           |
| ------------------------- | -------------- | -------- | -------- | --------------- |
| Mairie                    | —              | départ   | immédiat | +80 hab. max    |
| École                     | 1 500 pièces   | niv. 2   | 3 min    | +100 hab. max   |
| Bureau de poste           | 2 500 pièces   | niv. 4   | 10 min   | +120 hab. max   |
| Commissariat              | 5 000 pièces   | niv. 6   | 30 min   | +200 hab. max   |
| Caserne de pompiers       | 8 000 pièces   | niv. 8   | 1 h      | +300 hab. max   |
| Bibliothèque              | 12 000 pièces  | niv. 11  | 1 h 30   | +350 hab. max   |
| Hôpital                   | 20 000 pièces  | niv. 13  | 3 h      | +500 hab. max   |
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

| Sortie en mer           | Durée  | Coût  | Poissons | XP  | Bateau    | Débloquée |
| ----------------------- | ------ | ----- | -------- | --- | --------- | --------- |
| Sortie côtière          | 30 min | 40    | 45       | 3   | niveau 1+ | niv. 1    |
| Pêche au large          | 3 h    | 150   | 180      | 8   | niveau 1+ | niv. 8    |
| Marée de nuit           | 8 h    | 350   | 420      | 15  | niveau 1+ | niv. 15   |
| Campagne de chalut      | 6 h    | 700   | 750      | 25  | niveau 2+ | niv. 12   |
| Grande campagne         | 12 h   | 1 200 | 1 400    | 40  | niveau 2+ | niv. 18   |
| Expédition industrielle | 24 h   | 3 000 | 3 200    | 90  | niveau 3+ | niv. 22   |

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

| Culture     | Pousse | Graines | Récolte | XP  | Débloquée |
| ----------- | ------ | ------- | ------- | --- | --------- |
| Blé         | 5 min  | 10      | 10      | 1   | niv. 1    |
| Fraises     | 30 min | 25      | 30      | 2   | niv. 2    |
| Fleurs      | 15 min | 15      | 20      | 2   | niv. 2    |
| Carottes    | 1 h    | 45      | 50      | 3   | niv. 3    |
| Maïs        | 2 h    | 80      | 85      | 4   | niv. 5    |
| Tomates     | 4 h    | 120     | 140     | 6   | niv. 7    |
| Coton       | 6 h    | 150     | 180     | 7   | niv. 9    |
| Citrouilles | 8 h    | 180     | 240     | 8   | niv. 10   |
| Tournesols  | 12 h   | 250     | 330     | 10  | niv. 14   |
| Raisin      | 16 h   | 320     | 430     | 12  | niv. 19   |
| Pommes      | 24 h   | 450     | 620     | 16  | niv. 24   |

| Niveau | XP cumulée | Énergie max |
| ------ | ---------- | ----------- |
| 1      | 0          | 16          |
| 2      | 15         | 17          |
| 3      | 55         | 18          |
| 4      | 120        | 19          |
| 5      | 210        | 20          |
| 6      | 400        | 21          |
| 8      | 760        | 23          |
| 10     | 1 250      | 25          |
| 12     | 2 200      | 27          |
| 15     | 5 300      | 30          |
| 18     | 9 650      | 33          |
| 20     | 12 000     | 35          |
| 22     | 15 900     | 37          |
| 25     | 22 350     | 40          |
| 28     | 29 900     | 43          |
| 30     | 36 500     | 45          |

| Distance à la ville (zones) | Prix (premier achat) | Niveau requis |
| --------------------------- | -------------------- | ------------- |
| 1                           | 1 500 pièces         | 3             |
| 2                           | 2 200 pièces         | 5             |
| 3                           | 3 200 pièces         | 7             |
| 5                           | 6 600 pièces         | 11            |
| 8                           | 20 200 pièces        | 17            |
| 12                          | 89 400 pièces        | 25            |

Chaque zone déjà achetée renchérit les suivantes de 8 % (et retarde d'un niveau toutes les quatre zones).

Autres règles : départ avec 3 000 pièces, 5 cash, 20 blé ; vente d'une construction = 20 % du prix en
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

Objectifs sociaux : « Bon voisinage » (niveau 4 : visiter un voisin, en aider deux), « Jour de marché »
(niveau 5 : mettre un lot en vente) et « Négociant » (niveau 8 : acheter un lot, en vendre trois). Leur aide
fait clignoter le bouton « Voisins » et ouvre le bon onglet.

## Améliorations ★ et limites par type

Chaque maison, commerce, service, entrepôt et port peut recevoir jusqu'à 3 étoiles (★ au niveau 6, ★★ au 12,
★★★ au 20). Une étoile se paie en pièces, puis lance un chantier à minuteur (ouvrier, marteau,
pièces à ramasser à la fin) :

| Catégorie | Gain par étoile                |
| --------- | ------------------------------ |
| Maisons   | +25 % d'habitants et de loyer  |
| Commerces | +30 % de recette               |
| Services  | +20 % de plafond de population |
| Entrepôts | +30 % de capacité              |
| Ports     | −15 % de durée des expéditions |

Coût d'une étoile : 20 %, 30 % puis 40 % du prix d'achat. La 1re
étoile est plus rentable que racheter le bâtiment, la 3e un peu moins : améliorer n'est jamais un piège, mais ne
remplace pas totalement la construction.

## Routes, ouvriers et train

- **Routes** : habitations, commerces, services, entrepôts et gare ne fonctionnent que si une case de route
  touche leur emprise (sinon : pas d'habitants, de loyer, de service ni de stockage ; bulle ⚠ au-dessus). La
  ville de départ est raccordée d'office.
- **Ouvriers** : un chantier à minuteur (construction ou amélioration) occupe un ouvrier jusqu'à son
  inauguration. On commence avec un ouvrier ; un deuxième s'achète une fois dans la boutique. Routes, champs
  et décorations (immédiats) n'en demandent pas.
- **Gare** (niveau 10, 6 000 pièces, 30 min) : se pose le long de la voie ferrée qui descend des montagnes à
  l'ouest de la ville. Chaque jour, une grosse commande part en train (onglet « Commandes ») : le train
  s'en va avec les produits et revient 2 h plus tard avec les pièces et l'XP, à décharger en touchant la gare.
- **Champs** : une case chacun (en proportion avec les bâtiments).

Le nombre d'exemplaires d'un même bâtiment est limité selon le niveau : maisons 4 + niveau/3, commerces
2 + niveau/8, services 1 + niveau/10, entrepôts 1 + niveau/6, ports 1 + niveau/10, champs 8 + niveau (routes et
décorations illimitées). Le menu de construction affiche « construits / maximum ». Les objectifs « Rénovation »
(niveau 6) et « Quartier étoilé » (niveau 12) introduisent les améliorations.

## Cadeau du jour

À la première ouverture de chaque journée (date locale), une fenêtre propose le cadeau du jour : une série de
7 jours dont les pièces augmentent (100 + 40 × niveau, +50 % par jour de série), avec 3 billets le 7e jour.
Un jour manqué fait repartir la série au jour 1 ; une date antérieure à la dernière réclamation est refusée.

## Ville de départ

Mairie, grange, 4 champs de blé mûr, 2 maisonnettes avec loyer prêt, deux routes en croix, quelques
arbres, palmiers et massifs. La ville est une île : une plage la borde et la mer s'étend à l'est. Une forêt
couvre les zones à acheter.

## Élevage et ateliers

On nourrit les bêtes ou on lance une production en touchant le bâtiment (bulle 📦 quand il est à l'arrêt) ;
une production à la fois, à ramasser quand elle est prête. Les ateliers et l'élevage doivent toucher une route.

| Bâtiment        | Prix          | Débloqué | Production           | Entrées → sortie                           | Durée  |
| --------------- | ------------- | -------- | -------------------- | ------------------------------------------ | ------ |
| Poulailler      | 1 200 pièces  | niv. 3   | Œufs frais           | 10 blé → 10 œufs                           | 30 min |
| Étable          | 4 500 pièces  | niv. 6   | Traite               | 20 maïs → 20 lait                          | 2 h    |
| Ferme d’élevage | 15 000 pièces | niv. 12  | Viande               | 30 maïs  20 blé → 25 viande                | 4 h    |
| Moulin          | 1 500 pièces  | niv. 4   | Farine               | 20 blé → 10 farine                         | 10 min |
| Fournil         | 2 500 pièces  | niv. 5   | Pain                 | 10 farine → 8 pain                         | 20 min |
| Fournil         | 2 500 pièces  | niv. 8   | Gâteaux aux fraises  | 10 farine  10 œufs  10 fraises → 8 gâteaux | 1 h    |
| Fromagerie      | 6 000 pièces  | niv. 9   | Fromage              | 20 lait → 8 fromage                        | 1 h    |
| Conserverie     | 10 000 pièces | niv. 11  | Conserves de tomates | 30 tomates → 10 conserves                  | 1 h    |
| Conserverie     | 10 000 pièces | niv. 13  | Confiture de fraises | 30 fraises → 10 confiture                  | 1 h    |

## Bonheur de la ville

La mairie affiche une note de bonheur sur 100 : **repas** (jusqu'à 50 points, selon le dernier repas servi et
sa variété), **services** (25 points quand il reste de la place sous le plafond d'habitants) et **cadre de vie**
(jusqu'à 25 points, décorations près des maisons).

- **Repas** : en touchant la mairie, on sert un repas qui rassasie la ville 12 h (10 parts par tranche de
  100 habitants, 5 au moins ; on peut resservir 2 h avant la fin). Les produits transformés comptent plus, et
  chaque famille d'aliments présente (céréales, fruits et légumes, viande et poisson, produits laitiers) rend
  le repas plus réjouissant.
- **Effets** : ville ravie (80+) : loyers +20 %, habitants max +10 % ; heureuse (60+) : +10 % / +5 % ;
  contente (40+) : aucun effet ; mécontente (20+) : loyers −10 % ; malheureuse : loyers −20 %.
- **Coffre de la mairie** (niveau 2) : il se remplit avec les impôts, jusqu'à 8 h de réserve.

## Rendez-vous quotidiens

Le bouton « Aujourd'hui » regroupe trois onglets (une pastille signale ce qui attend) :

- **Défis** : les défis du jour et le cadeau de série (voir plus bas).
- **Commandes** (niveau 3) : trois livraisons en camion et une grosse commande par le train (gare), tirées
  chaque jour parmi les produits que le joueur sait produire ; bonus quand tous les camions sont livrés.
- **Roue de la chance** (niveau 2) : un tour gratuit par jour, plus un tour par voisin aidé (deux au plus) :
  pièces, énergie, produits, XP, cash ou gros lot.

Autres rendez-vous :

- **Visiteur surprise** (niveau 3) : toutes les 5 à 9 h, un personnage (touriste, chef, routier, grand-mère)
  passe en ville et demande un produit contre une récompense ; il repart au bout de 4 h.
- **Météo** : pluie ou neige de temps en temps, commune à tous ; une culture plantée sous la pluie pousse 15 %
  plus vite.
- **Retour en jeu** : un résumé de ce qui s'est passé pendant l'absence (récoltes, productions, coffre,
  visiteur, ville affamée).

## Quartier

- **Aider** un voisin rapporte des pièces, un petit cadeau en produits et un tour de roue.
- **Demandes** : chacun peut demander un produit (5 à 200 unités) à ses voisins pendant 48 h ; les voisins
  qui en envoient reçoivent des pièces.
- **Défi de quartier de la semaine** : toutes les récoltes des maires comptent (objectif 150 par participant,
  300 au moins) ; réussi, il récompense chaque participant.
- **Plus belle ville** : en visite, on peut aimer la ville d'un voisin (une fois par semaine) ; un classement
  des « J'aime » de la semaine s'affiche dans les voisins.

## Ambiance

Musique générative (désactivable), bruitages, bruits d'ambiance (vagues, oiseaux, grillons la nuit),
vibrations variées selon l'action (désactivables), voitures sur les routes, train et bateaux qui partent et
reviennent, photo de la ville à partager.

## Ce qui n'est pas (encore) dans la V1

Saisons et événements, collections, succès. Voir [ROADMAP.md](ROADMAP.md).
