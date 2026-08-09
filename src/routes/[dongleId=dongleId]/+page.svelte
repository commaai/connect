<script>
  import { goto } from '$app/navigation';

  import DeviceInfo from '$lib/components/DeviceInfo.svelte';
  import DriveList from '$lib/components/DriveList.svelte';
  import Navigation from '$lib/components/Navigation.svelte';
  import TimeSelect from '$lib/components/TimeSelect.svelte';
  import { fetchRoutes } from '$lib/state/route-list';

  let { data } = $props();

  let filter = $state(null);
  let routes = $state(null);
  let lastRoutes = $state(null);
  let filterOpen = $state(false);

  // The load function owns the first page of results; anything after that
  // (a new time range, load-more, a visibility refetch) is refetched here.
  $effect(() => {
    filter = data.filter;
    routes = data.routes;
    lastRoutes = data.routes;
  });

  async function reload(next) {
    lastRoutes = routes;
    routes = null;
    filter = next;
    routes = await fetchRoutes(data.dongleId, next).catch(() => null);
  }
</script>

<div class="flex flex-col">
  <Navigation
    dongleId={data.dongleId}
    device={data.device}
    onprimenav={() => goto(`/${data.dongleId}/prime`)}
  />
  <DeviceInfo dongleId={data.dongleId} device={data.device} />
  <DriveList
    dongleId={data.dongleId}
    device={data.device}
    {routes}
    {lastRoutes}
    onfilter={() => { filterOpen = true; }}
    onrefresh={() => reload(filter)}
  />
</div>

<TimeSelect
  isOpen={filterOpen}
  {filter}
  onclose={() => { filterOpen = false; }}
  onselect={(start, end) => reload({ start, end })}
/>
