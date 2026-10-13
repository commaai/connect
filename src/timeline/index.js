import { media } from './media';

/**
 * Get current playback offset
 *
 * @returns {number}
 */
export function currentOffset() {
  return media.currentOffset();
}
