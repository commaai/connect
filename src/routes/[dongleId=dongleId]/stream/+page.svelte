<script>
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { goto } from '$app/navigation';

  import ControlsBar from '$lib/components/teleop/ControlsBar.svelte';
  import Joystick from '$lib/components/teleop/Joystick.svelte';
  import StatusBar from '$lib/components/teleop/StatusBar.svelte';
  import Video from '$lib/components/teleop/Video.svelte';
  import { deviceNamePretty } from '$lib/utils';
  import { isIos } from '$lib/utils/browser';
  import { webrtcConnectionManager } from '$lib/utils/webrtc';

  let { data } = $props();

  let connectionState = $state('none');
  let battery = $state(null);
  let error = $state(null);
  let activeCamera = $state('wideRoad');
  let gamepadConnected = $state(false);
  let inputActive = $state(false);
  let connectionTotalMs = $state(null);
  let started = $state(false);
  let videoEnabled = $state(true);

  let connection = $state(null);
  let stream = $state(null);
  let containerEl = $state(null);

  // Plain boxes, like the refs React passed down: StatusBar installs its own
  // sampler, ControlsBar reads the element it screenshots. Neither is state.
  const latencyCallbackRef = { current: null };
  const videoRef = { current: null };

  let switchTimer = null;
  let connectStartedAt = null;
  let firstFrameMeasured = false;

  // hooks/window useIsLandscape: iOS reports orientation reliably only through
  // the Screen Orientation API, everywhere else the media query is enough.
  const landscapeQuery = new MediaQuery('orientation: landscape');
  let iosLandscape = $state(null);

  const isLandscape = $derived(iosLandscape ?? Boolean(landscapeQuery.current));
  const connected = $derived(connectionState === 'connected');
  // Resolved beside the page rather than ahead of it; until athena answers this
  // is whatever the device list already said.
  let resolvedDevice = $state(null);
  $effect(() => {
    resolvedDevice = data.device;
    const pending = data.notCar;
    pending?.then((d) => { if (d) resolvedDevice = d; }).catch(() => {});
  });

  const notCar = $derived(Boolean((resolvedDevice ?? data.device)?.rpc?.not_car));
  const deviceName = $derived(data.device
    ? deviceNamePretty(data.device)
    : (isLandscape ? 'Body' : 'Body Teleop'));

  $effect(() => {
    const orientation = isIos() ? window.screen?.orientation : null;
    if (!orientation) {
      iosLandscape = null;
      return undefined;
    }
    const handler = () => { iosLandscape = Boolean(orientation.type?.startsWith('landscape')); };
    handler();
    orientation.addEventListener('change', handler);
    return () => orientation.removeEventListener('change', handler);
  });

  $effect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  });

  function resetConnectionTiming() {
    connectionTotalMs = null;
    connectStartedAt = performance.now();
    firstFrameMeasured = false;
  }

  // The manager holds one prewarmed connection for the whole app — DeviceInfo
  // starts it from the dashboard. Acquiring subscribes to it and turns video
  // and the joystick on; releasing hands it back still warm.
  $effect(() => {
    const dongleId = data.dongleId;
    const callbacks = {
      onConnectionState: (state, reason) => {
        connection = webrtcConnectionManager.connection;
        connectionState = state;
        if (state === 'connecting') {
          error = null;
        } else if (state === 'failed') {
          error = error || reason || 'Could not reach device. Is the ignition on?';
        } else if (state === 'disconnected' && reason) {
          error = reason;
        }
      },
      onBatteryLevel: (level) => { battery = level; },
      onIgnition: (ignition) => { started = ignition; },
      onVideoTrack: (_cameraName, track) => {
        stream = track;
        if (videoRef.current) videoRef.current.srcObject = track;
      },
      onLatencyUpdate: (latency) => { latencyCallbackRef.current?.(latency); },
    };

    // acquire replays the current state synchronously, so keep the whole call
    // untracked: the handler above reads `error`, which would otherwise make
    // this effect re-subscribe on every failure.
    untrack(() => {
      resetConnectionTiming();
      connection = webrtcConnectionManager.acquire(dongleId, callbacks);
    });

    return () => webrtcConnectionManager.release(callbacks);
  });

  // Video owns the element and never remounts; the page still needs it to
  // attach an incoming track and to give ControlsBar a frame to capture.
  $effect(() => {
    const el = containerEl?.querySelector('video') ?? null;
    videoRef.current = el;
    if (el && stream) el.srcObject = stream;
  });

  $effect(() => () => {
    if (switchTimer) clearTimeout(switchTimer);
    switchTimer = null;
  });

  function handleConnect() {
    error = null;
    activeCamera = 'wideRoad';
    resetConnectionTiming();
    connection = webrtcConnectionManager.reconnect(data.dongleId);
  }

  function handleClose() {
    // Cars aren't prewarmed, tear down connection
    if (!data.device?.rpc?.not_car) {
      webrtcConnectionManager.disconnect();
    }
    goto(`/${data.dongleId}`);
  }

  function switchCamera(cameraName) {
    if (cameraName === activeCamera) return;
    activeCamera = cameraName;
    if (switchTimer) clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      switchTimer = null;
      connection?.switchCamera(cameraName);
    }, 200);
  }

  function handleQualityChange(nextQuality) {
    connection?.setQuality(nextQuality);
  }

  function handleToggleVideo() {
    videoEnabled = !videoEnabled;
    webrtcConnectionManager.setVideoEnabled(videoEnabled);
  }

  function handleFirstFrame() {
    if (connectStartedAt == null || firstFrameMeasured) return;
    firstFrameMeasured = true;
    connectionTotalMs = performance.now() - connectStartedAt;
  }
</script>

<div class="fixed top-0 left-0 w-screen h-full z-[1300] bg-[#030404]">
  <!-- React inherited line-height 1.5 from preflight on html; the body shim
       would shorten every line box in here by a pixel. -->
  <div role="main"
    bind:this={containerEl}
    class="absolute inset-0 bg-[#030404] flex flex-col touch-none
      overflow-hidden select-none [-webkit-touch-callout:none] [-webkit-text-size-adjust:none]
      mt-safe-top mb-safe-bottom ml-safe-left mr-safe-right"
    style="line-height: 1.5"
  >
    <div
      class={isLandscape
        ? 'absolute left-2 top-2 z-20 flex items-center gap-1'
        : 'flex items-center px-3 py-2 bg-[#1D2225] border-b border-white/10 min-h-[64px] z-10'}
    >
      <button
        class={isLandscape
          ? 'flex items-center rounded-full hover:text-white/90 text-white/60 p-2 w-10 h-10 bg-glass cursor-pointer'
          : 'text-white p-2 cursor-pointer'}
        onclick={handleClose}
        aria-label="back"
      >
        <!-- ArrowBackBold -->
        <svg
          viewBox="0 -960 960 960"
          fill="currentColor"
          width="1em"
          height="1em"
          style="font-size:20px"
          class="inline-block shrink-0 select-none"
          aria-hidden="true"
        >
          <path d="M480-149 149-480l331-331 67 66-217 218h481v94H330l217 217-67 67Z" />
        </svg>
      </button>
      <div
        class={isLandscape
          ? 'rounded-[20px] px-3.5 h-10 flex items-center text-base font-medium text-white glass bg-black/30'
          : 'text-base font-medium ml-2 flex-1'}
      >
        {deviceName}
      </div>
    </div>

    {#if connected}
      <div class="relative">
        <StatusBar
          {connection}
          device={data.device}
          {connectionState}
          failReason={error}
          {battery}
          {isLandscape}
          {latencyCallbackRef}
          class={isLandscape
            ? 'absolute top-3 right-3 z-30 flex items-center gap-2'
            : 'relative z-30 flex items-center justify-end p-2 gap-2'}
          onqualitychange={handleQualityChange}
        />
      </div>
    {/if}

    <Video
      {connection}
      {videoEnabled}
      class={isLandscape ? 'h-full' : started ? 'aspect-[16/9]' : 'flex-1'}
      {connectionState}
      {error}
      {connectionTotalMs}
      {started}
      {videoRef}
      onconnect={handleConnect}
      onfirstframe={handleFirstFrame}
    />

    {#if connected && notCar && !started}
      <div class="absolute w-full bottom-36 2xl:bottom-12 pointer-events-none text-center select-none">
        <span class="text-sm md:text-base text-white/70">Turn on comma body ignition to remote control</span>
      </div>
    {/if}

    {#if connected}
      <ControlsBar
        {connection}
        {videoEnabled}
        onclose={handleClose}
        ontogglevideo={handleToggleVideo}
        {activeCamera}
        {gamepadConnected}
        {videoRef}
        {isLandscape}
        controlsDisabled={inputActive}
        onswitchcamera={switchCamera}
      />

      {#if started}
        <div
          class={isLandscape
            ? 'absolute bottom-4 right-4 z-10 w-[160px] h-[160px]'
            : 'flex-1 flex items-center justify-center px-4 pb-12 pt-2 min-h-0 overflow-hidden'}
        >
          <Joystick
            {connection}
            enabled={started}
            class={isLandscape
              ? 'relative w-full h-full'
              : 'relative w-auto h-full aspect-square max-w-full'}
            {activeCamera}
            {gamepadConnected}
            ongamepadchange={(value) => { gamepadConnected = value; }}
            oninputactivechange={(value) => { inputActive = value; }}
            onswitchcamera={switchCamera}
          />
        </div>
      {/if}
    {/if}
  </div>
</div>
