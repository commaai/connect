<script>
  import { untrack } from 'svelte';
  import { clickOutside } from '$lib/attachments/click-outside';

  const QUALITY_OPTIONS = [
    { key: 'auto', label: 'auto' },
    { key: 'high', label: 'high', bitrate: '5 mbps' },
    { key: 'med', label: 'med', bitrate: '1.5 mbps' },
    { key: 'low', label: 'low', bitrate: '500 kbps' },
  ];

  let { onqualitychange, options = QUALITY_OPTIONS } = $props();

  const rowClass = 'flex items-center h-9 px-3.5 gap-3 cursor-pointer select-none text-[13px] text-white/85 hover:bg-white/10 transition-colors whitespace-nowrap';
  const pageClass = 'absolute top-0 left-0 w-max min-w-[200px] py-1.5 transition-all duration-200 ease-out';

  let open = $state(false);
  let view = $state('main'); // 'main' | 'quality'
  // useState's initial value: a later `options` change must not reset the pick.
  let quality = $state(untrack(() => options[0]?.key));

  let mainEl = $state(null);
  let qualityEl = $state(null);
  let dims = $state(null);

  const selected = $derived(options.find((o) => o.key === quality) || options[0]);

  // Size the panel to whichever page is active so it morphs between them.
  // The pages are `w-max`, so writing `dims` cannot change what is measured.
  $effect(() => {
    void [open, quality, options];
    const el = view === 'main' ? mainEl : qualityEl;
    if (el) dims = { width: el.offsetWidth, height: el.offsetHeight };
  });

  function closeMenu() {
    open = false;
    view = 'main';
  }

  function toggleOpen(e) {
    e.stopPropagation();
    if (open) view = 'main';
    open = !open;
  }

  function selectQuality(key) {
    quality = key;
    onqualitychange?.(key);
    view = 'main';
  }
</script>

{#snippet chevronRight()}
  <svg
    class="inline-block shrink-0 select-none"
    viewBox="0 0 24 24"
    fill="currentColor"
    width="1em"
    height="1em"
    style="font-size:18px"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
{/snippet}

<div class="relative" style="line-height: 1.5" {@attach open && clickOutside(closeMenu)}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex items-center justify-center h-9 w-9 rounded-[18px] cursor-pointer select-none bg-glass text-white/60 hover:text-white/90 hover:!bg-black/60"
    onclick={toggleOpen}
    title="Settings"
  >
    <svg
      class="inline-block shrink-0 select-none"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="1em"
      height="1em"
      style="font-size:20px; transition: transform 0.2s ease; transform: {open ? 'rotate(30deg)' : 'none'};"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
    </svg>
  </div>

  <div
    class="absolute right-0 top-full mt-2 z-50 origin-top-right overflow-hidden rounded-[12px] bg-glass-dark transition-all duration-200 ease-out {open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}"
    style={dims ? `width: ${dims.width}px; height: ${dims.height}px;` : undefined}
  >
    <!-- main page -->
    <div
      bind:this={mainEl}
      class={pageClass}
      style="transform: {view === 'main' ? 'translateX(0)' : 'translateX(-100%)'}; opacity: {view === 'main' ? 1 : 0}; pointer-events: {open && view === 'main' ? 'auto' : 'none'};"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class={rowClass} onclick={() => { view = 'quality'; }}>
        <span class="flex-1">Quality</span>
        <!-- label and icon stay adjacent: JSX dropped the newline between them,
             Svelte would keep it as a rendered space -->
        <span class="flex items-center gap-1 text-white/45">{selected?.label}{@render chevronRight()}</span>
      </div>
    </div>

    <!-- quality page -->
    <div
      bind:this={qualityEl}
      class={pageClass}
      style="transform: {view === 'quality' ? 'translateX(0)' : 'translateX(100%)'}; opacity: {view === 'quality' ? 1 : 0}; pointer-events: {open && view === 'quality' ? 'auto' : 'none'};"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="{rowClass} font-medium text-white/90" onclick={() => { view = 'main'; }}>
        <svg
          class="inline-block shrink-0 select-none w-4 h-4 -ml-1 text-white/70"
          viewBox="0 -960 960 960"
          fill="currentColor"
          width="1em"
          height="1em"
          style="font-size:24px"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M480-149 149-480l331-331 67 66-217 218h481v94H330l217 217-67 67Z" />
        </svg>
        <span>Quality (Bitrate)</span>
      </div>
      <div class="h-px bg-white/10 mx-2 my-1"></div>
      {#each options as opt (opt.key)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class={rowClass} onclick={() => selectQuality(opt.key)}>
          <span class="flex w-4 items-center justify-center">
            {#if opt.key === quality}
              <svg
                class="inline-block shrink-0 select-none text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
                width="1em"
                height="1em"
                style="font-size:16px"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            {/if}
          </span>
          <span class="flex-1">{opt.label}</span>
          {#if opt.bitrate}
            <span class="text-[10px] text-white/40">{opt.bitrate}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
