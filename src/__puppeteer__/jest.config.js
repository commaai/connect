const { createJestConfig } = require('@craco/craco');
const cracoConfig = require('../../craco.config');

const jestConfig = createJestConfig(cracoConfig({ env: process.env.NODE_ENV }));

delete jestConfig['testEnvironment'];

module.exports = {
  ...jestConfig,
  preset: 'jest-puppeteer',
  setupFilesAfterEnv: [...jestConfig.setupFilesAfterEnv, 'expect-puppeteer'],
  testMatch: ['<rootDir>/src/__puppeteer__/**/*.test.{js,jsx,ts,tsx}'],
  testPathIgnorePatterns: ['node_modules'],
};
