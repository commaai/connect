import { describe, expect, it } from 'vitest';
import { unexpectedResourceErrors } from '../../e2e/resource-errors';

describe('intentional missing segment resource diagnostics', () => {
  const url = 'https://media.example/part-0.ts';
  it.each(['Failed to load resource', 'Failed to load resource: the server responded with a status of 404 (Not Found)'])('accepts %s only at an observed missing segment URL', text => {
    expect(unexpectedResourceErrors([{ text, url }], new Set([url]))).toEqual([]);
    expect(unexpectedResourceErrors([{ text, url }], new Set())).toEqual([{ text, url }]);
  });
  it('keeps blob, unrelated and script errors even in a fault test', () => {
    const errors = [
      { text: 'Failed to load resource', url: 'blob:http://127.0.0.1:3000/source' },
      { text: 'Failed to load resource', url: 'https://media.example/other.ts' },
      { text: 'TypeError: bad state', url },
    ];
    expect(unexpectedResourceErrors(errors, new Set([url]))).toEqual(errors);
  });
});
