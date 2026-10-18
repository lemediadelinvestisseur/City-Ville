import { describe, expect, it } from 'vitest';
import { pseudoKey, validatePseudo } from './pseudo';

describe('pseudos', () => {
  it('accepte les pseudos usuels', () => {
    for (const ok of ['Léa', 'Maire_Paul', 'jean-claude 75', 'Zoé.B']) expect(validatePseudo(ok)).toBeNull();
  });
  it('refuse les longueurs et caractères invalides', () => {
    expect(validatePseudo('ab')).toBe('tooShort');
    expect(validatePseudo('a'.repeat(17))).toBe('tooLong');
    expect(validatePseudo('<script>')).toBe('invalidChars');
    expect(validatePseudo(' _abc')).toBe('invalidChars');
  });
  it('refuse les mots interdits et l’usurpation', () => {
    expect(validatePseudo('Admin City')).toBe('forbidden');
    expect(validatePseudo('gros-CONNARD')).toBe('forbidden');
    expect(validatePseudo('pd')).toBe('tooShort');
    expect(validatePseudo('le pd du 13')).toBe('forbidden');
    expect(validatePseudo('Pdupont')).toBeNull();
  });
  it('compare sans casse ni accents', () => {
    expect(pseudoKey('  Zoé ')).toBe(pseudoKey('ZOE'));
  });
});
