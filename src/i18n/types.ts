import type { FR } from './fr';

/** Clé d'un texte de l'interface (les textes français de src/i18n/fr.ts font référence). */
export type MessageKey = keyof typeof FR;

/** Clés plurielles : « clé#one » / « clé#other » dans fr.ts, utilisées avec `tn(clé, nombre)`. */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Base}#other` ? Base : never) : never;

/** Catégories de pluriel supplémentaires (russe : few / many…), facultatives. */
type ExtraPlural = 'zero' | 'two' | 'few' | 'many';

/** Textes de l'interface d'une langue : toutes les clés françaises sont obligatoires. */
export type Messages = { [K in MessageKey]: string } & { [K in `${PluralKey}#${ExtraPlural}`]?: string };

/** Traduction du contenu du jeu (src/data), indexée par identifiant. */
export interface ContentTranslations {
  buildings: Record<string, { name: string; description: string }>;
  /** Catégories du menu Construire. */
  categories: Record<string, string>;
  crops: Record<string, string>;
  trips: Record<string, string>;
  /** Livraisons par le train. */
  shipments: Record<string, string>;
  quests: Record<string, { title: string; intro: string; labels: string[] }>;
  products: Record<string, { title: string; description: string; badge?: string }>;
  offers: Record<string, { title: string; description: string }>;
  /** Enseignes peintes sur les bâtiments, indexées par le texte français (« BOULANGERIE »). */
  signs: Record<string, string>;
}

/** Fichier de traduction d'une langue (src/i18n/locales/<code>.ts). */
export interface Translation {
  messages: Messages;
  content: ContentTranslations;
}

export type Params = Record<string, string | number>;
