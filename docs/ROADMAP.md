# Feuille de route

## V1 — prototype jouable ✅

Boucle complète (loyers, cultures, commerces, chantiers, énergie, niveaux, objectifs, agrandissements),
interface mobile, boutique en mode test, sauvegarde locale, graphismes procéduraux.

## V1.1 — chantiers à minuteur, niveau 30, pêche ✅

Chantiers à minuteur et inauguration, 65 constructions jusqu'au niveau 30 (~3 semaines, calibré par simulation),
mer et plages, ports et bateaux de pêche, 24 objectifs.

## V1.x — finition

- [ ] Vrais visuels (illustrateur ou packs sous licence) en remplaçant les textures de `render/art/`
- [ ] Musique d'ambiance, vibrations (Capacitor Haptics), réglage du volume
- [ ] Routes « au glissé », rotation des constructions, « tout encaisser » d'un geste
- [ ] Plus de contenu : bâtiments, cultures, objectifs, collections
- [ ] Traduction anglaise (extraire les textes de l'interface et du contenu)
- [ ] Tests de bout en bout (Playwright) dans la CI
- [ ] Découper `ui/UI.ts` (fenêtres dans un module dédié) à mesure que l'interface grossit

## V2 — en ligne

- [ ] Serveur + base de données (comptes, sauvegarde en ligne, autorité sur l'économie)
- [ ] Paiement réel : RevenueCat (iOS / Android) et Stripe (web) — voir [MONETIZATION.md](MONETIZATION.md)
- [ ] Notifications (« vos fraises sont prêtes ! »)
- [ ] Analytique respectueuse de la vie privée, suivi des erreurs (ex. Sentry)
- [ ] Applications Android et iOS via **Capacitor** (icônes, écran de démarrage, fiches des stores,
      classification d'âge, politique de confidentialité)

## V3 — social

- [ ] Voisins : visiter leurs villes, les aider (accélérer un chantier, arroser un champ), cadeaux
- [ ] Gare et trains pour échanger des marchandises
- [ ] Objectifs collectifs, classements, événements saisonniers

## Choix techniques

- **Phaser 4** pour le monde (WebGL), **HTML/CSS** pour l'interface, **TypeScript** strict, **Vite**.
- La logique (`src/core`) reste pure pour pouvoir être exécutée côté serveur.
- Capacitor plutôt qu'une réécriture native : un seul code pour le web, Android et iOS.
