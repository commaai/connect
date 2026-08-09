<script>
  import dayjs from 'dayjs';
  import { goto } from '$app/navigation';

  import Timeline from '$lib/components/Timeline.svelte';
  import { playback } from '$lib/state/playback.svelte.js';
  import { filterRegularClick } from '$lib/utils';
  import Media from './Media.svelte';

  let {
    dongleId,
    route,
    device = null,
    profile = null,
    routes = null,
    onclose,
    onanalytics = undefined,
  } = $props();

  const zoom = $derived(playback.zoom ?? { start: 0, end: route?.duration ?? 0, previous: null });

  // explorer only mounted DriveView after pushTimelineRange had set the zoom and
  // the loop. Seed them here so a direct load does not render an empty timeline.
  $effect(() => {
    if (!route) return;
    if (!playback.zoom) {
      playback.zoom = { start: 0, end: route.duration, previous: null };
    }
    if (!playback.loop) {
      playback.selectLoop(0, route.duration);
    }
  });

  const currentRouteBoundsSelected = $derived(zoom.start === 0 && zoom.end === route?.duration);
  // `zoom.previousZoom` is never set — the reducer keeps the stack in `zoom.previous` —
  // so this only ever means "the whole route is selected".
  const backButtonDisabled = $derived(!zoom.previousZoom && currentRouteBoundsSelected);

  // FIXME: end time not always same day as start time
  const start = $derived((route?.start_time_utc_millis ?? 0) + zoom.start);
  const startDay = $derived(dayjs(start).format('dddd'));
  const startTime = $derived(
    dayjs(start).format(`MMM D${dayjs().year() === dayjs(start).year() ? '' : ', YYYY'} @ HH:mm`),
  );
  const endTime = $derived(dayjs(start + (zoom.end - zoom.start)).format('HH:mm'));

  /** actions/index.js updateTimeline: keep the loop inside the range, then sync the path. */
  function updateTimeline(logId, rangeStart, rangeEnd) {
    const { loop } = playback;
    if (!loop || !loop.startTime || !loop.duration || loop.startTime < rangeStart
      || loop.startTime + loop.duration > rangeEnd || loop.duration < rangeEnd - rangeStart) {
      playback.reset();
      playback.selectLoop(rangeStart, rangeEnd);
    }

    // urlForState
    let path = `/${dongleId}`;
    if (logId) {
      path += `/${logId}`;
      if (rangeStart && rangeEnd && rangeStart > 0) {
        path += `/${Math.floor(rangeStart / 1000)}/${Math.floor(rangeEnd / 1000)}`;
      }
    }
    if (window.location.pathname !== path) {
      goto(path);
    }
  }

  /** TIMELINE_PUSH_SELECTION: the previous zoom becomes the parent of the new one. */
  function pushRange(logId, rangeStart, rangeEnd) {
    playback.zoom = { start: rangeStart, end: rangeEnd, previous: playback.zoom };
    updateTimeline(logId, rangeStart, rangeEnd);
  }

  function onBack() {
    if (zoom.previous) {
      const { previous } = zoom;
      playback.zoom = previous;
      updateTimeline(route?.log_id, previous.start, previous.end);
    } else if (route) {
      // pushTimelineRange(log_id, null, null): back to the whole route, no loop
      playback.zoom = { start: 0, end: route.duration, previous: playback.zoom };
      updateTimeline(route.log_id, null, null);
    }
  }

  const close = filterRegularClick(() => {
    // pushTimelineRange(null, null, null): reset playback, drop the loop, back to the device
    playback.zoom = null;
    playback.reset();
    playback.selectLoop(null, null);
    onclose?.();
    if (window.location.pathname !== `/${dongleId}`) {
      goto(`/${dongleId}`);
    }
  });
</script>

<div class="DriveView">
  <div class="flex flex-col rounded-lg m-4 bg-[linear-gradient(to_bottom,#30373B_0%,#272D30_10%,#1D2225_100%)]">
    <div>
      <div class="items-center justify-between flex p-3 gap-2">
        <!-- MUI IconButton -->
        <button
          type="button"
          class="iconButton"
          aria-label="Go Back"
          disabled={backButtonDisabled}
          onclick={onBack}
        >
          <span class="label">
            <!-- icons/index.jsx ArrowBackBold -->
            <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true" focusable="false">
              <path d="M480-149 149-480l331-331 67 66-217 218h481v94H330l217 217-67 67Z" />
            </svg>
          </span>
        </button>
        <div class="text-white text-lg font-medium">
          <span class="hidden sm:inline">{`${startDay} `}</span>{`${startTime} - ${endTime}`}
        </div>
        <!-- IconButton with an href renders a ButtonBase <a> -->
        <a class="iconButton" aria-label="Close" href={`/${dongleId}`} onclick={close}>
          <span class="label">
            <!-- icons/index.jsx CloseBold -->
            <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true" focusable="false">
              <path d="m249-183-66-66 231-231-231-231 66-66 231 231 231-231 66 66-231 231 231 231-66 66-231-231-231 231Z" />
            </svg>
          </span>
        </a>
      </div>
      <Timeline {route} thumbnailsVisible hasRuler onrange={pushRange} />
    </div>
    <div class="p-3 md:p-8">
      {#if routes && routes.length === 0}
        <p class="typography body1">Route does not exist.</p>
      {:else}
        <Media {route} {dongleId} {device} {profile} {onanalytics} />
      {/if}
    </div>
  </div>
</div>

<style>
  /* MuiTypography root + body1 */
  .typography {
    display: block;
    margin: 0;
  }

  .body1 {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.46429em;
    color: #fff;
  }

  /* MuiButtonBase root + MuiIconButton root, palette.action.active on a dark theme */
  .iconButton {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    margin: 0;
    border-radius: 50%;
    background-color: transparent;
    color: #fff;
    font-size: 1.5rem;
    text-align: center;
    text-decoration: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .iconButton:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .iconButton:disabled {
    color: rgba(255, 255, 255, 0.3);
    pointer-events: none;
    cursor: default;
  }

  .iconButton:disabled:hover {
    background-color: transparent;
  }

  /* MuiIconButton label */
  .label {
    width: 100%;
    display: flex;
    align-items: inherit;
    justify-content: inherit;
  }
</style>
