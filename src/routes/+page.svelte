<script>
  import { goto, invalidateAll } from '$app/navigation';

  import NoDeviceUpsell from '$lib/components/NoDeviceUpsell.svelte';

  async function onPaired(dongleId) {
    await invalidateAll();
    if (dongleId) goto(`/${dongleId}`);
  }
</script>

<!--
  +page.js redirects to /{dongleId} as soon as there is a device to pick, and the
  layout shows the landing page to anyone signed out, so the only way to get here
  is signed in with nothing paired.
-->
<NoDeviceUpsell onpaired={onPaired} />
