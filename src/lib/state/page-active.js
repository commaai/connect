import { untrack } from 'svelte';
import { on } from 'svelte/events';
import { createSubscriber } from 'svelte/reactivity';

/**
 * Whether the page is in front of the user: its tab is visible and its window
 * has focus.
 *
 * Built the way `svelte/reactivity/window` builds `online` and `innerWidth` — a
 * getter over the live value, and `createSubscriber` to wire up whatever changes
 * it. The events are subscribed once for the whole app no matter how many
 * readers there are, only while something is reading `current`, and dropped
 * again when the last reader goes away.
 */
class PageActive {
  #subscribe = createSubscriber((update) => {
    const listeners = [
      on(document, 'visibilitychange', update),
      // focus and blur do not bubble, so these belong on the window: a listener
      // on the document never sees the window itself regaining focus, which is
      // the entire alt-tab-back-to-an-already-visible-tab case.
      on(window, 'focus', update),
      on(window, 'blur', update),
    ];
    return () => listeners.forEach((off) => off());
  });

  get current() {
    // the server pass renders the shell only, where there is no page to be in
    // front of; say yes so nothing waits on it
    if (typeof document === 'undefined') return true;
    this.#subscribe();
    return document.visibilityState === 'visible' && document.hasFocus();
  }
}

export const pageActive = new PageActive();

/**
 * Run `fn` when the page comes back to the front, at most once every
 * `minInterval` seconds. Hand the result straight to `$effect`:
 *
 *   const refresh = watchReturn(() => reload(), { minInterval: 60 });
 *   $effect(refresh);
 *
 * Reading `pageActive` is what subscribes the effect, so it re-runs on the way
 * out as well as the way back and simply declines to do anything on the way out.
 * The clock starts now, so an effect that mounts and settles does not
 * immediately fire.
 *
 * `fn` runs untracked: whatever it reads is its own business, and should not
 * become a dependency of the caller's effect.
 *
 * @param {() => void} fn
 * @param {{ minInterval?: number }} [options]
 */
export function watchReturn(fn, { minInterval = 0 } = {}) {
  let last = Date.now() / 1000;

  const run = () => {
    if (!pageActive.current) return;

    const now = Date.now() / 1000;
    if (minInterval && now - last <= minInterval) return;

    last = now;
    untrack(fn);
  };

  /** Start the clock again, for a caller that has just done the work itself. */
  run.reset = () => {
    last = Date.now() / 1000;
  };

  return run;
}
