module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'airbnb',
    'airbnb/hooks',
    'plugin:jest-dom/recommended',
  ],
  rules: {
    'import/prefer-default-export': 0,
    'import/no-named-as-default': 0,
    'react/destructuring-assignment': 'warn',
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
    'no-await-in-loop': 'warn',
    'no-plusplus': [
      'error',
      {
        allowForLoopAfterthoughts: true,
      },
    ],
    'no-underscore-dangle': 0,
    'no-param-reassign': 0,
    'object-curly-newline': [
      'error',
      {
        consistent: true,
      },
    ],
  },
  env: {
    browser: true,
  },
  globals: {
    gtag: 'readonly',
  },
};
