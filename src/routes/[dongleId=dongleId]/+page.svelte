<script>
  import { goto } from '$app/navigation';

  import DeviceInfo from '$lib/components/DeviceInfo.svelte';
  import DriveList from '$lib/components/DriveList.svelte';
  import Navigation from '$lib/components/Navigation.svelte';
  import TimeSelect from '$lib/components/TimeSelect.svelte';
  import { LIMIT_INCREMENT, fetchRoutes, getPagedFilter } from '$lib/state/route-list';

  let { data } = $props();

  let filter = $state(null);
  let routes = $state(null);
  let lastRoutes = $state(null);
  let limit = $state(0);
  let filterOpen = $state(false);

  // The load function owns the first page; a new range, load-more, or a
  // visibility refetch is handled here.
  $effect(() => {
    filter = data.filter;
    routes = data.routes;
    lastRoutes = data.routes;
    limit = data.limit;
  });

  async function refetch(nextFilter, nextLimit) {
    lastRoutes = routes;
    routes = null;
    filter = nextFilter;
    limit = nextLimit;
    routes = await fetchRoutes(data.dongleId, nextFilter, nextLimit).catch(() => null);
  }

  /** checkLastRoutesData: page by raising the limit, over a fresh five-year window. */
  function loadMore() {
    if (routes && routes.length < limit) return;
    refetch(getPagedFilter(), limit + LIMIT_INCREMENT);
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
    onrefresh={() => refetch(filter, limit)}
    onloadmore={loadMore}
  />
</div>

<TimeSelect
  isOpen={filterOpen}
  {filter}
  onclose={() => { filterOpen = false; }}
  onselect={(start, end) => refetch({ start, end }, limit)}
/>
