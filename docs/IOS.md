# Application iPhone (Capacitor → TestFlight → App Store)

Le projet Xcode est prêt dans `ios/` (Capacitor 8, Swift Package Manager). Le jeu web compilé y est embarqué.

## Prérequis (sur ton Mac)

- **Xcode** (App Store, gratuit) puis, une fois, `xcode-select --install` dans le Terminal.
- **Node.js 22** ou plus récent ([nodejs.org](https://nodejs.org)).
- Un **compte Apple Developer** (99 $/an) créé avec une adresse dédiée à l'app.

## Tester sur ton iPhone

```bash
git clone https://github.com/lemediadelinvestisseur/City-Ville.git
cd City-Ville
npm install
npm run ios:sync     # compile le jeu et le copie dans le projet iOS
npm run ios:open     # ouvre Xcode
```

Dans Xcode : sélectionne la cible **App** › onglet **Signing & Capabilities** › coche « Automatically manage
signing » et choisis ton équipe (Team). Branche ton iPhone, choisis-le en haut, puis ▶︎.
(La première fois, l'iPhone demande d'activer le **mode développeur** : Réglages › Confidentialité et sécurité.)

## Avant la première publication

1. **Nom et identifiant** : dans `capacitor.config.ts`, remplace `appName` et `appId`
   (`fr.lemediadelinvestisseur.cityville` est provisoire ; l'identifiant ne peut plus changer après la
   publication). Mets le même identifiant dans Xcode (Bundle Identifier) et `npm run ios:sync`.
2. **Serveur de production** : son adresse est dans `.env.production`, reprise automatiquement par
   `npm run ios:sync` (voir [MISE_EN_LIGNE.md](MISE_EN_LIGNE.md)).
3. **Désactiver les outils de test** : `DEV_TOOLS = false` dans `src/config.ts`.
4. **Paiements** : remplacer le fournisseur de test par RevenueCat (voir [MONETIZATION.md](MONETIZATION.md)).
5. **App Store Connect** ([appstoreconnect.apple.com](https://appstoreconnect.apple.com)) › Apps › « + » :
   nom, langue principale (français), identifiant de bundle, SKU.

## Envoyer sur TestFlight

1. Dans Xcode : en haut, choisis **Any iOS Device (arm64)**, puis menu **Product › Archive**.
2. Dans l'organiseur qui s'ouvre : **Distribute App › App Store Connect › Upload**.
3. Après 10 à 30 minutes, la version apparaît dans App Store Connect › TestFlight.
4. **Testeurs internes** (toi, jusqu'à 100 personnes de l'équipe) : immédiat.
   **Testeurs externes** (lien public, jusqu'à 10 000) : une vérification rapide d'Apple (≈ 1 jour).
5. Les testeurs installent l'app **TestFlight** et ouvrent ton lien d'invitation.

À chaque nouvelle version : augmente le numéro de build (Xcode › cible App › General › Build), puis
`npm run ios:sync` et recommence l'archive.

## Ce qu'Apple vérifiera (déjà prévu dans le jeu)

- **Suppression du compte** depuis l'app : Réglages › Compte › « Supprimer mon compte » ✅
- **Contenu entre joueurs** (pseudos, villes) : signaler et bloquer un joueur ✅, modération dans l'admin ✅
- **Achats** : uniquement par les achats intégrés d'Apple pour le cash (RevenueCat) — à brancher
- **Politique de confidentialité** : une page web à fournir (données : pseudo, sauvegarde, statistiques de jeu)
- **Classification d'âge** et captures d'écran (6,9 pouces et 6,5 pouces) dans App Store Connect
- Le nom de l'app ne doit pas reprendre une marque existante (« CityVille » appartient à Zynga)

## Intégrations natives déjà en place

- Sauvegarde recopiée dans le stockage natif (iOS peut vider le stockage web d'une app)
- Vibrations légères sur les actions, plus fortes au passage de niveau
- Barre d'état et écran de démarrage aux couleurs du jeu, orientation portrait sur iPhone
