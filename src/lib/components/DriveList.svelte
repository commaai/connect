<script>
  import * as Sentry from '@sentry/browser';

  import { devices as Devices } from '$lib/api';
  import { inView } from '$lib/attachments/in-view';
  import { watchReturn } from '$lib/state/page-active';
  import { isMetric, KM_PER_MI } from '$lib/utils/conversions';
  import DriveListEmpty from './DriveListEmpty.svelte';
  import DriveListItem from './DriveListItem.svelte';

  let { dongleId, device, routes, lastRoutes, onfilter, onrefresh, onloadmore } = $props();

  let deviceStats = $state({});

  async function loadStats(id) {
    deviceStats = { fetching: true };
    try {
      deviceStats = { result: await Devices.fetchDeviceStats(id) };
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'drive_list_device_stats' });
      deviceStats = { error: err.message };
    }
  }

  function refreshStats() {
    if (!dongleId || device?.shared) return;
    loadStats(dongleId);
  }

  $effect(() => {
    const id = dongleId;
    const shared = device?.shared;
    deviceStats = {};
    if (id && !shared) loadStats(id);
  });

  const refreshOnReturn = watchReturn(() => {
    onrefresh?.();
    refreshStats();
  }, { minInterval: 60 });
  $effect(refreshOnReturn);

  const metric = isMetric();
  const distance = $derived(deviceStats.result
    ? Math.round(deviceStats.result.all.distance * (metric ? KM_PER_MI : 1))
    : 0);

  // Routes are cleared while fetching, so fall back to the previous set rather
  // than blanking the list.
  const displayRoutes = $derived.by(() => {
    const list = routes ?? lastRoutes;
    if (!list?.length) return [];
    // Sort with the latest drive first, working around an upstream sorting
    // issue: https://github.com/commaai/connect/issues/451
    return [...list].sort((a, b) => b.start_time_utc_millis - a.start_time_utc_millis);
  });
</script>

<div class="flex flex-col grow py-2">
  <div class="flex flex-row justify-between mx-4 pb-2 gap-2 flex-wrap">
    {#if deviceStats.result}
      <div class="flex gap-2.5 md:gap-8 items-center px-1 justify-center xss:justify-start">
        <div class="flex flex-row items-center gap-1">
          <p class="text-[0.875rem] font-semibold text-white">{distance}</p>
          <p class="text-[0.875rem]">{metric ? 'kilometers' : 'miles'}</p>
        </div>
        <div class="flex flex-row items-center gap-1">
          <p class="text-[0.875rem] font-semibold text-white">{deviceStats.result.all.routes}</p>
          <p class="text-[0.875rem]">drives</p>
        </div>
        <div class="flex flex-row items-center gap-1">
          <p class="text-[0.875rem] font-semibold text-white">{Math.round(deviceStats.result.all.minutes / 60.0)}</p>
          <p class="text-[0.875rem]">hours</p>
        </div>
      </div>
    {:else}
      <div></div>
    {/if}

    <button
      type="button"
      class="w-full xxs:w-fit flex flex-row items-center justify-center text-white normal-case py-1 px-2 rounded-md whitespace-nowrap active:scale-[0.98] cursor-pointer"
      style="background: linear-gradient(to bottom, #30373B 0%, #1D2225 150%)"
      onclick={() => onfilter?.()}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" class="mr-2 text-xl" aria-hidden="true">
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
      </svg>
      <p class="text-[0.875rem]">Filter</p>
    </button>
  </div>

  {#if displayRoutes.length}
    <div class="DriveList px-4 flex-1">
      {#each displayRoutes as drive, index (drive.fullname)}
        <!-- fetch the next page once the last entry is reached -->
        <DriveListItem
          {drive}
          {@attach index === displayRoutes.length - 1 && inView(() => onloadmore?.())}
        />
      {/each}
    </div>
  {/if}

  {#if !routes || routes.length === 0}
    <DriveListEmpty {device} {routes} />
  {:else if routes.length > 5}
    <div class="p-2 text-center mb-8">
      <p class="text-[0.875rem]">There are no more routes found in selected time range.</p>
    </div>
  {/if}
</div>
