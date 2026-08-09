<script>
  import dayjs from 'dayjs';

  import Tooltip from '$lib/components/Tooltip.svelte';
  import { playback } from '$lib/state/playback.svelte.js';
  import { getSegmentNumber } from '$lib/utils';
  import { isIos } from '$lib/utils/browser';

  let {
    route,
    isThin = false,
    isMuted = false,
    hasAudio = false,
    onmutetoggle = undefined,
  } = $props();

  const timerSteps = [
    0.1,
    0.25,
    0.5,
    1,
    2,
    4,
    8,
  ];

  // theme.palette.grey[*]
  const GREY_999 = 'var(--c-grey-999)';
  const GREY_900 = 'var(--c-grey-900)';
  const GREY_500 = 'var(--c-grey-500)';
  const GREY_300 = 'var(--c-grey-300)';

  // MuiButtonBase root + MuiIconButton root. The theme disables the ripple, so
  // the button has no ripple span. Size and colour stay out of it: two
  // conflicting Tailwind utilities on one element are decided by the generated
  // sheet, not by the order they are written in.
  const iconButton = 'relative inline-flex flex-none cursor-pointer appearance-none items-center'
    + ' justify-center rounded-[50%] border-0 bg-transparent p-0 text-center align-middle outline-none'
    + ' select-none hover:bg-ink/10 disabled:pointer-events-none disabled:cursor-default';
  // Everything an <input>/<button> takes from preflight's `font: inherit`, which
  // MUI set on the class instead.
  const iconButtonStyle = 'font-size: 1.5rem; line-height: 1.5';
  // MuiIconButton label
  const iconButtonLabel = 'display: flex; align-items: inherit; justify-content: inherit';

  // MuiSvgIcon root, with styles.icon over it
  const icon = 'font-size: 24px; flex-shrink: 0; user-select: none; width: 98%; height: 98%';
  const smallIcon = 'font-size: 24px; flex-shrink: 0; user-select: none; width: 80%; height: 80%';
  const dim = `color: ${GREY_300}`;
  // styles.tinyArrowIcon, on both the button and the icon it holds
  const tinyArrowIcon = `font-size: 24px; flex-shrink: 0; user-select: none; width: 12px; height: 12px; color: ${GREY_500}`;

  // MuiTooltip tooltip, at the default bottom placement
  const tooltipPanel = 'rounded-[4px] bg-[var(--c-panel-3)] px-2 py-1 text-[0.625rem] text-ink';

  const noAudioTooltip = 'Enable audio recording through the "Record and Upload Microphone Audio"'
    + ' toggle on your device';

  // Frame clock: the offset moves with wall-clock time, not with state, so the
  // label is redriven per frame instead of per assignment.
  let tick = $state(0);

  // getDerivedStateFromProps kept the last non-zero speed, so unpausing resumes
  // at the speed that was set before.
  let lastPlaySpeed = $state(playback.desiredPlaySpeed || 1);

  const zoom = $derived(playback.zoom);
  const isPaused = $derived(playback.desiredPlaySpeed === 0);

  const speedIndex = $derived(timerSteps.indexOf(lastPlaySpeed) === -1
    ? timerSteps.indexOf(1)
    : timerSteps.indexOf(lastPlaySpeed));
  const canIncreaseSpeed = $derived(speedIndex < timerSteps.length - 1);
  const canDecreaseSpeed = $derived(speedIndex > 0);

  function getDisplayTime(frame) {
    const offset = playback.currentOffset();
    const now = new Date(offset + route?.start_time_utc_millis);
    if (Number.isNaN(now.getTime())) {
      return '...';
    }
    let dateString = dayjs(now).format('HH:mm:ss');
    const seg = getSegmentNumber(route, offset);
    if (seg !== null) {
      dateString = `${dateString} – ${seg}`;
    }

    return dateString;
  }

  const displayTime = $derived(getDisplayTime(tick));

  function jumpBack(amount) {
    playback.seek(playback.currentOffset() - amount);
  }

  function jumpForward(amount) {
    playback.seek(playback.currentOffset() + amount);
  }

  function increaseSpeed() {
    playback.play(timerSteps[Math.min(timerSteps.length - 1, speedIndex + 1)]);
  }

  function decreaseSpeed() {
    playback.play(timerSteps[Math.max(0, speedIndex - 1)]);
  }

  function togglePause() {
    if (playback.desiredPlaySpeed === 0) {
      playback.play(lastPlaySpeed);
    } else {
      playback.pause();
    }
  }

  $effect(() => {
    const speed = playback.desiredPlaySpeed;
    if (speed !== 0) {
      lastPlaySpeed = speed;
    }
  });

  $effect(() => {
    let frame = requestAnimationFrame(function updateTime() {
      tick = performance.now();
      frame = requestAnimationFrame(updateTime);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#snippet replay10(style)}
  <!-- icons/index.jsx Replay10 -->
  <svg viewBox="0 -960 960 960" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <path d="M480-80q-75 0-140.5-28T225-185q-49-49-77-114.5T120-440h60q0 125 87.32 212.5T480-140t212.68-87.32Q780-314.64 780-440t-85-212.68Q610-740 485-740h-22l73 73-42 42-147-147 147-147 41 41-78 78h23q75 0 140.5 28T735-695q49 49 77 114.5T840-440q0 75-28 140.5T735-185q-49 49-114.5 77T480-80ZM360-310v-212h-54v-49h104v261h-50Zm147 0q-18.7 0-31.35-12.65Q463-335.3 463-354v-173q0-18.7 12.65-31.35Q488.3-571 507-571h83q18.7 0 31.35 12.65Q634-545.7 634-527v173q0 18.7-12.65 31.35Q608.7-310 590-310h-83Zm6-50h71v-162h-71v162Z" />
  </svg>
{/snippet}

{#snippet forward10(style)}
  <!-- icons/index.jsx Forward10 -->
  <svg viewBox="0 -960 960 960" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <path d="M360-310v-212h-54v-49h104v261h-50Zm147 0q-18.7 0-31.35-12.65Q463-335.3 463-354v-173q0-18.7 12.65-31.35Q488.3-571 507-571h83q18.7 0 31.35 12.65Q634-545.7 634-527v173q0 18.7-12.65 31.35Q608.7-310 590-310h-83Zm6-50h71v-162h-71v162ZM480-80q-75 0-140.5-28T225-185q-49-49-77-114.5T120-440q0-75 28-140.5T225-695q49-49 114.5-77T480-800h21l-78-78 41-41 147 147-147 147-41-41 74-74h-17q-125.36 0-212.68 87.32Q180-565.36 180-440t87.32 212.68Q354.64-140 480-140t212.68-87.32Q780-314.64 780-440h60q0 75-28 140.5T735-185q-49 49-114.5 77T480-80Z" />
  </svg>
{/snippet}

{#snippet upArrow(style)}
  <!-- icons/index.jsx UpArrow: the chevron path, rotated 90 -->
  <svg viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <path
      transform="rotate(90, 12.3, 12)"
      d="M16.8625817,0.35528597 C16.3546389,-0.125475313 15.550396,-0.125475313 15.0847818,0.398991541 L5.3492107,11.1068565 C4.88359643,11.6313233 4.88359643,12.4180236 5.3492107,12.8987849 L15.0847818,23.6066499 C15.3387532,23.8688833 15.6773817,24 16.0160103,24 C16.3123103,24 16.6509389,23.8688833 16.9049103,23.6503554 C17.4128531,23.1695941 17.4551817,22.3391883 16.9472388,21.8147214 L7.97358203,12.0246735 L16.9049103,2.19091996 C17.3705245,1.66645311 17.3705245,0.836047253 16.8625817,0.35528597 Z"
    />
  </svg>
{/snippet}

{#snippet downArrow(style)}
  <!-- icons/index.jsx DownArrow = ChevronIcon: the chevron path, rotated 270 -->
  <svg viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <path
      transform="rotate(270, 12.3, 12)"
      d="M16.8625817,0.35528597 C16.3546389,-0.125475313 15.550396,-0.125475313 15.0847818,0.398991541 L5.3492107,11.1068565 C4.88359643,11.6313233 4.88359643,12.4180236 5.3492107,12.8987849 L15.0847818,23.6066499 C15.3387532,23.8688833 15.6773817,24 16.0160103,24 C16.3123103,24 16.6509389,23.8688833 16.9049103,23.6503554 C17.4128531,23.1695941 17.4551817,22.3391883 16.9472388,21.8147214 L7.97358203,12.0246735 L16.9049103,2.19091996 C17.3705245,1.66645311 17.3705245,0.836047253 16.8625817,0.35528597 Z"
    />
  </svg>
{/snippet}

{#snippet volumeUp(style)}
  <!-- @material-ui/icons/VolumeUp -->
  <svg viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <g><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></g>
  </svg>
{/snippet}

{#snippet volumeOff(style)}
  <!-- @material-ui/icons/VolumeOff -->
  <svg viewBox="0 0 24 24" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <g><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></g>
  </svg>
{/snippet}

{#snippet playArrow(style)}
  <!-- icons/index.jsx PlayArrow -->
  <svg viewBox="0 -960 960 960" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <path d="M320-203v-560l440 280-440 280Z" />
  </svg>
{/snippet}

{#snippet pauseIcon(style)}
  <!-- icons/index.jsx Pause -->
  <svg viewBox="0 -960 960 960" fill="currentColor" style={style} aria-hidden="true" focusable="false">
    <path d="M555-200v-560h175v560H555Zm-325 0v-560h175v560H230Z" />
  </svg>
{/snippet}

<div
  class="mx-auto flex max-w-full items-center rounded-[32px] {zoom ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}"
  style="width: 400px; height: {isThin ? '50px' : '64px'}; padding: {isThin ? '0 8px' : '8px'}; background-color: {GREY_999}; transition: opacity 0.1s ease-in-out"
>
  <div style="border-right: 1px solid {GREY_900}">
    <button
      type="button"
      class="{iconButton} h-10 w-10 text-ink"
      style={iconButtonStyle}
      onclick={() => jumpBack(10000)}
      aria-label="Jump back 10 seconds"
    >
      <span class="w-full" style={iconButtonLabel}>
        {@render replay10(`${smallIcon}; ${dim}`)}
      </span>
    </button>
  </div>
  <div style="border-right: 1px solid {GREY_900}">
    <button
      type="button"
      class="{iconButton} h-10 w-10 text-ink"
      style={iconButtonStyle}
      onclick={() => jumpForward(10000)}
      aria-label="Jump forward 10 seconds"
    >
      <span class="w-full" style={iconButtonLabel}>
        {@render forward10(`${smallIcon}; ${dim}`)}
      </span>
    </button>
  </div>

  {#if !isThin}
    <!-- Typography caption, with the paddingTop it was given inline -->
    <span class="block text-center text-[0.75rem] font-normal text-ink/70" style="padding-top: 4px; line-height: 1.375em">CURRENT PLAYBACK TIME</span>
  {/if}

  <!-- Typography body1 + styles.currentTime -->
  <p class="grow text-center text-[15px] font-medium text-ink" style="display: block; margin: 0 8px; line-height: 1.46429em"><span>{displayTime}</span></p>

  {#if !isIos()}
    <div class="mr-2 flex min-w-10 flex-col items-center">
      <button
        type="button"
        class="{iconButton} h-3 w-3 disabled:invisible"
        style="{iconButtonStyle}; color: {GREY_500}"
        onclick={increaseSpeed}
        disabled={!canIncreaseSpeed}
        aria-label="Increase play speed by 1 step"
      >
        <span class="w-full" style={iconButtonLabel}>
          {@render upArrow(tinyArrowIcon)}
        </span>
      </button>
      <!-- Typography body2 -->
      <aside class="text-center text-[0.875rem] font-medium text-ink" style="display: block; line-height: 1.71429em">{lastPlaySpeed}×</aside>
      <button
        type="button"
        class="{iconButton} h-3 w-3 disabled:invisible"
        style="{iconButtonStyle}; color: {GREY_500}"
        onclick={decreaseSpeed}
        disabled={!canDecreaseSpeed}
        aria-label="Decrease play speed by 1 step"
      >
        <span class="w-full" style={iconButtonLabel}>
          {@render downArrow(tinyArrowIcon)}
        </span>
      </button>
    </div>
  {/if}

  <div style="border-left: 1px solid {GREY_900}">
    <Tooltip title={hasAudio ? '' : noAudioTooltip} panelClass={tooltipPanel}>
      <div>
        <button
          type="button"
          class="{iconButton} h-10 w-10 text-ink disabled:text-ink/30"
          style={iconButtonStyle}
          onclick={onmutetoggle}
          disabled={!hasAudio}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          <span class="w-full" style={iconButtonLabel}>
            {#if isMuted}
              {@render volumeOff(hasAudio ? smallIcon : `${smallIcon}; ${dim}`)}
            {:else}
              {@render volumeUp(smallIcon)}
            {/if}
          </span>
        </button>
      </div>
    </Tooltip>
  </div>

  <div style="border-left: 1px solid {GREY_900}">
    <button
      type="button"
      class="{iconButton} h-12 w-12 text-ink"
      style={iconButtonStyle}
      onclick={togglePause}
      aria-label={isPaused ? 'Unpause' : 'Pause'}
    >
      <span class="w-full" style={iconButtonLabel}>
        {#if isPaused}
          {@render playArrow(icon)}
        {:else}
          {@render pauseIcon(icon)}
        {/if}
      </span>
    </button>
  </div>
</div>
