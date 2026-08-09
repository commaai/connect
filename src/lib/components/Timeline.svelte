<script>
  import dayjs from 'dayjs';

  import Thumbnails from './Thumbnails.svelte';
  import { playback } from '$lib/state/playback.svelte.js';
  import { getRouteEvents } from '$lib/state/routes.svelte.js';
  import { getSegmentNumber } from '$lib/utils';

  let {
    route,
    thumbnailsVisible = false,
    zoomOverride = null,
    hasRuler = false,
    class: className = undefined,
    onrange = undefined,
  } = $props();

  // theme.palette.states.*
  const DRIVING_BLUE = '#175886';
  const ENGAGED_GREEN = '#178645';
  const ENGAGED_GREY = '#919b95';
  const ALERT_ORANGE = '#da6f25';
  const ALERT_RED = '#c92231';
  const USER_BOOKMARK = '#e3d756';

  const AlertStatusCodes = ['normal', 'userPrompt', 'critical'];

  const STATUS_GRADIENT = 'linear-gradient(rgba(0, 0, 0, 0.0) 4%, rgb(var(--c-ink-rgb) / 0.025) 10%,'
    + ' rgba(0, 0, 0, 0.1) 25%, rgba(0, 0, 0, 0.4))';

  let dragging = $state(null);
  let hoverX = $state(null);
  let rulerBounds = $state(null);
  let thumbnail = $state({ width: 0, height: 0 });

  let thumbnailsEl = $state(null);
  let rulerEl = $state(null);
  let rulerRemainingEl = $state(null);

  const zoom = $derived(zoomOverride || playback.zoom);
  const hasRulerCls = $derived(hasRuler ? 'hasRuler' : '');

  // React attached this natively. Svelte delegates touchstart, so a delegated
  // handler runs only after the event has already passed every ancestor — too
  // late to stop the native listeners the drawer and maps install on theirs.
  $effect(() => {
    const el = rulerEl;
    if (!el) return;

    const stop = (ev) => ev.stopPropagation();
    el.addEventListener('touchstart', stop);
    return () => el.removeEventListener('touchstart', stop);
  });

  const events = $derived(route ? getRouteEvents(route.fullname) : null);

  const routeStyle = $derived.by(() => {
    if (!route || !zoom) {
      return null;
    }
    const zoomDuration = zoom.end - zoom.start;
    return `width: ${(100 * route.duration) / zoomDuration}%; left: ${(100 * -zoom.start) / zoomDuration}%`;
  });

  const bands = $derived.by(() => {
    if (!route || !events) {
      return [];
    }
    return events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        const left = (event.route_offset_millis / route.duration) * 100;
        const width = ((event.data.end_route_offset_millis - event.route_offset_millis) / route.duration) * 100;
        let style = `left: ${left}%; width: ${width}%; min-width: 1px`;
        const background = bandBackground(event);
        if (background) {
          style += `; background: ${background}`;
        }
        // TODO: remove flag once 14 days expires old events caches
        if (event.type === 'bookmark' || event.type === 'flag') {
          style += '; z-index: 1';
        }
        return style;
      });
  });

  function bandBackground(event) {
    switch (event.type) {
      case 'engage':
        return ENGAGED_GREEN;
      case 'overriding':
        return ENGAGED_GREY;
      case 'bookmark':
      case 'flag':
        return USER_BOOKMARK;
      case 'alert': {
        const status = event.data.alertStatus ? AlertStatusCodes[event.data.alertStatus] : '';
        if (status === 'userPrompt') return ALERT_ORANGE;
        if (status === 'critical') return ALERT_RED;
        return null;
      }
      default:
        return null;
    }
  }

  function percentToOffset(perc) {
    return perc * (zoom.end - zoom.start) + zoom.start;
  }

  function offsetToPercent(offset) {
    return (offset - zoom.start) / (zoom.end - zoom.start);
  }

  function percentFromPointerEvent(ev) {
    const boundingBox = ev.currentTarget.getBoundingClientRect();
    return (ev.pageX - boundingBox.left) / boundingBox.width;
  }

  const hover = $derived.by(() => {
    if (!route || !zoom || !rulerBounds || !hoverX) {
      return null;
    }
    const hoverOffset = percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
    if (Number.isNaN(hoverOffset)) {
      return null;
    }
    let text = dayjs(route.start_time_utc_millis + hoverOffset).format('HH:mm:ss');
    const segNum = getSegmentNumber(route, hoverOffset);
    if (segNum !== null) {
      text = `${segNum}, ${text}`;
    }
    return {
      text,
      left: Math.max(-10, Math.min(rulerBounds.width - 70, hoverX - rulerBounds.x - 40)),
    };
  });

  const draggerStyle = $derived.by(() => {
    if (!rulerBounds || !dragging || Math.abs(dragging[1] - dragging[0]) === 0) {
      return null;
    }
    return `left: ${Math.min(dragging[1], dragging[0]) - rulerBounds.x}px;`
      + ` width: ${Math.abs(dragging[1] - dragging[0])}px`;
  });

  function handleClick(ev) {
    if (!dragging || Math.abs(dragging[1] - dragging[0]) <= 3) {
      playback.seek(percentToOffset(percentFromPointerEvent(ev)));
    }
  }

  function handlePointerDown(ev) {
    if (ev.button !== 0) {
      return;
    }

    ev.preventDefault();
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointermove', handlePointerMove);
    dragging = [ev.pageX, ev.pageX];
  }

  function handlePointerMove(ev) {
    if (!rulerEl) {
      return;
    }
    ev.preventDefault();

    rulerBounds = rulerEl.getBoundingClientRect();
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.pageX));
    if (dragging) {
      dragging = [dragging[0], endDrag];
    }
    hoverX = endDrag;
  }

  function handlePointerUp(ev) {
    // prevent preventDefault for back(3) and forward(4) mouse buttons
    if (ev.button !== 3 && ev.button !== 4) {
      ev.preventDefault();
    }

    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointermove', handlePointerMove);
    if (!dragging || !rulerEl) {
      return;
    }
    const drag = dragging;
    dragging = null;

    rulerBounds = rulerEl.getBoundingClientRect();
    const startPercent = (Math.min(drag[0], drag[1]) - rulerBounds.x) / rulerBounds.width;
    const endPercent = (Math.max(drag[0], drag[1]) - rulerBounds.x) / rulerBounds.width;
    const startOffset = Math.round(percentToOffset(startPercent));
    const endOffset = Math.round(percentToOffset(endPercent));

    if (Math.abs(drag[1] - drag[0]) > 3) {
      const offset = playback.currentOffset();
      if (offset < startOffset || offset > endOffset) {
        playback.seek(startOffset);
      }
      onrange?.(route.log_id, startOffset, endOffset);
    } else if (ev.currentTarget !== document) {
      handleClick(ev);
    }
  }

  function handlePointerLeave() {
    hoverX = null;
  }

  $effect(() => {
    if (!thumbnailsEl || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      thumbnail = { width, height };
    });
    observer.observe(thumbnailsEl);
    return () => observer.disconnect();
  });

  // The playhead moves every frame, so it is written straight to the DOM
  // instead of going through the reactive graph.
  $effect(() => {
    if (!hasRuler) {
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      if (!rulerRemainingEl || !zoom) {
        return;
      }
      const percent = Math.floor(10000 * offsetToPercent(Math.floor(playback.currentOffset()))) / 100;
      rulerRemainingEl.style.left = `${percent}%`;
      rulerRemainingEl.style.width = `${100 - percent}%`;
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => () => {
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointermove', handlePointerMove);
  });
</script>

<div class={className}>
  <div role="presentation" class="relative {hasRulerCls}" style="width: 100%">
    <div class="relative left-0 h-[12px] w-full overflow-hidden {hasRulerCls}">
      {#if route && events}
        <div class="absolute h-[12px]" style="background: {DRIVING_BLUE}; {routeStyle}">
          {#each bands as bandStyle, i (i)}
            <div class="absolute inline-block h-[12px]" style={bandStyle}></div>
          {/each}
        </div>
      {/if}
      <div
        class="pointer-events-none absolute top-0 left-0 z-[2] h-[12px] w-full {hasRulerCls}"
        style="background: {STATUS_GRADIENT}"
      ></div>
    </div>

    <div
      bind:this={thumbnailsEl}
      class="h-[20px] w-full overflow-hidden whitespace-nowrap select-none {hasRulerCls}"
    >
      {#if thumbnailsVisible && zoom}
        <Thumbnails {thumbnail} {percentToOffset} currentRoute={route} />
      {/if}
    </div>

    {#if hasRuler}
      <div
        bind:this={rulerEl}
        role="presentation"
        class="h-[44px] w-full touch-none"
        style="background-color: rgb(37, 51, 61)"
        onpointerdown={handlePointerDown}
        onpointerup={handlePointerUp}
        onpointermove={handlePointerMove}
        onpointerleave={handlePointerLeave}
      >
        <!-- left/width are set every frame by the effect above, so they cannot come
             from tailwind utilities: this project builds them with !important. -->
        <div
          bind:this={rulerRemainingEl}
          class="pointer-events-none absolute h-[44px] opacity-[0.45]"
          style="left: 0; width: 100%; background-color: rgba(29, 34, 37, 0.9); border-left: 1px solid #D8DDDF"
        ></div>
        {#if draggerStyle}
          <div
            class="pointer-events-none absolute h-[44px]"
            style="background: rgb(var(--c-ink-rgb) / 0.1); border-left: 1px solid rgb(var(--c-ink-rgb) / 0.3); border-right: 1px solid rgb(var(--c-ink-rgb) / 0.3); {draggerStyle}"
          ></div>
        {/if}
      </div>
      {#if hover}
        <div
          class="absolute top-[83px] z-[3] w-[80px] rounded-[14px] border border-ink/10 px-[4px] py-[3px] text-center text-[0.7em] text-ink"
          style="left: {hover.left}px; background-color: var(--c-grey-800)"
        >
          {hover.text}
        </div>
      {/if}
    {/if}
  </div>
</div>
