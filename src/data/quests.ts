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
      'Les habitants rêvent de croissants chauds. Construisez une boulangerie, approvisionnez-la en marchandises, puis encaissez la recette une fois les clients servis.',
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
      'Terminer le chantier',
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
