// Flat ESLint config (ESLint 9) for the monorepo's non-Next workspaces
// (packages/* + apps/worker). apps/web has its own eslint.config.mjs.
//
// Translated from the former root package.json `eslintConfig` (eslintrc):
// eslint:recommended + @typescript-eslint/recommended, node globals, the same
// rule tweaks, and the test-file overrides. The **/*.tsx + **/*.jsx ignores are
// preserved so the packages/email *.tsx templates stay unlinted, exactly as
// before (behavior-neutral migration).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/.next/',
      '**/coverage/',
      '**/data/',
      '**/*.config.cjs',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
      '**/prisma/generated/**',
      '**/*.tsx',
      '**/*.jsx',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
