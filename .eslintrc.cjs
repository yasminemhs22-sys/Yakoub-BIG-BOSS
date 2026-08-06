module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // The service_role key must never reach the browser (D-175). This makes a
    // careless import a lint failure rather than a production incident.
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.name='process'][property.name='env']",
        message: 'Use src/lib/env.ts. Server secrets belong in Netlify Functions, not in src/.',
      },
    ],
    'no-restricted-properties': [
      'error',
      { object: 'localStorage', property: 'setItem', message: 'Use src/i18n/locale.ts helpers, which handle private-mode failures.' },
    ],
  },
};
