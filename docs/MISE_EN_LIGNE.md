# Mettre le jeu en ligne (Convex)

Le serveur du jeu est écrit et testé (`convex/`) : comptes avec pseudo, sauvegarde en ligne, voisins,
classement, marché, mesures d'audience et interface admin. Tant qu'il n'est pas branché, le jeu tourne en
**mode démo** (voisins et offres fictifs, rien n'est envoyé).

## 1. Créer le projet Convex (dans le navigateur, une fois)

1. Sur [dashboard.convex.dev](https://dashboard.convex.dev) : _Log in with GitHub_, puis **Create Project**
   (`city-ville`).
2. En haut, choisis le déploiement **Production**, puis **Settings** :
   - **Environment Variables** : ajoute `ADMIN_KEY` = une phrase longue et secrète (16 caractères ou plus),
     à garder dans ton gestionnaire de mots de passe. C'est la clé de l'interface admin.
   - **General › Deploy Keys › Create Deploy Key** : copie la clé (elle n'est affichée qu'une fois).
   - Note la **Cloud URL** (`https://….convex.cloud`) : elle va dans `.env.production` (déjà fait pour
     `combative-wombat-666`).
3. Sur GitHub : dépôt › **Settings › Secrets and variables › Actions › New repository secret**,
   nom `CONVEX_DEPLOY_KEY`, valeur = la clé copiée. Ne la colle jamais dans un chat ni dans le code.

## 2. Envoi automatique du serveur

À chaque fusion sur `main`, la CI vérifie le projet puis envoie le dossier `convex/` sur la production
(tâche « Déploiement Convex » dans l'onglet **Actions** de GitHub). Pour relancer l'envoi à la main :
Actions › CI › **Run workflow** sur `main`. Dans le tableau de bord Convex, l'onglet **Functions** liste alors
`players`, `saves`, `market`…

Le jeu compilé (`npm run build`, donc `npm run ios:sync`) se connecte à l'adresse de `.env.production`.
`npm run dev` reste en **mode démo** tant qu'aucun déploiement de développement n'est configuré.

## 3. Développer avec un serveur de test (facultatif, sur ton Mac)

```bash
npx convex dev
npx convex env set ADMIN_KEY "une-phrase-longue-et-secrete-de-plus-de-16-caracteres"
```

`npx convex dev` crée un déploiement de développement, écrit son adresse dans `.env.local` (utilisée par
`npm run dev`) et envoie chaque modification de `convex/` pendant que tu développes, sans toucher à la
production. L'interface admin est sur `/admin.html` (saisis la clé admin).

**Compte testeur** : la boutique (paiements simulés) et les outils de test ne s'affichent que pour un compte
marqué « testeur ». Dans l'admin, carte « Trouver un joueur », cherche ton pseudo et clique « Rendre testeur ».
En développement (`npm run dev`), tout est visible.

**Politique de confidentialité** : servie par Convex sur `https://<déploiement>.convex.site/confidentialite`
(en production : https://combative-wombat-666.eu-west-1.convex.site/confidentialite). C'est l'adresse à donner
à App Store Connect. L'adresse de contact se règle dans `convex/privacy.ts` (`PRIVACY_CONTACT`).

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
