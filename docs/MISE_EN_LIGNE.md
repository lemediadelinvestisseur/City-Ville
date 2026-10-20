# Mettre le jeu en ligne (Convex)

Le serveur du jeu est écrit et testé (`convex/`) : comptes avec pseudo, sauvegarde en ligne, voisins,
classement, marché, chat, annonces, rôles (administrateur et modérateurs), mesures d'audience et interface
admin. Tant qu'il n'est pas branché, le jeu tourne en
**mode démo** (voisins et offres fictifs, rien n'est envoyé).

## 1. Créer le projet Convex (dans le navigateur, une fois)

1. Sur [dashboard.convex.dev](https://dashboard.convex.dev) : _Log in with GitHub_, puis **Create Project**
   (`city-ville`).
2. En haut, choisis le déploiement **Production**, puis **Settings** :
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

## Version web (sans Xcode)

À chaque fusion sur `main`, la CI publie aussi le jeu sur **GitHub Pages** :
https://lemediadelinvestisseur.github.io/City-Ville/ (connecté au serveur de production).

1. Une fois : GitHub › dépôt › **Settings › Pages › Build and deployment › Source : GitHub Actions**
   (faisable depuis le téléphone, dans le navigateur).
2. Sur l'iPhone : ouvre l'adresse dans Safari, puis Partager › « Sur l'écran d'accueil ». Le jeu s'ouvre en
   plein écran, se met à jour tout seul à chaque fusion et reçoit les notifications (Web Push).
3. Pour retrouver sa ville de l'appli : dans l'appli, Réglages › Compte › « Code de transfert », puis saisir
   le code dans la version web.

## 3. Devenir l'administrateur (une fois)

L'interface admin et les données sont réservées à **un seul compte**, le tien. Il n'y a pas de mot de passe
à choisir : c'est ton compte de joueur qui reçoit le rôle d'administrateur.

1. Ouvre le jeu (version en ligne), choisis ta langue puis **ton pseudo** : ton compte est créé.
2. Donne-lui le rôle, au choix :
   - **Dans le navigateur** : [dashboard.convex.dev](https://dashboard.convex.dev) › projet › déploiement
     **Production** › **Functions** › `roles` › `setOwner` › **Run function**, avec les arguments
     `{ "pseudo": "TonPseudo" }`.
   - **Ou dans le Terminal** : `npx convex run --prod roles:setOwner '{"pseudo":"TonPseudo"}'`.

   Seul quelqu'un qui a accès à ton projet Convex peut le faire : le jeu et l'interface admin ne peuvent pas
   appeler cette fonction. Il n'y a **jamais qu'un seul** administrateur : relancer `setOwner` avec un autre
   pseudo retire le rôle au précédent (`roles:clearOwner` le retire à tout le monde).

3. L'interface admin est sur `/admin.html`. Dans le navigateur où tu joues avec ce compte, elle s'ouvre
   directement (bouton « Ouvrir l'interface admin » dans Réglages › Compte). Ailleurs (autre ordinateur, ou si
   tu joues sur iPhone) : dans le jeu, Réglages › Compte › « Code de transfert », puis saisis ce code sur la
   page admin. Un compte qui n'est pas administrateur est refusé, même avec un code valide.

L'ancienne variable `ADMIN_KEY` ne sert plus : tu peux la supprimer des **Environment Variables** de Convex.

## 4. Développer avec un serveur de test (facultatif, sur ton Mac)

```bash
npx convex dev
```

`npx convex dev` crée un déploiement de développement, écrit son adresse dans `.env.local` (utilisée par
`npm run dev`) et envoie chaque modification de `convex/` pendant que tu développes, sans toucher à la
production. Pour l'interface admin de ce serveur de test : `npx convex run roles:setOwner '{"pseudo":"…"}'`.

**Boutique et outils de test** : ils ne s'affichent que pour le compte administrateur (celui désigné par
`roles:setOwner`), c'est-à-dire toi. Les autres joueurs ne les voient pas. En développement (`npm run dev`) et
dans la démo hors ligne, tout reste visible.

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
| `market.ts`      | Marché : lots d'un produit, achat atomique, taxe, invendus                                   |
| `social.ts`      | Quartier : demandes de produits aux voisins, défi de la semaine, « J'aime » et classement    |
| `moderation.ts`  | Blocage et signalement (exigés par Apple pour le contenu entre joueurs)                      |
| `chat.ts`        | Chat (salon Monde + salon par langue), annonces, modération, purge à 30 jours (`crons.ts`)   |
| `roles.ts`       | Rôles : administrateur unique (ligne de commande), modérateurs nommés depuis l'admin         |
| `stats.ts`       | Sessions (signal chaque minute) et évènements de progression                                 |
| `push.ts`        | Notifications Web Push : abonnements, rappels programmés (envoi par `pushNode.ts`)           |
| `admin.ts`       | Tableau de bord (audience, rétention, langues, chat…), annonces, bannissements — admin seul  |

## Notifications Web Push

Dans le navigateur (et l'appli web ajoutée à l'écran d'accueil de l'iPhone), le jeu envoie au serveur la liste
de ses prochains rappels ; `push.ts` les programme et `pushNode.ts` les envoie à l'heure dite, même jeu fermé.
L'appli iOS (Capacitor) utilise, elle, les notifications locales du téléphone.

- **Rien à configurer** : les clés VAPID sont créées par le serveur au premier besoin (table `pushKeys`, la clé
  privée ne quitte jamais le serveur). Mets une vraie adresse dans `PRIVACY_CONTACT` (`convex/privacy.ts`) :
  elle sert aussi de contact pour les services d'envoi (Apple, Google, Mozilla).
- **iPhone (navigateur)** : Safari n'autorise les notifications que pour un site ajouté à l'écran d'accueil
  (Partager › « Sur l'écran d'accueil », iOS 16.4 ou plus récent) ; le jeu l'explique dans Réglages.
- Le serveur ne contacte que les services d'envoi connus (Apple, Google, Mozilla, Microsoft).

## Rôles

| Rôle           | Comment l'obtenir                                    | Ce qu'il permet                                                   |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Joueur         | Par défaut                                           | Jouer, chatter (dès le niveau 2), signaler, bloquer               |
| Modérateur     | Nommé par l'administrateur (admin › Équipe)          | Dans le jeu : supprimer un message du chat, rendre un joueur muet |
| Administrateur | `roles:setOwner` (voir plus haut, un seul à la fois) | Interface admin et toutes les données, annonces, bannissements    |

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
