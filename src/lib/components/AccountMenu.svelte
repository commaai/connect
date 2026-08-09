<script>
  import dayjs from 'dayjs';

  import { USERADMIN_URL_ROOT } from '$lib/api';
  import { logOut } from '$lib/auth';
  import { theme } from '$lib/state/theme.svelte.js';

  let { profile, open, onclose } = $props();

  const sha = import.meta.env.VITE_APP_GIT_SHA;
  const timestamp = import.meta.env.VITE_APP_GIT_TIMESTAMP;
  const commitUrl = sha ? `https://github.com/commaai/connect/commit/${sha}` : null;
  const buildAge = timestamp ? dayjs(timestamp).fromNow() : null;

  const THEMES = [
    { value: 'system', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  async function onLogOut() {
    onclose();
    await logOut();
    if (window.location) window.location = window.location.origin;
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-40"
    role="presentation"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
  ></div>

  <div class="absolute right-0 mt-1 z-50 w-56 sm:w-64 rounded bg-panel shadow-lg overflow-hidden">
    <div class="flex flex-col items-start gap-2 px-4 pt-3 pb-4">
      <span class="font-bold text-ink">{profile.email}</span>
      <span class="text-xs text-ink/40">{profile.user_id}</span>
      <span class="text-xs text-ink/40">
        Version:{' '}
        {#if commitUrl}
          <a class="text-blue-400 underline" href={commitUrl} target="_blank" rel="noreferrer">{sha.substring(0, 7)}</a>{#if buildAge}, {buildAge}{/if}
        {:else}
          dev
        {/if}
      </span>
    </div>

    <div class="h-px bg-ink/10"></div>

    <!-- Auto is first and is the default: the app follows the OS until asked not to. -->
    <div class="px-4 py-3">
      <span class="text-xs text-ink/40">Appearance</span>
      <div
        class="mt-2 flex rounded-full bg-ink/8 p-0.5"
        role="radiogroup"
        aria-label="Appearance"
      >
        {#each THEMES as option (option.value)}
          <button
            type="button"
            role="radio"
            aria-checked={theme.preference === option.value}
            class="flex-1 cursor-pointer rounded-full px-2 py-1.5 text-xs font-semibold transition-colors
                   {theme.preference === option.value
                     ? 'bg-ink/15 text-ink shadow-[inset_0_1px_0_var(--c-bar-sheen)]'
                     : 'text-ink/50 hover:text-ink/80'}"
            onclick={() => theme.set(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="h-px bg-ink/10"></div>

    <a
      class="block px-4 py-3 text-ink hover:bg-ink/10"
      href={USERADMIN_URL_ROOT}
      target="_blank"
      rel="noreferrer"
      onclick={onclose}
    >
      Manage account
    </a>
    <button class="block w-full px-4 py-3 text-left text-ink hover:bg-ink/10 cursor-pointer" onclick={onLogOut}>
      Log out
    </button>
  </div>
{/if}
