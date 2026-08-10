import { describe, expect, it } from 'vitest';

import { match as matchDongleId } from './dongleId';
import { match as matchLogId } from './logId';
import { match as matchTimestamp } from './timestamp';

/**
 * These replaced the two loose regexes in the old src/url.js. The point of the
 * change was that a path that is not a route now fails to match rather than
 * parsing into NaN bounds, so the cases that used to slip through are the ones
 * worth stating.
 */
describe('the dongleId matcher', () => {
  it('takes 16 lowercase hex characters', () => {
    expect(matchDongleId('1d3dc3e03047b0c7')).toBe(true);
    expect(matchDongleId('0000000000000000')).toBe(true);
    expect(matchDongleId('ffffffffffffffff')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(matchDongleId('1d3dc3e03047b0c')).toBe(false);
    expect(matchDongleId('1d3dc3e03047b0c77')).toBe(false);
    expect(matchDongleId('')).toBe(false);
  });

  it('rejects uppercase and non-hex', () => {
    expect(matchDongleId('1D3DC3E03047B0C7')).toBe(false);
    expect(matchDongleId('1d3dc3e03047b0cg')).toBe(false);
    expect(matchDongleId('1d3dc3e0-3047b0c')).toBe(false);
  });

  it('rejects the app\'s own paths, which url.js had to special-case by name', () => {
    expect(matchDongleId('auth')).toBe(false);
    expect(matchDongleId('not-a-dongle')).toBe(false);
  });

  it('will not take a longer string that merely starts with one', () => {
    // an unanchored regex would have matched this
    expect(matchDongleId('1d3dc3e03047b0c7/extra')).toBe(false);
    expect(matchDongleId('x1d3dc3e03047b0c7')).toBe(false);
  });
});

describe('the logId matcher', () => {
  it('takes a 20-character route id', () => {
    expect(matchLogId('0000010a--a51155e496')).toBe(true);
    expect(matchLogId('000000dd--455f14369d')).toBe(true);
  });

  it('rejects the sibling routes that share its position in the path', () => {
    // this is what lets /{dongleId}/prime and /{dongleId}/{logId} coexist
    expect(matchLogId('prime')).toBe(false);
    expect(matchLogId('stream')).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(matchLogId('0000010a--a51155e49')).toBe(false);
    expect(matchLogId('0000010a--a51155e4966')).toBe(false);
    expect(matchLogId('')).toBe(false);
  });

  it('rejects characters outside hex and dashes', () => {
    expect(matchLogId('0000010a__a51155e496')).toBe(false);
    expect(matchLogId('0000010A--A51155E496')).toBe(false);
  });
});

describe('the timestamp matcher', () => {
  it('takes whole seconds', () => {
    expect(matchTimestamp('0')).toBe(true);
    expect(matchTimestamp('42')).toBe(true);
    expect(matchTimestamp('1750000000')).toBe(true);
  });

  it('rejects anything that would parse to NaN bounds', () => {
    expect(matchTimestamp('')).toBe(false);
    expect(matchTimestamp('abc')).toBe(false);
    expect(matchTimestamp('12abc')).toBe(false);
  });

  it('rejects signed and fractional values, which are not offsets', () => {
    expect(matchTimestamp('-1')).toBe(false);
    expect(matchTimestamp('1.5')).toBe(false);
    expect(matchTimestamp('1e3')).toBe(false);
  });
});
