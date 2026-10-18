/**
 * Règles des pseudos, partagées par le jeu et le serveur : 3 à 16 caractères,
 * lettres (accents compris), chiffres, espace, tiret, point ou tiret bas.
 */

export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 16;

export type PseudoError = 'tooShort' | 'tooLong' | 'invalidChars' | 'forbidden';

const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

/** Mots refusés (insultes courantes, usurpation). Liste volontairement courte : les signalements complètent. */
const FORBIDDEN = [
  'admin',
  'moderat',
  'support',
  'cityville',
  'connard',
  'connasse',
  'salope',
  'pute',
  'encule',
  'enculé',
  'batard',
  'bâtard',
  'merde',
  'nazi',
  'hitler',
  'fuck',
  'bitch',
  'nigger',
  'negro',
  'pd',
];

export function normalizePseudo(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Clé d'unicité : insensible à la casse et aux accents. */
export function pseudoKey(pseudo: string): string {
  return normalizePseudo(pseudo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function validatePseudo(raw: string): PseudoError | null {
  const pseudo = normalizePseudo(raw);
  if ([...pseudo].length < PSEUDO_MIN) return 'tooShort';
  if ([...pseudo].length > PSEUDO_MAX) return 'tooLong';
  if (!ALLOWED.test(pseudo)) return 'invalidChars';
  const key = pseudoKey(pseudo).replace(/[ ._-]/g, '');
  const words = pseudoKey(pseudo).split(/[ ._-]+/);
  for (const bad of FORBIDDEN) {
    const plain = pseudoKey(bad);
    // Les mots très courts ne sont refusés que seuls ; les autres partout dans le pseudo.
    if (plain.length <= 3 ? words.includes(plain) : key.includes(plain)) return 'forbidden';
  }
  return null;
}

export function pseudoErrorMessage(error: PseudoError): string {
  switch (error) {
    case 'tooShort':
      return `Au moins ${PSEUDO_MIN} caractères.`;
    case 'tooLong':
      return `${PSEUDO_MAX} caractères maximum.`;
    case 'invalidChars':
      return 'Lettres, chiffres, espace, tiret, point ou tiret bas uniquement.';
    case 'forbidden':
      return 'Ce pseudo n’est pas autorisé.';
  }
}
