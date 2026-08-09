import { vi } from 'vitest';

/**
 * Stands in for SvelteKit's `$app/navigation`, which only exists inside a kit
 * build. Tests import these directly to assert where a component navigated.
 */
export const goto = vi.fn(() => Promise.resolve());
export const invalidateAll = vi.fn(() => Promise.resolve());
export const invalidate = vi.fn(() => Promise.resolve());
export const pushState = vi.fn();
export const replaceState = vi.fn();
