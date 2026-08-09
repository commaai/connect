<script>
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  import AnonymousLanding from '$lib/components/AnonymousLanding.svelte';
  import RouteStub from '$lib/RouteStub.svelte';
  import { rememberRedirect } from '$lib/auth';

  let { data } = $props();

  onMount(() => {
    if (!data.authenticated) rememberRedirect(page.url);
  });
</script>

{#if data.authenticated}
  <RouteStub name="Dashboard" source="src/components/explorer.jsx" />
{:else}
  <AnonymousLanding />
{/if}
