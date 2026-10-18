# Mettre le jeu en ligne (Convex)

Le serveur du jeu est écrit et testé (`convex/`) : comptes avec pseudo, sauvegarde en ligne, voisins,
classement, marché, mesures d'audience et interface admin. Tant qu'il n'est pas branché, le jeu tourne en
**mode démo** (voisins et offres fictifs, rien n'est envoyé).

## 1. Créer le projet Convex (une fois, sur ton Mac)

1. Crée un compte sur [convex.dev](https://convex.dev) (connexion avec GitHub, gratuit pour démarrer).
2. Dans le Terminal, à la racine du projet :
   ```bash
   npm install
   npx convex dev
   ```
   La commande ouvre le navigateur pour te connecter, propose de créer un projet (nomme-le `city-ville`),
   envoie le code du dossier `convex/` et écrit l'adresse du serveur dans `.env.local`
   (`VITE_CONVEX_URL=…` et `CONVEX_DEPLOYMENT=…`). Laisse-la tourner pendant que tu développes : chaque
   modification de `convex/` est envoyée automatiquement.
3. Toujours dans le Terminal, choisis la **clé admin** (longue et secrète, à garder dans ton gestionnaire de
   mots de passe) :
   ```bash
   npx convex env set ADMIN_KEY "une-phrase-longue-et-secrete-de-plus-de-16-caracteres"
   ```
4. Lance le jeu (`npm run dev`) : l'écran de pseudo apparaît, la sauvegarde part en ligne.
   L'interface admin est sur `/admin.html` (saisis la clé admin).

> Si une session Claude doit déployer pour toi, ajoute plutôt une **clé de déploiement** (Convex › Settings ›
> Deploy keys) comme secret `CONVEX_DEPLOY_KEY` dans les réglages de l'environnement — jamais dans le chat.

## 2. Production

```bash
npx convex deploy          # envoie le serveur sur le déploiement de production
npx convex env set ADMIN_KEY "…" --prod
```

Puis construis le jeu avec l'adresse de production (`VITE_CONVEX_URL=https://….convex.cloud npm run build`).
L'adresse de production est visible dans le tableau de bord Convex.

## Ce que fait le serveur

| Module           | Rôle                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `players.ts`     | Inscription (pseudo unique), code de transfert vers un autre appareil, suppression du compte |
| `saves.ts`       | Sauvegarde avec révisions (conflits entre appareils), relue par le moteur du jeu             |
| `neighbors.ts`   | Voisins, recherche, suggestions, visites, coup de main quotidien                             |
| `leaderboard.ts` | Classements par niveau et par population                                                     |
| `market.ts`      | Marché : lots de marchandises, achat atomique, taxe, invendus                                |
| `moderation.ts`  | Blocage et signalement (exigés par Apple pour le contenu entre joueurs)                      |
| `stats.ts`       | Sessions (signal chaque minute) et évènements de progression                                 |
| `admin.ts`       | Tableau de bord : audience, rétention J1/J7/J30 par cohorte, temps de jeu, entonnoir…        |

**Identité** : chaque appareil reçoit une clé secrète aléatoire ; le serveur n'en garde que l'empreinte
(SHA-256). Pas d'e-mail ni de mot de passe : le pseudo suffit. On ajoutera « Se connecter avec Apple » pour
retrouver sa ville sans code de transfert.

**Anti-triche** : l'économie reste calculée sur l'appareil (jeu hors-ligne). Le serveur relit chaque
sauvegarde avec le moteur du jeu et signale les progressions invraisemblables dans l'admin (⚠). Les achats
réels (cash) devront être crédités par le serveur à partir des reçus RevenueCat avant la sortie publique.

**Tests** : `npm test` lance aussi les tests du serveur (`convex/backend.test.ts`, base simulée par
`convex-test`).
