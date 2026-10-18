import { isLanguage } from '@/data/languages';

/**
 * Règles du chat, partagées par le jeu et le serveur : longueur, niveau
 * minimal, cadence et nettoyage des messages (insultes et liens masqués).
 */

export const CHAT = {
  maxLength: 200,
  /** Niveau minimal pour écrire (limite les comptes jetables). */
  minLevel: 2,
  /** Délai minimal entre deux messages d'un même joueur. */
  minIntervalMs: 3000,
  /** Messages au plus par minute et par joueur. */
  maxPerMinute: 8,
  /** Messages renvoyés par salon. */
  pageSize: 60,
  /** Les messages sont effacés au bout de… */
  retentionMs: 30 * 86_400_000,
} as const;

/** Durées de mise en sourdine proposées aux modérateurs (minutes). */
export const MUTE_MINUTES = [60, 1440, 10080] as const;

/** Salon mondial ou salon d'une langue (« lang:fr »). */
export type ChatChannel = 'world' | `lang:${string}`;

/** Insultes courantes (plusieurs langues), comparées sans casse ni accents. */
const INSULTS = [
  'connard',
  'connasse',
  'salope',
  'pute',
  'encule',
  'batard',
  'fdp',
  'ntm',
  'nazi',
  'hitler',
  'fuck',
  'fucking',
  'bitch',
  'cunt',
  'asshole',
  'nigger',
  'nigga',
  'negro',
  'faggot',
  'puta',
  'puto',
  'cabron',
  'mierda',
  'caralho',
  'porra',
  'arschloch',
  'fotze',
  'hurensohn',
  'stronzo',
  'vaffanculo',
  'сука',
  'блядь',
  'хуй',
  'orospu',
  'siktir',
];

const strip = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');

/** Mot interdit, ou son pluriel en « s ». */
const isInsult = (word: string) =>
  INSULTS.includes(word) || (word.endsWith('s') && INSULTS.includes(word.slice(0, -1)));

const LINK =
  /(https?:\/\/|www\.)\S+|\b[\w.-]+@[\w-]+\.\w{2,}\b|\b[\w-]+\.(com|fr|net|org|io|gg|ly|me|xyz|ru|co)\b(\/\S*)?/giu;

/**
 * Nettoie un message : espaces normalisés, longueur bornée, liens et adresses
 * remplacés (hameçonnage, publicité), insultes masquées par des astérisques.
 */
export function cleanChatText(raw: string): string {
  let text = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  text = [...text].slice(0, CHAT.maxLength).join('');
  text = text.replace(LINK, '***');
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => (isInsult(strip(word)) ? '*'.repeat([...word].length) : word));
}

export function isChannel(channel: string): channel is ChatChannel {
  return channel === 'world' || (channel.startsWith('lang:') && isLanguage(channel.slice(5)));
}
