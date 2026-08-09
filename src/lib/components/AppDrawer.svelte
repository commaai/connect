<script>
  import DeviceList from './DeviceList.svelte';

  let {
    devices, device, profile, selectedDongleId,
    isPermanent = false, open = false, width = 280,
    /** Where the header ends, so the drawer can start under it. */
    headerHeight = 64,
    onclose, onselect, onsettings,
  } = $props();

  const visible = $derived(isPermanent || open);
</script>

<!-- Temporary drawers sit above the page behind a scrim; permanent ones are
     part of the layout, which is what MUI's Drawer variants did. -->
{#if !isPermanent && open}
  <div
    class="fixed inset-x-0 bottom-0 z-[1200] bg-black/50"
    style="top: {headerHeight}px"
    role="presentation"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
  ></div>
{/if}

<aside
  class="fixed left-0 bottom-0 z-[1200] transition-transform"
  class:top-auto={isPermanent}
  style="width: {width}px; {isPermanent ? '' : `top: ${headerHeight}px; transform: translateX(${visible ? '0' : '-100%'})`}"
  aria-hidden={!visible}
>
  <div
    class="ml-safe-left flex h-full flex-col border-r border-white/12
           bg-[linear-gradient(180deg,#1B2023_0%,#111516_100%)]"
  >
    <DeviceList {devices} {device} {profile} {selectedDongleId} {onselect} {onsettings} />
  </div>
</aside>
