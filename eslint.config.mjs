import js from '@eslint/js'
import babelParser from '@babel/eslint-parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['out/**', 'dist/**', 'coverage/**', '.agent-harness/archive/**'] },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: [
            ['@babel/plugin-syntax-typescript', { isTSX: true }],
            '@babel/plugin-syntax-jsx',
          ],
        },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-control-regex': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-debugger': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]
