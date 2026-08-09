<script>
  import { goto } from '$app/navigation';

  import DriveView from '$lib/components/drive/DriveView.svelte';

  let { data } = $props();
</script>

<div class="flex flex-col">
  <DriveView
    dongleId={data.dongleId}
    route={data.route}
    device={data.device}
    profile={data.profile}
    routes={data.routes}
    onclose={() => goto(`/${data.dongleId}`)}
  />
</div>
