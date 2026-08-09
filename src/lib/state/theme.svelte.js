/**
 * Theme preference.
 *
 * Three states, not two: 'dark' and 'light' are choices the user made and we
 * keep, 'system' means follow the OS and keep following it when it changes.
 * The resolved value is stamped on <html> as data-theme, which is what the
 * tokens in index.css key off.
 *
 * app.html applies the same rule inline before first paint, so the page never
 * renders dark and then flips. The two have to agree — see the script there.
 */

export const STORAGE_KEY = 'theme';
const THEMES = ['system', 'dark', 'light'];

/** What the OS is asking for, defaulting to dark the way the app always looked. */
export function systemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The stored preference, or 'system' if there is nothing usable stored. */
export function storedPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

class Theme {
  /** @type {'system'|'dark'|'light'} what the user picked */
  preference = $state('system');
  /** @type {'dark'|'light'} what the OS reports, tracked so 'system' stays live */
  system = $state('dark');

  /** @type {'dark'|'light'} what is actually on screen */
  get resolved() {
    return this.preference === 'system' ? this.system : this.preference;
  }

  set(preference) {
    if (!THEMES.includes(preference)) return;
    this.preference = preference;
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // storage unavailable; the choice lasts for this page only
    }
  }

  /** Cycle in the order the menu lists them. */
  next() {
    this.set(THEMES[(THEMES.indexOf(this.preference) + 1) % THEMES.length]);
  }

  /**
   * Read the stored preference and follow the OS from here on.
   * Returns a teardown function, so callers can use it straight from $effect.
   */
  start() {
    this.preference = storedPreference();
    this.system = systemTheme();

    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event) => { this.system = event.matches ? 'light' : 'dark'; };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
}

function createTheme() {
  try {
    return new Theme();
  } catch {
    // imported outside the Svelte compiler, as playback.svelte.js is under test
    return null;
  }
}

export const theme = createTheme();
