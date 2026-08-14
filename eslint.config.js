import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/* The colour and comment rules live in scripts/check-standards.mjs, which is
   lexical. This carries what needs an AST, accessibility above all. */
export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', '.screenshots/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Every empty block in this tree is a catch that is deliberately silent,
      // and each already carries a comment saying why.
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [jsxA11y.flatConfigs.recommended],
    // Only the two classic rules. v7 ships a React Compiler set that assumes
    // React internals Preact does not have.
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Browser drivers: Node scripts whose page.evaluate callbacks run in a page,
    // so both sets of globals are legitimate.
    files: ['.claude/**/*.mjs', '*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
)
