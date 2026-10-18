# Feuille de route

## V1 — prototype jouable ✅

Boucle complète (loyers, cultures, commerces, chantiers, énergie, niveaux, objectifs, agrandissements),
interface mobile, boutique en mode test, sauvegarde locale, graphismes procéduraux.

## V1.1 — chantiers à minuteur, niveau 30, pêche ✅

Chantiers à minuteur et inauguration, 65 constructions jusqu'au niveau 30 (~3 semaines, calibré par simulation),
mer et plages, ports et bateaux de pêche, 24 objectifs.

## V1.2 — deux rives, jour/nuit, en ligne ✅

Carte à deux rives et pont (niveau 15), minuteurs affichés en direct, cycle jour/nuit, serveur Convex
(pseudo, sauvegarde en ligne, voisins, visites, coup de main, classement, marché, modération), interface
admin (rétention, temps de jeu), projet iOS Capacitor.

## Pour la sortie sur l'App Store

- [ ] Créer le projet Convex et la clé admin ([MISE_EN_LIGNE.md](MISE_EN_LIGNE.md))
- [ ] Choisir le nom définitif et l'identifiant de bundle ; compte Apple Developer
- [ ] Paiements réels avec RevenueCat (cash crédité par le serveur à partir des reçus)
- [ ] « Se connecter avec Apple » pour retrouver sa ville sans code
- [ ] Politique de confidentialité, captures d'écran, classification d'âge
- [ ] Notifications (« vos fraises sont prêtes ! », « Léa vous a aidé »)
- [ ] TestFlight auprès de quelques joueurs, puis lancement en France

## V1.x — finition

- [ ] Vrais visuels (illustrateur ou packs sous licence) en remplaçant les textures de `render/art/`
- [ ] Musique d'ambiance, vibrations (Capacitor Haptics), réglage du volume
- [ ] Routes « au glissé », rotation des constructions, « tout encaisser » d'un geste
- [ ] Plus de contenu : bâtiments, cultures, objectifs, collections
- [ ] Traduction anglaise (extraire les textes de l'interface et du contenu)
- [ ] Tests de bout en bout (Playwright) dans la CI
- [ ] Découper `ui/UI.ts` (fenêtres dans un module dédié) à mesure que l'interface grossit

## V2 — plus loin

- [ ] Application Android (Capacitor) et paiement web (Stripe)
- [ ] Suivi des erreurs (ex. Sentry), agrégats nocturnes des statistiques quand l'audience grandit
- [ ] Économie validée par le serveur (actions rejouées avec `src/core`) pour un classement incontestable
- [ ] Cadeaux entre voisins, aide sur un chantier précis, marché d'objets (décorations rares)
- [ ] Gare et trains pour échanger des marchandises
- [ ] Objectifs collectifs, événements saisonniers

## Choix techniques

- **Phaser 4** pour le monde (WebGL), **HTML/CSS** pour l'interface, **TypeScript** strict, **Vite**.
- La logique (`src/core`) reste pure pour pouvoir être exécutée côté serveur.
- Capacitor plutôt qu'une réécriture native : un seul code pour le web, Android et iOS.
