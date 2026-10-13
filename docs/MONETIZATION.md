# Monétisation et paiements

## Modèle

Jeu gratuit (« free-to-play ») avec une **monnaie premium**, le _cash_, comme les city-builders de référence.

| Source de revenus                | V1 (prototype)             | Plus tard                                          |
| -------------------------------- | -------------------------- | -------------------------------------------------- |
| Packs de cash (achats intégrés)  | ✅ simulés                 | Paiement réel via les stores / Stripe              |
| Pack de démarrage (achat unique) | ✅ simulé                  | Offres limitées dans le temps                      |
| Abonnement (« Pass du maire »)   | —                          | Cash quotidien, énergie max augmentée, cosmétiques |
| Vidéos récompensées              | —                          | Énergie ou accélération contre une pub (optionnel) |
| Cosmétiques premium              | ✅ Chalet, Fontaine (cash) | Collections, thèmes saisonniers                    |

Ce que le cash permet d'acheter : terminer un chantier ou une attente, recharger l'énergie, échanger contre des
pièces, constructions et décorations premium. Pas de « loot box » (boîtes à contenu aléatoire payantes).

## Architecture dans le code

```
UI (Shop) ──purchase(product)──► PaymentProvider ──► { success | cancelled | error }
                                        │
                     success ───────────┴──► game.grantStoreProduct(productId)
```

- `src/data/products.ts` : catalogue (packs de cash, offres en cash).
- `src/services/payments/PaymentProvider.ts` : l'interface que le jeu utilise.
- `src/services/payments/MockPaymentProvider.ts` : **mode test** — confirmation « paiement simulé », aucun
  débit, aucune donnée bancaire.
- `Game.grantStoreProduct()` : crédite la récompense (et bloque la répétition des offres uniques).

Changer de moyen de paiement = écrire une nouvelle classe qui implémente `PaymentProvider` et la passer dans
`src/main.ts`. Le reste du jeu ne change pas.

## Passer au paiement réel

### 1. Un serveur devient indispensable

Aujourd'hui la partie est stockée dans le navigateur : un joueur peut la modifier. Avant de vendre quoi que ce
soit :

1. **Comptes joueurs** (anonymes au départ, puis liés à Apple / Google / e-mail).
2. **Sauvegarde en ligne**, le serveur faisant autorité sur le cash (et idéalement sur toute l'économie : la
   logique de `src/core` est pure et peut tourner telle quelle côté serveur pour valider les actions).
3. **Validation des achats côté serveur** : le client n'accorde jamais lui-même la récompense. Le serveur
   reçoit la preuve d'achat (reçu ou webhook), la vérifie, crédite une seule fois par identifiant de
   transaction (idempotence), puis le client se resynchronise.

### 2. Un fournisseur par plateforme

| Plateforme            | Solution recommandée                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS / Android         | App Store (StoreKit) et Google Play Billing, idéalement via **RevenueCat** (plugin Capacitor), qui unifie les deux stores, valide les reçus et envoie des webhooks au serveur |
| Web (navigateur, PWA) | **Stripe Checkout** créé par le serveur + webhook `checkout.session.completed`, ou un « merchant of record » (Paddle, Lemon Squeezy) qui gère la TVA à votre place            |

Règle importante : dans une application iOS ou Android, les biens numériques utilisés dans le jeu doivent en
principe passer par le système d'achat du store (commission de 15 à 30 %). Des exceptions existent selon les
pays (Union européenne, États-Unis…) et évoluent vite : à vérifier au moment de la publication.

### 3. Prix

Afficher les prix localisés fournis par le store (`PaymentProvider.priceLabel`), toutes taxes comprises.
Les prix de `products.ts` ne sont que des valeurs par défaut pour le mode test.

## Points de conformité (France / UE) — à valider avec un juriste

- **Droit de rétractation** : pour du contenu numérique fourni immédiatement, il faut le consentement explicite
  du joueur et sa reconnaissance de la perte du droit de rétractation (les stores l'intègrent ; sur le web, à
  prévoir dans le parcours d'achat).
- **Monnaies virtuelles** : la Commission européenne et le réseau des autorités de protection des
  consommateurs (CPC) ont publié en 2025 des principes sur les monnaies virtuelles des jeux : afficher clairement
  le coût réel, ne pas obscurcir les prix, éviter les pratiques trompeuses.
- **Mineurs** : pas d'incitation directe à l'achat visant les enfants, contrôle parental des stores,
  classification d'âge (PEGI / stores).
- **RGPD** : consentement pour l'analytique et la publicité, politique de confidentialité, suppression des
  données sur demande.
- **TVA** : gérée par les stores (et par un « merchant of record » sur le web) ; à votre charge avec Stripe seul.

## Indicateurs à suivre

Conversion payante, revenu moyen par joueur actif (ARPDAU), rétention J1 / J7 / J30, sources de cash
dépensé (accélérations, énergie, premium) pour ajuster l'équilibrage.
