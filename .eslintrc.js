module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:jest-dom/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  rules: {
    'camelcase': 0,
    'class-methods-use-this': 0,
    'default-case': 'error',
    'import/prefer-default-export': 0,
    'import/no-named-as-default': 0,
    'react/destructuring-assignment': 0,
    'react/jsx-curly-spacing': 0,
    'react/jsx-filename-extension': 0,
    'react/forbid-prop-types': 0,
    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'arrow-function',
      },
    ],
    'react/prop-types': 0,
    'react/require-default-props': 0,
    'react/sort-comp': 0,
    'max-len': 0,
    'no-await-in-loop': 'error',
    'no-case-declarations': 'error',
    'no-console': 0,
    'no-else-return': 0,
    'no-empty': 'error',
    'no-multi-spaces': ['error', {
      ignoreEOLComments: true,
    }],
    'no-nested-ternary': 0,
    'no-plusplus': [
      'error',
      {
        allowForLoopAfterthoughts: true,
      },
    ],
    'no-param-reassign': 0,
    'no-shadow': 'error',
    'no-underscore-dangle': 0,
    'no-unused-vars': ['error', {
      args: 'none',
    }],
    'no-use-before-define': 'error',
    'object-curly-newline': [
      'error',
      {
        consistent: true,
      },
    ],
    'quote-props': ['error', 'as-needed', {
      unnecessary: false,
    }],
  },
  env: {
    es6: true,
    node: true,
    browser: true,
  },
  globals: {
    gtag: 'readonly',
  },
};
