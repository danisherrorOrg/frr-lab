import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Browser-only globals (window, document, console, timers…). Plain JS built-ins
// like Math and Map are in the ES set, so they stay allowed.
const browserOnlyGlobals = Object.keys(globals.browser).filter((name) => !(name in globals.es2021))

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // The engine must be pure: same input → same output, runnable in a worker or
  // in Node (CLAUDE.md rule 1, DECISIONS.md D2).
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'The engine must not use React.',
            },
            {
              group: ['**/ui/**', '**/state/**', '**/worker/**'],
              message: 'The engine must not depend on the UI, store or worker.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...browserOnlyGlobals.map((name) => ({
          name,
          message: 'The engine must not use browser globals.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The engine must be deterministic.' },
        { object: 'Date', property: 'now', message: 'The engine must be deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine must be deterministic.',
        },
      ],
    },
  },
  // Must stay last: turns off style rules that Prettier handles.
  prettier,
)
