import type { QuestDef } from '@/core/types';

/**
 * Objectifs guidés par Léa, l'adjointe au maire. Un objectif devient actif dès
 * que ses prérequis sont remplis ; plusieurs objectifs peuvent être actifs.
 */
export const QUESTS: readonly QuestDef[] = [
  {
    id: 'welcome',
    title: 'Bienvenue, Maire !',
    intro:
      'Bonjour, Maire ! Je suis Léa, votre adjointe. Ce terrain a un potentiel énorme ! Pour commencer, encaissez les loyers de vos habitants : touchez les maisons marquées d’une pièce.',
    icon: 'lea',
    tasks: [{ type: 'collectRent', count: 2 }],
    labels: ['Encaisser 2 loyers'],
    reward: { coins: 100, xp: 10 },
  },
  {
    id: 'harvest',
    title: 'Jour de récolte',
    intro:
      'Récoltez vos champs : les récoltes deviennent des marchandises, indispensables pour approvisionner les commerces. Un champ vide se replante en le touchant.',
    icon: 'strawberry',
    // Actif dès le départ : les récoltes faites avant la fin de « Bienvenue » comptent aussi.
    tasks: [{ type: 'harvest', count: 4 }],
    labels: ['Récolter 4 champs'],
    reward: { coins: 50, xp: 5, cash: 1 },
  },
  {
    id: 'plant',
    title: 'Semer l’avenir',
    intro:
      'Replantez vos champs ! Touchez un champ vide puis choisissez une culture. Les fraises poussent en 1 minute.',
    icon: 'plot',
    requires: { quests: ['harvest'] },
    tasks: [{ type: 'plant', count: 4 }],
    labels: ['Planter 4 cultures'],
    reward: { coins: 80, xp: 5 },
  },
  {
    id: 'bakery',
    title: 'Une boulangerie !',
    intro:
      'Les habitants rêvent de croissants chauds. Construisez une boulangerie : le chantier dure une minute, touchez-la ensuite pour l’inaugurer. Approvisionnez-la en marchandises, puis encaissez la recette une fois les clients servis.',
    icon: 'bakery',
    requires: { quests: ['harvest'] },
    tasks: [
      { type: 'place', count: 1, defId: 'bakery' },
      { type: 'build', count: 1, defId: 'bakery' },
      { type: 'supply', count: 1, defId: 'bakery' },
      { type: 'collectBusiness', count: 1, defId: 'bakery' },
    ],
    labels: [
      'Acheter une boulangerie',
      'Inaugurer la boulangerie',
      'Approvisionner la boulangerie',
      'Encaisser la boulangerie',
    ],
    reward: { coins: 250, xp: 20, cash: 2 },
  },
  {
    id: 'decor',
    title: 'Une ville coquette',
    intro: 'Les décorations augmentent les loyers et les recettes des bâtiments voisins. Embellissons la ville !',
    icon: 'flower_bed',
    requires: { quests: ['plant'] },
    tasks: [{ type: 'place', count: 3, category: 'decoration' }],
    labels: ['Placer 3 décorations'],
    reward: { coins: 100, xp: 5 },
  },
  {
    id: 'houses',
    title: 'Nouveaux habitants',
    intro: 'Plus d’habitants, c’est plus de loyers et de clients pour nos commerces. Construisons des maisons !',
    icon: 'cottage',
    requires: { quests: ['bakery'] },
    tasks: [{ type: 'build', count: 2, category: 'house' }],
    labels: ['Construire 2 habitations'],
    reward: { coins: 200, xp: 10 },
  },
  {
    id: 'roads',
    title: 'Tout un réseau',
    intro: 'Les habitants adorent se promener. Prolongez le réseau routier !',
    icon: 'road',
    requires: { quests: ['decor'] },
    tasks: [{ type: 'place', count: 8, defId: 'road' }],
    labels: ['Poser 8 routes'],
    reward: { coins: 120, xp: 5 },
  },
  {
    id: 'school',
    title: 'Place à l’éducation',
    intro:
      'Notre population approche de la limite fixée par la mairie. Construisez une école pour accueillir davantage de familles.',
    icon: 'school',
    requires: { quests: ['houses'] },
    tasks: [{ type: 'build', count: 1, defId: 'school' }],
    labels: ['Construire une école'],
    reward: { coins: 500, xp: 20, cash: 3 },
  },
  {
    id: 'flowers',
    title: 'Dites-le avec des fleurs',
    intro: 'Un fleuriste égaierait nos rues. Il faut 40 habitants pour qu’il s’installe.',
    icon: 'flower_shop',
    requires: { quests: ['houses'] },
    tasks: [
      { type: 'build', count: 1, defId: 'flower_shop' },
      { type: 'collectBusiness', count: 1, defId: 'flower_shop' },
    ],
    labels: ['Construire un fleuriste', 'Encaisser le fleuriste'],
    reward: { coins: 400, xp: 15 },
  },
  {
    id: 'expand',
    title: 'Voir plus grand',
    intro:
      'Nous manquons de place ! Touchez une zone verrouillée en bordure de la ville pour l’acheter (niveau 3 requis).',
    icon: 'expand',
    requires: { quests: ['school'] },
    tasks: [{ type: 'expand', count: 1 }],
    labels: ['Agrandir la ville'],
    reward: { coins: 500, xp: 25, cash: 5 },
  },
  {
    id: 'population',
    title: 'Une ville qui compte',
    intro: 'Atteignons 150 habitants ! Pensez aux bâtiments publics pour repousser la limite.',
    icon: 'townhouse',
    requires: { quests: ['school'] },
    tasks: [{ type: 'population', target: 150 }],
    labels: ['Atteindre 150 habitants'],
    reward: { coins: 1000, xp: 40 },
  },
  {
    id: 'mayor',
    title: 'Maire confirmé',
    intro: 'Votre ville prend forme. Continuez à progresser pour débloquer de nouveaux bâtiments !',
    icon: 'level',
    requires: { quests: ['expand'] },
    tasks: [{ type: 'level', target: 6 }],
    labels: ['Atteindre le niveau 6'],
    reward: { coins: 1500, cash: 5 },
  },
  {
    id: 'fishing',
    title: 'Le large nous appelle',
    intro:
      'Notre ville a la mer à ses pieds ! Construisez un ponton de pêche au bord de l’eau, puis envoyez la barque en mer : le poisson se transforme en marchandises.',
    icon: 'pier',
    requires: { quests: ['bakery'], level: 4 },
    tasks: [
      { type: 'place', count: 1, defId: 'pier' },
      { type: 'build', count: 1, defId: 'pier' },
      { type: 'sendBoat', count: 1 },
      { type: 'unloadBoat', count: 1 },
    ],
    labels: ['Acheter un ponton de pêche', 'Inaugurer le ponton', 'Envoyer la barque en mer', 'Décharger la pêche'],
    reward: { coins: 400, xp: 30, cash: 2 },
  },
  {
    id: 'boomtown',
    title: 'Ville en plein essor',
    intro: 'Les familles affluent ! Atteignez 300 habitants : les bâtiments publics repoussent la limite.',
    icon: 'apartments',
    requires: { level: 7 },
    tasks: [{ type: 'population', target: 300 }],
    labels: ['Atteindre 300 habitants'],
    reward: { coins: 2000, cash: 3 },
  },
  {
    id: 'cinema',
    title: 'Silence, on tourne !',
    intro: 'Un cinéma ferait de notre ville la sortie préférée de la région.',
    icon: 'cinema',
    requires: { level: 10 },
    tasks: [{ type: 'build', count: 1, defId: 'cinema' }],
    labels: ['Inaugurer un cinéma'],
    reward: { coins: 4000, cash: 5 },
  },
  {
    id: 'trawler',
    title: 'Cap sur la haute mer',
    intro: 'Avec un vrai port, nos chalutiers rapporteront des tonnes de poisson.',
    icon: 'fishing_port',
    requires: { level: 12 },
    tasks: [
      { type: 'build', count: 1, defId: 'fishing_port' },
      { type: 'unloadBoat', count: 2 },
    ],
    labels: ['Inaugurer un port de pêche', 'Décharger 2 pêches'],
    reward: { coins: 6000, cash: 5 },
  },
  {
    id: 'hospital',
    title: 'Prendre soin de chacun',
    intro: 'Une ville de cette taille mérite un hôpital digne de ce nom.',
    icon: 'hospital',
    requires: { level: 13 },
    tasks: [{ type: 'build', count: 1, defId: 'hospital' }],
    labels: ['Inaugurer un hôpital'],
    reward: { coins: 8000, cash: 3 },
  },
  {
    id: 'station',
    title: 'En voiture !',
    intro: 'Une gare reliera notre ville au reste du pays et attirera de nouveaux habitants.',
    icon: 'train_station',
    requires: { level: 16 },
    tasks: [{ type: 'build', count: 1, defId: 'train_station' }],
    labels: ['Inaugurer une gare'],
    reward: { coins: 12000, cash: 5 },
  },
  {
    id: 'bridge',
    title: 'Sur l’autre rive',
    intro:
      'De l’autre côté du bras de mer, une rive entière attend nos habitants ! Construisez un pont d’une rive à l’autre, puis achetez votre première zone sur la rive est.',
    icon: 'bridge',
    requires: { level: 15 },
    tasks: [
      { type: 'build', count: 1, defId: 'bridge' },
      { type: 'expand', count: 1 },
    ],
    labels: ['Inaugurer un pont', 'Agrandir la ville'],
    reward: { coins: 10000, cash: 5 },
  },
  {
    id: 'metropolis',
    title: 'Une vraie métropole',
    intro: 'Plus de 1 500 habitants : votre ville change de dimension !',
    icon: 'residence',
    requires: { level: 18 },
    tasks: [{ type: 'population', target: 1500 }],
    labels: ['Atteindre 1 500 habitants'],
    reward: { coins: 15000, cash: 5 },
  },
  {
    id: 'university',
    title: 'Ville étudiante',
    intro: 'Une université ferait rayonner notre ville bien au-delà de la région.',
    icon: 'university',
    requires: { level: 20 },
    tasks: [{ type: 'build', count: 1, defId: 'university' }],
    labels: ['Inaugurer une université'],
    reward: { coins: 20000, cash: 10 },
  },
  {
    id: 'mall',
    title: 'Le paradis du shopping',
    intro: 'Un centre commercial ? Les habitants n’attendaient que ça.',
    icon: 'mall',
    requires: { level: 22 },
    tasks: [{ type: 'build', count: 1, defId: 'mall' }],
    labels: ['Inaugurer un centre commercial'],
    reward: { coins: 30000, cash: 5 },
  },
  {
    id: 'skyline',
    title: 'Toucher le ciel',
    intro: 'Le premier gratte-ciel de la ville sera visible depuis la mer.',
    icon: 'skyscraper',
    requires: { level: 25 },
    tasks: [{ type: 'build', count: 1, defId: 'skyscraper' }],
    labels: ['Inaugurer un gratte-ciel'],
    reward: { coins: 40000, cash: 10 },
  },
  {
    id: 'airport',
    title: 'Prêts au décollage',
    intro: 'Avec un aéroport, les touristes du monde entier découvriront votre ville.',
    icon: 'airport',
    requires: { level: 29 },
    tasks: [{ type: 'build', count: 1, defId: 'airport' }],
    labels: ['Inaugurer un aéroport'],
    reward: { coins: 60000, cash: 15 },
  },
  {
    id: 'stadium',
    title: 'La ville de vos rêves',
    intro: 'Dernier défi : un stade pour célébrer tout le chemin parcouru, Maire !',
    icon: 'stadium',
    requires: { level: 30 },
    tasks: [{ type: 'build', count: 1, defId: 'stadium' }],
    labels: ['Inaugurer le stade'],
    reward: { coins: 100000, cash: 25 },
  },
];

const BY_ID = new Map(QUESTS.map((quest) => [quest.id, quest]));

export function findQuestDef(id: string): QuestDef | undefined {
  return BY_ID.get(id);
}

export function getQuestDef(id: string): QuestDef {
  const quest = BY_ID.get(id);
  if (!quest) throw new Error(`Objectif inconnu : ${id}`);
  return quest;
}
