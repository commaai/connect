<script>
  import { goto } from '$app/navigation';

  import DriveView from './DriveView.svelte';

  let { data, initialZoom = null } = $props();
</script>

<div class="flex flex-col">
  <DriveView
    dongleId={data.dongleId}
    route={data.route}
    device={data.device}
    profile={data.profile}
    routes={data.routes}
    {initialZoom}
    onclose={() => goto(`/${data.dongleId}`)}
  />
</div>
