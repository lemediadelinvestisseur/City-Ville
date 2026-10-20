import { afterEach, describe, expect, it } from 'vitest';
import { BUILDINGS, SHOP_CATEGORIES } from '@/data/buildings';
import { CROPS, TRIPS } from '@/data/crops';
import { ITEMS } from '@/data/items';
import { RECIPES } from '@/data/recipes';
import { LANGUAGES, matchLanguage } from '@/data/languages';
import { CASH_OFFERS, STORE_PRODUCTS } from '@/data/products';
import { QUESTS } from '@/data/quests';
import { buildingName, questLabels } from './content';
import { FR } from './fr';
import { detectLanguage, formatNumber, t, tn, tParts, useTranslation } from './index';
import type { Translation } from './types';

const LOCALES = import.meta.glob<{ default: Translation }>('./locales/*.ts', { eager: true });
const translations = Object.entries(LOCALES).map(([path, module]) => ({
  code: path.replace('./locales/', '').replace('.ts', ''),
  translation: module.default,
}));

/** Enseignes peintes sur les bâtiments (src/render/art/buildings.ts). */
const SIGNS = [
  'BOULANGERIE',
  'FLEURS',
  'CAFÉ',
  'PIZZA',
  'ÉPICERIE',
  'ÉCOLE',
  'POSTE',
  'POLICE',
  'POMPIERS',
  'ENTREPÔT',
  'MODE',
  'LIVRES',
  'RESTAURANT',
  'SUPERMARCHÉ',
  'CENTRE COMMERCIAL',
  'BOWLING',
  'BIBLIOTHÈQUE',
  'GARE',
  'FOURNIL',
  'FROMAGERIE',
  'CONSERVES',
  'MUSÉE',
  'CONGRÈS',
  'AÉROPORT',
  'DÉPÔT',
  'LOGISTIQUE',
  'CRIÉE',
  'PORT',
  'CINÉMA',
  'HÔTEL ★★★',
];

const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const pluralBase = (key: string) => key.split('#')[0] ?? key;
const intlOf = (code: string) => LANGUAGES.find((l) => l.code === code)?.intl ?? code;

afterEach(() => useTranslation('fr', null));

describe('traductions', () => {
  it('ne contiennent que des langues déclarées', () => {
    for (const { code } of translations) expect(LANGUAGES.some((l) => l.code === code)).toBe(true);
  });

  for (const { code, translation } of translations) {
    describe(code, () => {
      it('traduit chaque texte de l’interface avec les mêmes paramètres', () => {
        const messages = translation.messages as Record<string, string>;
        const fr = FR as Record<string, string>;
        for (const [key, french] of Object.entries(fr)) {
          const text = messages[key];
          expect(typeof text === 'string' && text.trim().length > 0, `${code} : ${key} manquant`).toBe(true);
          if (!key.includes('#')) {
            expect(placeholders(text ?? ''), `${code} : paramètres de ${key}`).toEqual(placeholders(french));
          }
        }
        // Pluriels : mêmes paramètres que le français (« {n} » peut être omis au singulier).
        // Formes réellement utilisées pour des nombres entiers (« many » des millions en portugais : facultatif).
        const rules = new Intl.PluralRules(intlOf(code));
        const categories = new Set<string>(['other']);
        for (let n = 0; n <= 1000; n++) categories.add(rules.select(n));
        const bases = new Set(
          Object.keys(fr)
            .filter((k) => k.includes('#'))
            .map(pluralBase),
        );
        for (const base of bases) {
          const expected = new Set([
            ...placeholders(fr[`${base}#one`] ?? ''),
            ...placeholders(fr[`${base}#other`] ?? ''),
          ]);
          for (const category of categories) {
            const text = messages[`${base}#${category}`];
            expect(typeof text === 'string' && text.length > 0, `${code} : ${base}#${category} manquant`).toBe(true);
            for (const name of placeholders(text ?? '')) {
              expect(expected.has(name), `${code} : {${name}} inconnu dans ${base}#${category}`).toBe(true);
            }
            for (const name of placeholders(fr[`${base}#other`] ?? '')) {
              if (name !== 'n')
                expect(placeholders(text ?? '').has(name), `${code} : {${name}} dans ${base}`).toBe(true);
            }
          }
        }
        for (const key of Object.keys(messages)) {
          expect(key in fr || bases.has(pluralBase(key)), `${code} : clé inconnue ${key}`).toBe(true);
        }
      });

      it('traduit tout le contenu du jeu', () => {
        const { content } = translation;
        for (const b of BUILDINGS) {
          expect(content.buildings[b.id]?.name, `${code} : bâtiment ${b.id}`).toBeTruthy();
          expect(content.buildings[b.id]?.description, `${code} : description ${b.id}`).toBeTruthy();
        }
        for (const c of SHOP_CATEGORIES) expect(content.categories[c.id], `${code} : catégorie ${c.id}`).toBeTruthy();
        for (const c of CROPS) expect(content.crops[c.id], `${code} : culture ${c.id}`).toBeTruthy();
        for (const trip of TRIPS) expect(content.trips[trip.id], `${code} : expédition ${trip.id}`).toBeTruthy();
        for (const item of ITEMS) expect(content.items[item.id], `${code} : produit ${item.id}`).toBeTruthy();
        for (const r of RECIPES) expect(content.recipes[r.id], `${code} : production ${r.id}`).toBeTruthy();
        for (const q of QUESTS) {
          const quest = content.quests[q.id];
          expect(quest?.title && quest.intro, `${code} : objectif ${q.id}`).toBeTruthy();
          expect(quest?.labels.length, `${code} : tâches de ${q.id}`).toBe(q.labels.length);
        }
        for (const p of STORE_PRODUCTS) {
          const product = content.products[p.id];
          expect(product?.title && product.description, `${code} : produit ${p.id}`).toBeTruthy();
          expect(Boolean(product?.badge), `${code} : badge de ${p.id}`).toBe(Boolean(p.badge));
        }
        for (const o of CASH_OFFERS) expect(content.offers[o.id]?.title, `${code} : offre ${o.id}`).toBeTruthy();
        for (const sign of SIGNS) expect(content.signs[sign], `${code} : enseigne ${sign}`).toBeTruthy();
      });
    });
  }
});

describe('textes', () => {
  it('remplace les paramètres et choisit le pluriel', () => {
    expect(t('common.level', { level: 12 })).toBe('Niveau 12');
    expect(tn('market.sold', 1, { coins: 1500 })).toBe(`1 lot vendu : +${formatNumber(1500)} pièces !`);
    expect(tn('market.sold', 3, { coins: 20 })).toBe('3 lots vendus : +20 pièces !');
    expect(tParts('bubble.rent', { icon: 42, coins: 30 })).toEqual(['Loyer : ', '42', ' ', '30']);
  });

  it('utilise le contenu traduit et retombe sur le français', () => {
    useTranslation('en', {
      messages: { ...FR, 'common.level': 'Level {level}' },
      content: {
        buildings: { cottage: { name: 'Cottage', description: 'A cozy little house.' } },
        categories: {},
        crops: {},
        trips: {},
        items: {},
        recipes: {},
        quests: { welcome: { title: 'Welcome, Mayor!', intro: '…', labels: ['Collect 2 rents'] } },
        products: {},
        offers: {},
        signs: {},
      },
    });
    expect(t('common.level', { level: 3 })).toBe('Level 3');
    expect(buildingName('cottage')).toBe('Cottage');
    expect(buildingName('bakery')).toBe('Boulangerie');
    expect(questLabels(QUESTS[0]!)).toEqual(['Collect 2 rents']);
  });

  it('propose la langue de l’appareil', () => {
    expect(matchLanguage(['pt-BR', 'en'])).toBe('pt');
    expect(matchLanguage(['xx-YY'])).toBe('en');
    expect(detectLanguage(['fr-CA'])).toBe('fr');
  });
});
