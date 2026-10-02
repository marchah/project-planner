import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Transport belongs in third-party/ adapters, never in a slice. `fetch` is deliberately NOT
// listed: an adapter uses it, and banning a global here would not stop a slice anyway.
const HTTP_CLIENTS = ['axios', 'node-fetch', 'undici', 'got', 'node:http', 'node:https'].map(
  (name) => ({
    name,
    message:
      'HTTP clients belong in a third-party/<provider>/ adapter behind a port — never inside an entity or feature slice.',
  }),
);

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'packages/contract/**',
      'packages/api/drizzle/**',
      '**/*.config.{js,ts,mjs}',
      '**/scripts/**',
      'eslint.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // high-value async-safety rules — kept as errors (good practice)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // silence the unsafe-* family that fights typed GraphQL/ORM builders
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Environment variables are read ONLY in common/settings.ts (single source of truth).
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read environment variables only in common/settings.ts.',
        },
      ],
      // Use the logger (common/logger.ts), never console.*.
      'no-console': 'error',
    },
  },

  // ---- The hard dependency rule, machine-enforced (resolver → service → repository → db) ----
  {
    files: ['packages/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Resolve extensionless TS imports so the rule can classify each import's target.
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: 'packages/api/tsconfig.json' },
      },
      'boundaries/include': ['packages/api/src/**/*'],
      // File-level classification. Every file under src/ must match one of these (see
      // no-unknown-files below). Order matters: the FIRST match wins, so tests come first and a
      // *.spec.ts is never mistaken for the layer it sits beside.
      'boundaries/files': [
        { category: 'test', pattern: 'packages/api/src/**/*.spec.ts' },
        {
          category: 'resolver',
          pattern: 'packages/api/src/{entities,features}/*/schema.pothos.ts',
        },
        { category: 'route', pattern: 'packages/api/src/{entities,features}/*/routes.ts' },
        { category: 'route', pattern: 'packages/api/src/{entities,features}/*/mcp.ts' },
        { category: 'service', pattern: 'packages/api/src/{entities,features}/*/service.ts' },
        {
          category: 'repository',
          pattern: 'packages/api/src/{entities,features}/*/repository.ts',
        },
        { category: 'types', pattern: 'packages/api/src/{entities,features}/*/types.ts' },
        { category: 'adapter', pattern: 'packages/api/src/third-party/*/**/*.ts' },
        { category: 'db', pattern: 'packages/api/src/db/**/*.ts' },
        { category: 'common', pattern: 'packages/api/src/common/*.ts' },
        // Each module's index.ts plus the top-level backbone files.
        {
          category: 'backbone',
          pattern: 'packages/api/src/{entities,features,third-party}/index.ts',
        },
        { category: 'backbone', pattern: 'packages/api/src/*.ts' },
      ],
    },
    rules: {
      // Nothing under packages/api/src may escape classification — this is what stops a slice
      // being dropped at src/<name>/ instead of inside entities/ or features/.
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { file: { categories: 'resolver' } },
              disallow: { to: { file: { categories: { anyOf: ['db', 'repository'] } } } },
              message:
                'Layer violation: resolvers must reach data via ctx.services — never import db or repository.',
            },
            {
              from: { file: { categories: 'route' } },
              disallow: { to: { file: { categories: { anyOf: ['db', 'repository'] } } } },
              message:
                'Layer violation: REST routes and MCP tools reach data via the injected services — never import db or repository.',
            },
            {
              from: { file: { categories: 'service' } },
              disallow: { to: { file: { categories: { anyOf: ['db', 'resolver'] } } } },
              message:
                'Layer violation: services depend on repository PORT TYPES — never the db or a resolver.',
            },
            {
              from: { file: { categories: 'repository' } },
              disallow: { to: { file: { categories: { anyOf: ['resolver', 'service'] } } } },
              message:
                'Layer violation: repositories are the data layer — never import a service or resolver.',
            },
            {
              from: { file: { categories: 'adapter' } },
              disallow: {
                to: {
                  file: {
                    categories: { anyOf: ['db', 'repository', 'service', 'resolver', 'route'] },
                  },
                },
              },
              message:
                'Layer violation: a third-party adapter implements a port — never import a service, repository, resolver or the db.',
            },
            {
              from: {
                file: { categories: { anyOf: ['service', 'repository', 'resolver', 'route'] } },
              },
              disallow: { to: { file: { categories: 'adapter' } } },
              message:
                'Layer violation: depend on the PORT declared in the slice, not on a third-party adapter — adapters are wired in only at the composition root.',
            },
          ],
        },
      ],
    },
  },

  // ---- Absence is Maybe<T> — every package ----
  // `[types.length=2]` is the whole rule: a union of exactly T and null IS Maybe<T>, so write it
  // that way. A richer union (`string | false | undefined`, mirroring a library's own shape) is
  // left alone because Maybe<T> cannot express it — no judgement call, no carve-outs.
  // Each package defines Maybe once (api common/types.ts, web lib/types.ts) — those two are
  // exempt. The alias is one line with nothing to drift, so a shared package would be more
  // coupling than it buys.
  {
    files: ['packages/{api,web}/src/**/*.{ts,tsx}'],
    ignores: ['packages/api/src/common/types.ts', 'packages/web/src/lib/types.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSUnionType[types.length=2] > TSNullKeyword',
          message:
            "A union of exactly T and null is Maybe<T> — import it from this package's types module and write Maybe<T>.",
        },
      ],
    },
  },

  // ---- Transport stays in third-party/: no HTTP client inside a slice ----
  // The boundaries rule above stops a slice importing an adapter; this stops it bypassing the
  // adapter altogether by reaching for a client directly.
  {
    files: ['packages/api/src/features/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { paths: HTTP_CLIENTS }],
    },
  },

  // ---- Entities: the same transport ban, PLUS the one-way module rule ----
  // Both bans live in ONE entry on purpose: flat config does not merge two entries setting the
  // same rule for overlapping files — the later would win and silently drop the earlier.
  {
    files: ['packages/api/src/entities/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: HTTP_CLIENTS,
          patterns: [
            {
              group: ['**/features', '**/features/**'],
              message:
                'One-way dependency: entities must not import features. If an entity needs a higher-level concern, that logic belongs in a feature that composes this entity.',
            },
          ],
        },
      ],
    },
  },

  // ---- Web (React SPA) ----
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ---- Node globals for the backend ----
  {
    files: ['packages/api/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
