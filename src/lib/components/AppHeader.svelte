<script>
  import AccountMenu from './AccountMenu.svelte';
  import AccountIcon from '$lib/icons/AccountIcon.svelte';
  import MenuIcon from '$lib/icons/MenuIcon.svelte';

  let {
    profile,
    dongleId,
    showDrawerButton = false,
    drawerIsOpen = false,
    ontoggledrawer,
    /** Measured, not assumed: the drawer starts where this ends. */
    height = $bindable(64),
  } = $props();

  let menuOpen = $state(false);

  const home = $derived(dongleId ? `/${dongleId}` : '/');
</script>

<!--
  The bar spans the full width and the drawer starts under it, so it sits above
  the drawer rather than beside it: z-1250 puts it over the drawer's 1200 and
  under the modals' 1300.

  Glossy is three layers over a translucent surface — a sheen falling from the
  top edge, a lit 1px rule along that edge, and a blur of whatever scrolls
  beneath. It replaces the opaque MUI AppBar, whose primary.main blue sat behind
  the header and was never seen; through a translucent bar it would be.
-->
<header
  bind:clientHeight={height}
  class="sticky top-0 z-[1250] flex w-full shrink-0 flex-col
         border-b border-[var(--c-bar-edge)]
         bg-bar/72 bg-[linear-gradient(180deg,var(--c-bar-sheen)_0%,transparent_58%)]
         backdrop-blur-2xl backdrop-saturate-150
         shadow-[inset_0_1px_0_var(--c-bar-sheen),0_10px_30px_-18px_rgb(0_0_0/0.85)]"
>
  <div class="flex flex-row flex-wrap items-center justify-between p-[7.5px]">
    <div class="flex flex-nowrap items-center">
      {#if showDrawerButton}
        <button
          type="button"
          aria-label="menu"
          class="mr-3 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-ink/10"
          onclick={() => ontoggledrawer(!drawerIsOpen)}
        >
          <MenuIcon />
        </button>
      {:else}
        <a href={home} style="line-height: 0">
          <img alt="comma" src="/images/comma-white.png" class="logo-mark mx-[28px] h-[34px] w-[18.9px]" />
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
          class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full hover:bg-ink/10"
          onclick={() => { menuOpen = !menuOpen; }}
        >
          <AccountIcon class="h-[34px] w-[34px] text-ink/30" />
        </button>
        {#if profile}
          <AccountMenu {profile} open={menuOpen} onclose={() => { menuOpen = false; }} />
        {/if}
      </div>
    </div>
  </div>
</header>
