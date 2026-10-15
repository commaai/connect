import { describe, expect, it } from 'vitest';

import {
  hlsErrorMessage, videoErrorMessage,
  SEGMENT_MISSING, LOAD_FAILED, NETWORK_FAILED,
} from './videoError';

const ORIGIN = 'https://connect.comma.ai';

describe('hlsErrorMessage', () => {
  it('treats transient buffer stalls as not-an-error', () => {
    expect(hlsErrorMessage({ type: 'mediaError', details: 'bufferStalledError' })).toBeNull();
    expect(hlsErrorMessage({ type: 'mediaError', details: 'bufferNudgeOnStall' })).toBeNull();
  });

  it('reports a missing segment on a 404 network error', () => {
    expect(hlsErrorMessage({ type: 'networkError', response: { code: 404 } })).toBe(SEGMENT_MISSING);
  });

  it('falls back to a generic message for other network/media errors', () => {
    expect(hlsErrorMessage({ type: 'networkError', response: { code: 500 } })).toBe(LOAD_FAILED);
    expect(hlsErrorMessage({ type: 'mediaError', details: 'fragParsingError' })).toBe(LOAD_FAILED);
    expect(hlsErrorMessage({})).toBe(LOAD_FAILED);
    expect(hlsErrorMessage(null)).toBe(LOAD_FAILED);
  });
});

describe('videoErrorMessage', () => {
  it('ignores a missing error object', () => {
    expect(videoErrorMessage(null)).toBeNull();
    expect(videoErrorMessage(undefined)).toBeNull();
  });

  it('ignores aborts and the hlsError sentinel (handled by the caller)', () => {
    expect(videoErrorMessage({ name: 'AbortError' })).toBeNull();
    expect(videoErrorMessage('hlsError')).toBeNull();
  });

  it('ignores the ".../undefined" src bug', () => {
    const e = { target: { src: `${ORIGIN}/route/undefined` } };
    expect(videoErrorMessage(e, ORIGIN)).toBeNull();
  });

  it('does not ignore a real missing src on another origin', () => {
    const e = { target: { src: `${ORIGIN}/route/undefined` } };
    expect(videoErrorMessage(e, 'https://other.example')).toBe(LOAD_FAILED);
  });

  it('reports network errors with a connection hint', () => {
    expect(videoErrorMessage({ type: 'networkError' })).toBe(NETWORK_FAILED);
  });

  it('reports a 404 as a missing segment', () => {
    expect(videoErrorMessage({ response: { code: 404 } })).toBe(SEGMENT_MISSING);
  });

  it('prefers the server-provided text, else the generic message', () => {
    expect(videoErrorMessage({ response: { text: 'forbidden' } })).toBe('forbidden');
    expect(videoErrorMessage({})).toBe(LOAD_FAILED);
  });
});
