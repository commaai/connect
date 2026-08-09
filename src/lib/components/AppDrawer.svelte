<script>
  import DeviceList from './DeviceList.svelte';

  let {
    devices, device, profile, selectedDongleId,
    isPermanent = false, open = false, width = 280,
    onclose, onselect, onsettings,
  } = $props();

  const visible = $derived(isPermanent || open);
</script>

<!-- Temporary drawers sit above the page behind a scrim; permanent ones are
     part of the layout, which is what MUI's Drawer variants did. -->
{#if !isPermanent && open}
  <div
    class="fixed inset-0 z-40 bg-black/50"
    role="presentation"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
  ></div>
{/if}

<aside
  class="fixed left-0 bottom-0 z-40 transition-transform"
  class:top-0={!isPermanent}
  class:top-auto={isPermanent}
  style="width: {width}px; {isPermanent ? '' : `transform: translateX(${visible ? '0' : '-100%'})`}"
  aria-hidden={!visible}
>
  <div class="ml-safe-left flex h-full flex-col bg-[linear-gradient(180deg,#1B2023_0%,#111516_100%)]">
    {#if !isPermanent}
      <a href="/" class="mx-2 flex min-h-[64px] items-center" onclick={onclose}>
        <img alt="comma" src="/images/comma-white.png" class="mx-6 w-[18.9px]" />
        <span class="text-xl font-extrabold">connect</span>
      </a>
    {/if}

    <DeviceList {devices} {device} {profile} {selectedDongleId} {onselect} {onsettings} />
  </div>
</aside>
