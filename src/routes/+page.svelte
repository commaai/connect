<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  import AnonymousLanding from '$lib/components/AnonymousLanding.svelte';
  import NoDeviceUpsell from '$lib/components/NoDeviceUpsell.svelte';
  import RouteStub from '$lib/RouteStub.svelte';
  import { rememberRedirect } from '$lib/auth';

  let { data } = $props();

  const noDevices = $derived(data.devices?.length === 0);

  onMount(() => {
    if (!data.authenticated) rememberRedirect(page.url);
  });

  async function onPaired(dongleId) {
    await invalidateAll();
    if (dongleId) goto(`/${dongleId}`);
  }
</script>

{#if !data.authenticated}
  <AnonymousLanding />
{:else if noDevices}
  <NoDeviceUpsell onpaired={onPaired} />
{:else}
  <RouteStub name="Dashboard" source="src/components/explorer.jsx" />
{/if}
