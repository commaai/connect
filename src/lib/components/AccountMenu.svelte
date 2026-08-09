<script>
  import dayjs from 'dayjs';

  import { USERADMIN_URL_ROOT } from '$lib/api';
  import { logOut } from '$lib/auth';

  let { profile, open, onclose } = $props();

  const sha = import.meta.env.VITE_APP_GIT_SHA;
  const timestamp = import.meta.env.VITE_APP_GIT_TIMESTAMP;
  const commitUrl = sha ? `https://github.com/commaai/connect/commit/${sha}` : null;
  const buildAge = timestamp ? dayjs(timestamp).fromNow() : null;

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

  <div class="absolute right-0 mt-1 z-50 w-56 sm:w-64 rounded bg-[#30373B] shadow-lg overflow-hidden">
    <div class="flex flex-col items-start gap-2 px-4 pt-3 pb-4">
      <span class="font-bold text-white">{profile.email}</span>
      <span class="text-xs text-[#ffffff66]">{profile.user_id}</span>
      <span class="text-xs text-[#ffffff66]">
        Version:{' '}
        {#if commitUrl}
          <a class="text-blue-400 underline" href={commitUrl} target="_blank" rel="noreferrer">{sha.substring(0, 7)}</a>{#if buildAge}, {buildAge}{/if}
        {:else}
          dev
        {/if}
      </span>
    </div>

    <div class="h-px bg-white/10"></div>

    <a
      class="block px-4 py-3 text-white hover:bg-white/10"
      href={USERADMIN_URL_ROOT}
      target="_blank"
      rel="noreferrer"
      onclick={onclose}
    >
      Manage account
    </a>
    <button class="block w-full px-4 py-3 text-left text-white hover:bg-white/10 cursor-pointer" onclick={onLogOut}>
      Log out
    </button>
  </div>
{/if}
