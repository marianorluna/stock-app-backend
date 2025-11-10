import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import pluginPromise from 'eslint-plugin-promise';
import pluginN from 'eslint-plugin-n';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      import: pluginImport,
      promise: pluginPromise,
      n: pluginN
    },
    rules: {
      'no-console': 'off',
      'promise/always-return': 'off'
    }
  }
];

