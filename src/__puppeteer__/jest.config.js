const jestConfig = require('../../jest.config');

delete jestConfig.testEnvironment;

const webrtcLatencyTest = '<rootDir>/src/__puppeteer__/webrtc-latency.test.js';
const testPathIgnorePatterns = process.env.WEBRTC_LATENCY_TEST
  ? ['node_modules']
  : ['node_modules', webrtcLatencyTest];

module.exports = {
  ...jestConfig,
  rootDir: '../../',
  preset: 'jest-puppeteer',
  setupFilesAfterEnv: [...jestConfig.setupFilesAfterEnv, 'expect-puppeteer'],
  testMatch: process.env.WEBRTC_LATENCY_TEST
    ? [webrtcLatencyTest]
    : ['<rootDir>/src/__puppeteer__/**/*.test.{js,jsx,ts,tsx}'],
  testPathIgnorePatterns,
};
