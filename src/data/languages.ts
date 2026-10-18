/**
 * Langues proposées dans le jeu (partagées par le jeu et le serveur).
 * Le français est la langue source : les autres sont des traductions
 * (src/i18n/locales/*). Pour en ajouter une : une entrée ici + un fichier de traduction.
 */
export const LANGUAGES = [
  { code: 'fr', name: 'Français', intl: 'fr-FR' },
  { code: 'en', name: 'English', intl: 'en-US' },
  { code: 'es', name: 'Español', intl: 'es-ES' },
  { code: 'pt', name: 'Português', intl: 'pt-BR' },
  { code: 'de', name: 'Deutsch', intl: 'de-DE' },
  { code: 'it', name: 'Italiano', intl: 'it-IT' },
  { code: 'ru', name: 'Русский', intl: 'ru-RU' },
  { code: 'tr', name: 'Türkçe', intl: 'tr-TR' },
  { code: 'ja', name: '日本語', intl: 'ja-JP' },
  { code: 'ko', name: '한국어', intl: 'ko-KR' },
  { code: 'zh', name: '简体中文', intl: 'zh-CN' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

export const SOURCE_LANGUAGE: Language = 'fr';

export function isLanguage(code: unknown): code is Language {
  return typeof code === 'string' && LANGUAGES.some((l) => l.code === code);
}

/** Première langue proposée qui correspond aux préférences de l'appareil (« pt-BR » → « pt »), sinon l'anglais. */
export function matchLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}
