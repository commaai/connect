<script>
  import AccountMenu from './AccountMenu.svelte';
  import AccountIcon from '$lib/icons/AccountIcon.svelte';
  import MenuIcon from '$lib/icons/MenuIcon.svelte';

  let { profile, dongleId, showDrawerButton = false, drawerIsOpen = false, ontoggledrawer } = $props();

  let menuOpen = $state(false);

  const home = $derived(dongleId ? `/${dongleId}` : '/');
</script>

<!-- MUI AppBar position="sticky" elevation={1}: an opaque bar at primary.main
     (never seen — styles.header covers it) wrapping the actual header div. The
     nesting is kept because it is what React composites, and text rasterises
     differently over one opaque layer than two. -->
<header
  class="sticky top-0 z-[1100] flex w-full flex-col shrink-0 bg-[#57a9e3]
         shadow-[0_2px_4px_-1px_rgba(0,0,0,0.2),0_4px_5px_0_rgba(0,0,0,0.14),0_1px_10px_0_rgba(0,0,0,0.12)]"
>
<div
  class="flex flex-row flex-wrap items-center justify-between bg-[#1D2225] p-[7.5px] border-b border-white/10"
>
  <div class="flex flex-nowrap items-center">
    {#if showDrawerButton}
      <button
        type="button"
        aria-label="menu"
        class="mr-3 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-white hover:bg-white/10"
        onclick={() => ontoggledrawer(!drawerIsOpen)}
      >
        <MenuIcon />
      </button>
    {:else}
      <a href={home} style="line-height: 0">
        <img alt="comma" src="/images/comma-white.png" class="mx-[28px] h-[34px] w-[18.9px]" />
      </a>
    {/if}
    <a href={home}>
      <p class="text-[20px] font-extrabold">connect</p>
    </a>
  </div>

  <div class="flex flex-row gap-2">
    <div class="relative">
      <button
        type="button"
        aria-label="account menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full hover:bg-white/10"
        onclick={() => { menuOpen = !menuOpen; }}
      >
        <AccountIcon class="h-[34px] w-[34px] text-white/30" />
      </button>
      {#if profile}
        <AccountMenu {profile} open={menuOpen} onclose={() => { menuOpen = false; }} />
      {/if}
    </div>
  </div>
</div>
</header>
