# Mettre le jeu en ligne (Convex)

Le serveur du jeu est écrit et testé (`convex/`) : comptes avec pseudo, sauvegarde en ligne, voisins,
classement, marché, chat, annonces, rôles (administrateur et modérateurs), mesures d'audience et interface admin. Tant qu'il n'est pas branché, le jeu tourne en
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
3. Lance le jeu (`npm run dev`), choisis ta langue puis **ton pseudo** : ton compte est créé.
4. Toujours dans le Terminal, fais de ce compte **l'administrateur** (remplace `MonPseudo`) :
   ```bash
   npx convex run roles:setOwner '{"pseudo":"MonPseudo"}'
   ```
   C'est la seule façon de devenir administrateur : la commande exige l'accès à ton projet Convex, personne
   d'autre ne peut la lancer. Il n'y a **jamais qu'un seul** administrateur : relancer la commande avec un
   autre pseudo retire le rôle au précédent (`npx convex run roles:clearOwner` le retire à tout le monde).
5. L'interface admin est sur `/admin.html`. Dans le navigateur où tu joues avec ce compte, elle s'ouvre
   directement (bouton « Ouvrir l'interface admin » dans Réglages › Compte). Ailleurs (autre ordinateur, ou si
   tu joues sur iPhone) : dans le jeu, Réglages › Compte › « Code de transfert », puis saisis ce code sur la
   page admin. Un compte qui n'est pas administrateur est refusé, même avec un code valide.

> Si une session Claude doit déployer pour toi, ajoute plutôt une **clé de déploiement** (Convex › Settings ›
> Deploy keys) comme secret `CONVEX_DEPLOY_KEY` dans les réglages de l'environnement — jamais dans le chat.

## 2. Production

```bash
npx convex deploy          # envoie le serveur sur le déploiement de production
# Une fois ton compte créé sur le jeu de production :
npx convex run --prod roles:setOwner '{"pseudo":"MonPseudo"}'
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
| `chat.ts`        | Chat (salon Monde + salon par langue), annonces, modération, purge à 30 jours (`crons.ts`)   |
| `roles.ts`       | Rôles : administrateur unique (ligne de commande), modérateurs nommés depuis l'admin         |
| `stats.ts`       | Sessions (signal chaque minute) et évènements de progression                                 |
| `admin.ts`       | Tableau de bord (audience, rétention, langues, chat…), annonces, bannissements — admin seul  |

## Rôles

| Rôle           | Comment l'obtenir                                   | Ce qu'il permet                                                   |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Joueur         | Par défaut                                          | Jouer, chatter (dès le niveau 2), signaler, bloquer               |
| Modérateur     | Nommé par l'administrateur (admin › Équipe)         | Dans le jeu : supprimer un message du chat, rendre un joueur muet |
| Administrateur | `npx convex run roles:setOwner` (un seul à la fois) | Interface admin et toutes les données, annonces, bannissements    |

Chaque fonction de `admin.ts` et `roles.ts` vérifie le rôle côté serveur : l'interface admin n'est qu'un
affichage, les données ne sortent jamais pour un autre compte. Un compte banni perd ses droits.

## Chat

- Deux salons : **Monde** (tout le monde) et celui de la **langue** du joueur.
- Écriture à partir du niveau 2, 200 caractères, 1 message toutes les 3 s (8 par minute au plus) ; liens,
  adresses e-mail et insultes courantes sont masqués (`src/core/chat.ts`, règles partagées avec le jeu).
- Toucher un message : visiter la ville de l'auteur, signaler (examiné dans l'admin), bloquer (ses messages
  disparaissent pour toi). L'équipe peut aussi supprimer le message ou rendre l'auteur muet (1 h, 24 h, 7 j).
- Les messages de plus de 30 jours sont effacés chaque nuit.

**Identité** : chaque appareil reçoit une clé secrète aléatoire ; le serveur n'en garde que l'empreinte
(SHA-256). Pas d'e-mail ni de mot de passe : le pseudo suffit. On ajoutera « Se connecter avec Apple » pour
retrouver sa ville sans code de transfert.

**Anti-triche** : l'économie reste calculée sur l'appareil (jeu hors-ligne). Le serveur relit chaque
sauvegarde avec le moteur du jeu et signale les progressions invraisemblables dans l'admin (⚠). Les achats
réels (cash) devront être crédités par le serveur à partir des reçus RevenueCat avant la sortie publique.

**Tests** : `npm test` lance aussi les tests du serveur (`convex/backend.test.ts`, base simulée par
`convex-test`).
