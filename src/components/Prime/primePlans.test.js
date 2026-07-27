/* eslint-env jest */
import { otherPrimePlan, primePlanName } from './primePlans';

it.each([
  ['data', 'nodata', 'Lite'],
  ['nodata', 'data', 'Standard'],
])('switches %s to %s', (current, next, name) => {
  expect(otherPrimePlan(current)).toBe(next);
  expect(primePlanName(next)).toBe(name);
});
