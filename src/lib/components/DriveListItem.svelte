<script>
  import { goto } from '$app/navigation';
  import { innerWidth } from 'svelte/reactivity/window';

  import Timeline from '$lib/components/Timeline.svelte';
  import { playback } from '$lib/state/playback.svelte.js';
  import { fetchEvents, fetchLocations, getRouteLocations } from '$lib/state/routes.svelte.js';
  import { filterRegularClick } from '$lib/utils';
  import { formatDrive } from './drive-list-item-format';

  let { drive } = $props();

  let el = $state(null);
  let isVisible = $state(false);

  const fmt = $derived(formatDrive(drive, innerWidth.current ?? 1280));

  const locations = $derived(getRouteLocations(drive.fullname) ?? {});
  const startLocation = $derived(drive.startLocation ?? locations.startLocation);
  const endLocation = $derived(drive.endLocation ?? locations.endLocation);

  // Events and thumbnails are only fetched once the entry is close to the
  // viewport; a long drive list would otherwise fetch every route at once.
  $effect(() => {
    if (isVisible || !el) return;

    const check = () => {
      if (!window.visualViewport || window.visualViewport.height >= el.getBoundingClientRect().y - 300) {
        isVisible = true;
        fetchEvents(drive);
        fetchLocations(drive);
      }
    };

    window.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    check();

    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  });

  const onclick = filterRegularClick(() => {
    playback.reset();
    playback.selectLoop(0, drive.duration);
    goto(`/${drive.dongle_id}/${drive.log_id}`);
  });
</script>

<a
  class="DriveEntry flex flex-col mb-3 overflow-hidden rounded-lg p-0 no-underline border-t border-ink/5"
  style="background: linear-gradient(to bottom, var(--c-panel) 0%, var(--c-page-top) 100%); transition: background .2s"
  bind:this={el}
  href={`/${drive.dongle_id}/${drive.log_id}`}
  {onclick}
>
  <div class="items-center" style={fmt.small ? 'padding: 18px' : 'padding: 18px 32px'}>
    <!-- MUI <Grid container> -->
    <div class="box-border flex w-full flex-wrap">
      <div class="grow" style={fmt.grid.date}>
        <p class="text-[0.875rem] font-semibold">{fmt.startDate}</p>
        <p class="text-[0.875rem]">{fmt.startTime} to {fmt.endTime}</p>
      </div>
      <div class="grow {fmt.small ? 'text-right' : ''}" style={fmt.grid.dur}>
        <p class="text-[0.875rem] font-semibold">{fmt.duration}</p>
        <p class="text-[0.875rem]">{fmt.distance}</p>
      </div>
      <div class="grow" style={fmt.grid.origin}>
        <p class="text-[0.875rem] font-semibold">{startLocation?.place}</p>
        <p class="text-[0.875rem]">{startLocation?.details}</p>
      </div>
      <div class="grow {fmt.small ? 'text-right' : ''}" style={fmt.grid.dest}>
        <p class="text-[0.875rem] font-semibold">{endLocation?.place}</p>
        <p class="text-[0.875rem]">{endLocation?.details}</p>
      </div>
      {#if !fmt.small}
        <div class="grow" style={fmt.grid.arrow}>
          <!-- icons/index.jsx RightArrow, at Colors.grey500 -->
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            style="font-size:24px; color:var(--c-grey-500); width:32px; height:100%; margin-left:25%; flex-shrink:0; user-select:none"
            aria-hidden="true"
          >
            <path
              transform="rotate(180, 12.3, 12)"
              d="M16.8625817,0.35528597 C16.3546389,-0.125475313 15.550396,-0.125475313 15.0847818,0.398991541 L5.3492107,11.1068565 C4.88359643,11.6313233 4.88359643,12.4180236 5.3492107,12.8987849 L15.0847818,23.6066499 C15.3387532,23.8688833 15.6773817,24 16.0160103,24 C16.3123103,24 16.6509389,23.8688833 16.9049103,23.6503554 C17.4128531,23.1695941 17.4551817,22.3391883 16.9472388,21.8147214 L7.97358203,12.0246735 L16.9049103,2.19091996 C17.3705245,1.66645311 17.3705245,0.836047253 16.8625817,0.35528597 Z"
            />
          </svg>
        </div>
      {/if}
    </div>
  </div>

  <Timeline route={drive} thumbnailsVisible={isVisible} zoomOverride={{ start: 0, end: drive.duration }} />
</a>
