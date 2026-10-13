import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // La logique de jeu doit rester indépendante du moteur de rendu et du DOM.
    files: ['src/core/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser'], message: 'src/core et src/data ne doivent pas dépendre de Phaser.' },
            {
              group: ['@/render/*', '@/ui/*', '../render/*', '../ui/*'],
              message: 'Le cœur du jeu ne dépend pas du rendu ni de l’UI.',
            },
          ],
        },
      ],
    },
  },
);
