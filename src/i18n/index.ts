import { LANGUAGES, SOURCE_LANGUAGE, isLanguage, matchLanguage, type Language } from '@/data/languages';
import { FR } from './fr';
import type { ContentTranslations, MessageKey, Params, PluralKey, Translation } from './types';

export type { Language } from '@/data/languages';
export type { MessageKey, Params, PluralKey } from './types';

/**
 * Traductions de l'interface. Le français (fr.ts) est la langue source,
 * toujours chargée ; les autres langues sont chargées à la demande au
 * démarrage (un fichier par langue). Changer de langue recharge le jeu.
 *
 * Textes : `t('clé', { nom: valeur })` remplace `{nom}` ; les nombres sont mis
 * en forme selon la langue. Pluriels : `tn('clé', n)` choisit « clé#one »,
 * « clé#other » (et « clé#few », « clé#many »… selon la langue).
 */

const LOADERS = import.meta.glob<{ default: Translation }>('./locales/*.ts');

let current: Language = SOURCE_LANGUAGE;
let messages: Partial<Record<string, string>> = FR;
let content: ContentTranslations | null = null;
let intl = 'fr-FR';
let plurals = new Intl.PluralRules(intl);
let numbers = new Intl.NumberFormat(intl);

/** Langue affichée. */
export function language(): Language {
  return current;
}

/** Code de langue pour les API `Intl` (« fr-FR »). */
export function intlLocale(): string {
  return intl;
}

/** Contenu traduit de la langue active (null en français, langue des données). */
export function contentTranslations(): ContentTranslations | null {
  return content;
}

/** Active une langue dont la traduction est déjà chargée (tests, démarrage). */
export function useTranslation(code: Language, translation: Translation | null): void {
  current = code;
  messages = translation ? { ...FR, ...translation.messages } : FR;
  content = translation?.content ?? null;
  intl = LANGUAGES.find((l) => l.code === code)?.intl ?? 'fr-FR';
  plurals = new Intl.PluralRules(intl);
  numbers = new Intl.NumberFormat(intl);
}

/** Charge puis active une langue ; repli sur le français si le fichier est introuvable. */
export async function loadLanguage(code: Language): Promise<void> {
  if (code === SOURCE_LANGUAGE) {
    useTranslation(code, null);
    return;
  }
  const loader = LOADERS[`./locales/${code}.ts`];
  if (!loader) {
    useTranslation(SOURCE_LANGUAGE, null);
    return;
  }
  try {
    useTranslation(code, (await loader()).default);
  } catch (error) {
    console.error(error);
    useTranslation(SOURCE_LANGUAGE, null);
  }
}

/** Langues dont une traduction est disponible (le français et chaque fichier de locales/). */
export function availableLanguages(): Language[] {
  return LANGUAGES.map((l) => l.code).filter((code) => code === SOURCE_LANGUAGE || `./locales/${code}.ts` in LOADERS);
}

/** Langue à proposer d'après les réglages de l'appareil. */
export function detectLanguage(preferred: readonly string[]): Language {
  const available = availableLanguages();
  const match = matchLanguage(preferred);
  if (available.includes(match)) return match;
  return available.includes('en') ? 'en' : SOURCE_LANGUAGE;
}

export { isLanguage };

export function formatNumber(value: number): string {
  return numbers.format(Math.floor(value));
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

/** Texte traduit (repli sur le français, puis sur la clé elle-même). */
export function t(key: MessageKey, params?: Params): string {
  return interpolate(messages[key] ?? FR[key] ?? key, params);
}

/** Texte au pluriel selon `count` (disponible dans les paramètres sous le nom `n`). */
export function tn(key: PluralKey, count: number, params?: Params): string {
  const form = plurals.select(count);
  const text = messages[`${key}#${form}`] ?? messages[`${key}#other`] ?? key;
  return interpolate(text, { n: count, ...params });
}

/**
 * Comme `t`, mais certains paramètres peuvent être des éléments (icônes,
 * pseudo en gras…) : renvoie les morceaux dans l'ordre de la phrase traduite.
 */
export function tParts<T>(key: MessageKey, params: Record<string, string | number | T>): Array<string | T> {
  const text = messages[key] ?? FR[key] ?? key;
  const parts: Array<string | T> = [];
  let last = 0;
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    const name = match[1] ?? '';
    if (!(name in params)) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    const value = params[name] as string | number | T;
    parts.push(typeof value === 'number' ? formatNumber(value) : value);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Liste lisible : « Léa, Paul et Zoé » / « Léa, Paul and Zoé ». */
export function formatList(items: string[]): string {
  try {
    return new Intl.ListFormat(intl, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** « il y a 5 min », « dans 2 h »… */
export function formatRelative(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto', style: 'short' });
  if (abs < 60_000) return rtf.format(0, 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

/** Heure courte (« 14:05 », « 2:05 PM »). */
export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit' }).format(ms);
}
