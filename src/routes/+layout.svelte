<script>
  import { innerWidth } from 'svelte/reactivity/window';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';

  import '../index.css';
  import AppDrawer from '$lib/components/AppDrawer.svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import DeviceSettingsModal from '$lib/components/DeviceSettingsModal.svelte';

  let { children, data } = $props();

  let drawerIsOpen = $state(false);
  let settingsDongleId = $state(null);

  const selectedDongleId = $derived(page.params.dongleId ?? null);

  // explorer rendered BodyTeleop *instead of* the header, drawer and window, so
  // the teleop screen owns the whole viewport.
  const fullScreen = $derived(page.route.id === '/[dongleId=dongleId]/stream');
  const device = $derived(data.devices?.find((d) => d.dongle_id === selectedDongleId) ?? null);
  const settingsDevice = $derived(data.devices?.find((d) => d.dongle_id === settingsDongleId) ?? null);

  // explorer.jsx: with no devices and no selected one, the upsell takes the whole
  // window and the drawer collapses to nothing.
  const noDevicesUpsell = $derived(data.devices?.length === 0 && !selectedDongleId);

  // The drawer is permanent on wide viewports, and takes 20% of the window down
  // to a 280px floor.
  const width = $derived(innerWidth.current ?? 1280);
  const isLarge = $derived(noDevicesUpsell || width > 1080);
  const sidebarWidth = $derived(noDevicesUpsell ? 0 : Math.max(280, width * 0.2));

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

  async function onPaired(dongleId) {
    await invalidateAll();
    if (dongleId) goto(`/${dongleId}`);
  }
</script>

{#if data.mockScenario}
  <div class="fixed bottom-2 right-2 z-50 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
    mock: {data.mockScenario}
  </div>
{/if}

{#if data.authenticated && fullScreen}
  {@render children()}
{:else if data.authenticated}
  <AppHeader
    profile={data.profile}
    dongleId={selectedDongleId}
    showDrawerButton={!isLarge}
    {drawerIsOpen}
    ontoggledrawer={(open) => { drawerIsOpen = open; }}
  />

  {#if !noDevicesUpsell}
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
      onsettings={(dongleId) => { settingsDongleId = dongleId; }}
      onpaired={onPaired}
    />
  {/if}

  <div
    class="flex flex-col bg-[linear-gradient(180deg,#1D2225_0%,#16181A_100%)]"
    style={isLarge && sidebarWidth ? `width: calc(100% - ${sidebarWidth}px); margin-left: ${sidebarWidth}px` : ''}
  >
    {@render children()}
  </div>

  <DeviceSettingsModal
    isOpen={Boolean(settingsDongleId)}
    dongleId={settingsDongleId}
    device={settingsDevice}
    profile={data.profile}
    onclose={() => { settingsDongleId = null; }}
    onunpaired={async () => { settingsDongleId = null; await invalidateAll(); goto('/'); }}
    onprimenav={() => { const id = settingsDongleId; settingsDongleId = null; goto(`/${id}/prime`); }}
  />
{:else}
  {@render children()}
{/if}
