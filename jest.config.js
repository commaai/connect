const cwd = process.cwd();

/** @type {import('jest').Config} */
const config = {
  roots: ['<rootDir>/src'],
  // @swc/jest emits no istanbul instrumentation, so the default babel coverage
  // provider measured nothing and reported 0% for every file.
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
  ],
  coveragePathIgnorePatterns: [],
  setupFilesAfterEnv: ['<rootDir>/config/jest/setupTests.js'],
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['node_modules'],
  transform: {
    '^.+\\.js$': [
      'jest-chain-transform',
      {
        transformers: [
          `${cwd}/config/jest/importMetaTransform.js`,
          ['@swc/jest', {
            jsc: {
              target: 'es2017',
              parser: {
                syntax: 'ecmascript',
              },
            },
            module: {
              type: 'commonjs',
            },
          }],
        ],
      },
    ],
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
    '^(?!.*\\.(js|jsx|mjs|cjs|ts|tsx|css|json)$)': '<rootDir>/config/jest/fileTransform.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*@commaai.*)/)',
  ],
  modulePaths: ['<rootDir>/src'],
};

module.exports = config;
