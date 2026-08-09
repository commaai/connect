<script>
  let {
    activeCamera,
    onswitchcamera,
    gamepadConnected = false,
    video = null,
    isLandscape = false,
    controlsDisabled = false,
  } = $props();

  const CAMERAS = [
    { key: 'wideRoad', label: 'road', num: '1' },
    { key: 'driver', label: 'driver', num: '2' },
  ];

  const btnBase = 'h-11 w-[80px] rounded-xl text-[14px] font-bold tracking-[0.2px] uppercase flex items-center justify-center min-w-[44px] cursor-pointer select-none hover:text-white hover:bg-white/20 bg-glass';
  const btnInactive = `${btnBase} bg-white/10 text-white/60`;
  const btnActive = `${btnBase} bg-white/30 text-white`;

  const controlsGroupBase = 'z-10 flex flex-row items-stretch gap-3.5 rounded-[20px] p-4 bg-glass-dark';
  const controlsGroupLandscape = 'absolute bottom-4 left-4';
  const controlsGroupPortrait = 'relative self-stretch rounded-none shrink-0 justify-between gap-2';

  const labelClass = 'text-[10px] lg:text-[13px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none';

  let screenshotInProgress = false;

  async function handleScreenshot() {
    if (controlsDisabled || screenshotInProgress) return;
    if (!video || !video.videoWidth) return;
    screenshotInProgress = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      const filename = `screenshot_${activeCamera}_${Date.now()}.png`;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      screenshotInProgress = false;
    }
  }

  // overwrite default touch callback to avoid rapid double taps zooming in on iOS
  function handleScreenshotTouch(e) {
    e.preventDefault();
    if (controlsDisabled) return;
    handleScreenshot();
  }

  // handle touch directly: iOS does not synthesize a click on a second finger
  // while another touch (the joystick) is already active
  function handleSwitchCameraTouch(e, cameraKey) {
    e.preventDefault();
    if (controlsDisabled) return;
    onswitchcamera?.(cameraKey);
  }
</script>

<div class="{controlsGroupBase} {isLandscape ? controlsGroupLandscape : controlsGroupPortrait}" style="line-height: 1.5">
  {#if !gamepadConnected}
    <div class="flex flex-col items-center justify-between gap-[5px] lg:gap-[7px]">
      <div class="flex gap-[4px] items-center">
        {#each CAMERAS as cam (cam.key)}
          <button
            type="button"
            class="{activeCamera === cam.key ? btnActive : btnInactive} transition duration-200 {controlsDisabled ? 'opacity-50' : 'opacity-90'}"
            disabled={controlsDisabled}
            onclick={() => onswitchcamera?.(cam.key)}
            ontouchend={(e) => handleSwitchCameraTouch(e, cam.key)}
          >{cam.label}</button>
        {/each}
      </div>
      <span class={labelClass}>Camera</span>
    </div>
  {/if}
  <div class="flex flex-col items-center justify-between gap-[5px] lg:gap-[7px]">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="{btnInactive} w-full transition duration-200 {controlsDisabled ? 'opacity-50 pointer-events-none' : 'opacity-90'}"
      onclick={handleScreenshot}
      ontouchend={handleScreenshotTouch}
      title="Save screenshot"
    >
      <!-- @material-ui/icons PhotoCamera. text-[25px] beats SvgIcon's own 24px:
           the project imports tailwind in `important` mode. -->
      <svg
        class="inline-block shrink-0 select-none text-[25px]"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="1em"
        height="1em"
        style="font-size:24px"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="3.2" />
        <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
      </svg>
    </div>
    <span class={labelClass}>Snapshot</span>
  </div>
</div>
