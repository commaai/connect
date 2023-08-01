const jestConfig = require('../../jest.config');

delete jestConfig.testEnvironment;

module.exports = {
  ...jestConfig,
  rootDir: '../../',
  preset: 'jest-puppeteer',
  setupFilesAfterEnv: [...jestConfig.setupFilesAfterEnv, 'expect-puppeteer'],
  testMatch: ['<rootDir>/src/__puppeteer__/**/*.test.{js,jsx,ts,tsx}'],
  testPathIgnorePatterns: ['node_modules'],
};
