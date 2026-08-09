<script>
  import { innerWidth } from 'svelte/reactivity/window';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  import '../index.css';
  import AppDrawer from '$lib/components/AppDrawer.svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';

  let { children, data } = $props();

  let drawerIsOpen = $state(false);

  const selectedDongleId = $derived(page.params.dongleId ?? null);
  const device = $derived(data.devices?.find((d) => d.dongle_id === selectedDongleId) ?? null);

  // Matches explorer.jsx: the drawer is permanent on wide viewports, and takes
  // 20% of the window down to a 280px floor.
  const width = $derived(innerWidth.current ?? 1280);
  const isLarge = $derived(width > 1080);
  const sidebarWidth = $derived(Math.max(280, width * 0.2));

  // Close the drawer whenever the route changes, like componentDidUpdate did.
  let lastPathname = $state(null);
  $effect(() => {
    const { pathname } = page.url;
    if (lastPathname !== pathname) {
      lastPathname = pathname;
      drawerIsOpen = false;
    }
  });

  function selectDevice(dongleId) {
    drawerIsOpen = false;
    goto(`/${dongleId}`);
  }

  function openSettings() {
    // Device settings and pairing land in a later pass.
  }
</script>

{#if data.mockScenario}
  <div class="fixed bottom-2 right-2 z-50 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
    mock: {data.mockScenario}
  </div>
{/if}

{#if data.authenticated}
  <AppHeader
    profile={data.profile}
    dongleId={selectedDongleId}
    showDrawerButton={!isLarge}
    {drawerIsOpen}
    ontoggledrawer={(open) => { drawerIsOpen = open; }}
  />

  <AppDrawer
    devices={data.devices}
    {device}
    profile={data.profile}
    {selectedDongleId}
    isPermanent={isLarge}
    open={drawerIsOpen}
    width={sidebarWidth}
    onclose={() => { drawerIsOpen = false; }}
    onselect={selectDevice}
    onsettings={openSettings}
  />

  <div
    class="flex flex-col bg-[linear-gradient(180deg,#1D2225_0%,#16181A_100%)]"
    style={isLarge ? `width: calc(100% - ${sidebarWidth}px); margin-left: ${sidebarWidth}px` : ''}
  >
    {@render children()}
  </div>
{:else}
  {@render children()}
{/if}
