/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import globals from 'globals'
import js from '@eslint/js'
import ts from 'typescript-eslint'
import tailwind from 'eslint-plugin-tailwindcss'
import solid from 'eslint-plugin-solid/configs/typescript'
import stylistic from '@stylistic/eslint-plugin'
import vitest from '@vitest/eslint-plugin'

export default [
  {
    languageOptions: { globals: globals.browser },
  },
  {
    ignores: ['.github', '.vscode', 'dist'],
  },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    ...solid,
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...tailwind.configs['flat/recommended'],
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/brace-style': ['error', '1tbs'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/indent-binary-ops': ['error', 2],
      '@stylistic/jsx-indent': ['error', 2, { indentLogicalExpressions: true }],
      '@stylistic/jsx-indent-props': ['error', 2],
      '@stylistic/jsx-quotes': ['error', 'prefer-double'],
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/max-len': ['error', {
        code: 120,
        ignoreComments: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      '@stylistic/no-extra-parens': ['error', 'functions'],
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'never'],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          'args': 'all',
          'argsIgnorePattern': '^_',
          'caughtErrors': 'all',
          'caughtErrorsIgnorePattern': '^_',
          'destructuredArrayIgnorePattern': '^_',
          'varsIgnorePattern': '^_',
          'ignoreRestSiblings': true,
        },
      ],
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    files: ['src/**/*.test.*'],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/unbound-method': 'off',
    },
    settings: {
      vitest: {
        typecheck: true,
      },
    },
  },
]
