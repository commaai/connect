<script>
  import { webrtcConnectionManager } from '$lib/utils/webrtc';

  const CONNECTION_TIME_VISIBLE_MS = 1500;
  const MAX_SCALE = 4;

  let {
    connection = null,
    class: className = '',
    connectionState = null,
    error = null,
    connectionTotalMs = null,
    started = false,
    // Plain `{ current }` box, like React's videoRef: the page attaches an
    // incoming track to the element this component owns.
    videoRef = null,
    onconnect,
    onfirstframe,
  } = $props();

  let container = $state(null);
  let videoEl = $state(null);
  let showConnectionTime = $state(false);

  const state = $derived(connectionState ?? connection?.connectionState ?? 'none');
  const connected = $derived(state === 'connected');
  const connecting = $derived(state === 'connecting');
  const canRetry = $derived(state === 'failed' || state === 'disconnected');
  const retryLabel = $derived(state === 'disconnected' ? 'Reconnect' : 'Retry');
  const errorText = $derived(error ?? connection?.failReason ?? null);
  const connectionTimeLabel = $derived(
    connectionTotalMs == null ? null : `${Math.round(connectionTotalMs)} ms`,
  );

  $effect(() => {
    if (state !== 'connected') showConnectionTime = false;
  });

  $effect(() => {
    if (connectionTimeLabel == null) {
      showConnectionTime = false;
      return undefined;
    }
    showConnectionTime = true;
    const timer = setTimeout(() => { showConnectionTime = false; }, CONNECTION_TIME_VISIBLE_MS);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (videoRef) videoRef.current = videoEl;
    // The track reaches the page through the manager's callbacks; picking up
    // the cached stream covers a mount that missed the event.
    const cached = webrtcConnectionManager.stream;
    if (videoEl && cached && !videoEl.srcObject) videoEl.srcObject = cached;
  });



  // usePinchZoom: the container takes the touches (touch-action: none) and the
  // transform lands on the video. Disabled once ignition is on so it doesn't
  // fight the joystick.
  const zoom = { scale: 1, tx: 0, ty: 0, lastDist: 0, lastMid: null };
  const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midpoint = (a, b, rect) => ({
    x: (a.clientX + b.clientX) / 2 - rect.left,
    y: (a.clientY + b.clientY) / 2 - rect.top,
  });

  $effect(() => {
    const el = container;
    const content = videoEl;
    const enabled = !started;
    if (!el) return undefined;

    // When disabled, make sure the video isn't left stuck mid-zoom.
    if (!enabled) {
      if (content) {
        Object.assign(zoom, { scale: 1, tx: 0, ty: 0, lastDist: 0, lastMid: null });
        content.style.transition = 'transform 0.2s ease-out';
        content.style.transform = 'translate(0px, 0px) scale(1)';
      }
      return undefined;
    }

    const apply = () => {
      if (!content) return;
      content.style.transformOrigin = '0 0';
      content.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
    };

    const onMove = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dist = distance(e.touches[0], e.touches[1]);
      const mid = midpoint(e.touches[0], e.touches[1], rect);

      if (!zoom.lastMid) {
        zoom.lastDist = dist;
        zoom.lastMid = mid;
        if (content) content.style.transition = 'none';
        return;
      }

      const newScale = Math.min(MAX_SCALE, Math.max(1, zoom.scale * (dist / zoom.lastDist)));
      zoom.tx = mid.x - (mid.x - zoom.tx) * (newScale / zoom.scale);
      zoom.ty = mid.y - (mid.y - zoom.ty) * (newScale / zoom.scale);
      zoom.tx += mid.x - zoom.lastMid.x;
      zoom.ty += mid.y - zoom.lastMid.y;
      zoom.scale = newScale;
      zoom.lastDist = dist;
      zoom.lastMid = mid;
      apply();
    };

    const onEnd = (e) => {
      if (e.touches.length >= 2) return;
      Object.assign(zoom, { lastDist: 0, lastMid: null, scale: 1, tx: 0, ty: 0 });
      if (content) content.style.transition = 'transform 0.2s ease-out';
      apply();
    };

    // Bound natively with `{ passive: false }`, otherwise preventDefault is
    // ignored on touchmove.
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  });
</script>

<div bind:this={container} class="relative w-full {className} bg-black overflow-hidden" style="touch-action: none">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoEl}
    autoplay
    playsinline
    muted
    onplaying={() => onfirstframe?.()}
    class="w-full h-full pointer-events-none object-contain"
  ></video>
  {#if connected && connectionTimeLabel}
    <div
      class="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 select-none rounded bg-black/50 px-2 py-0.5 text-sm leading-4 text-ink/70 pointer-events-none transition-opacity duration-500 ease-out {showConnectionTime ? 'opacity-100' : 'opacity-0'}"
    >{`connected in ${connectionTimeLabel}`}</div>
  {/if}
  {#if !connected}
    <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div class="flex flex-col items-center gap-3 pointer-events-auto">
        {#if connecting}
          <!-- MUI v1 CircularProgress, size 40, thickness 4 -->
          <div
            class="progress-root"
            style="width: 40px; height: 40px; color: rgb(var(--c-ink-rgb) / 0.7)"
            role="progressbar"
          >
            <svg viewBox="22 22 44 44">
              <circle class="progress-circle" cx="44" cy="44" r="20" fill="none" stroke-width="4" />
            </svg>
          </div>
          <span class="text-xs text-ink/50">Connecting...</span>
        {:else if canRetry}
          <!-- MUI v1 Button. Its label span is what keeps the icon and the text
               unspaced: the root's gap only ever sees that one child. The rest
               of the root's metrics are inline, the way MUI's class was — the
               tailwind utilities here are !important and outrank both. -->
          <button
            type="button"
            onclick={onconnect}
            class="flex items-center gap-2 rounded-3xl px-6 py-2.5 text-white text-sm font-medium normal-case bg-red-600/60 hover:bg-red-600/70 cursor-pointer"
            style="position: relative; justify-content: center; min-width: 64px; min-height: 36px; vertical-align: middle; user-select: none; text-decoration: none; outline: none; appearance: none; -webkit-tap-highlight-color: transparent"
          >
            <span style="display: inherit; width: 100%; align-items: inherit; justify-content: inherit"><svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="1em"
                height="1em"
                style="font-size: 20px; display: inline-block; flex-shrink: 0"
                aria-hidden="true"
                focusable="false"
              ><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>{retryLabel}</span>
          </button>
        {/if}
        {#if errorText}
          <div class="max-w-[280px] md:max-w-[450px] rounded-lg px-3 py-1.5 text-center text-xs text-[#fca5a5] !bg-[rgba(220,38,38,0.4)] !select-text">{errorText}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .progress-root {
    display: inline-block;
    line-height: 1;
    animation: mui-progress-circular-rotate 1.4s linear infinite;
  }

  .progress-circle {
    stroke: currentColor;
    /* Some default value that looks fine waiting for the animation to kick in. */
    stroke-dasharray: 80px, 200px;
    stroke-dashoffset: 0px;
    animation: mui-progress-circular-dash 1.4s ease-in-out infinite;
  }

  @keyframes mui-progress-circular-rotate {
    100% { transform: rotate(360deg); }
  }

  @keyframes mui-progress-circular-dash {
    0% { stroke-dasharray: 1px, 200px; stroke-dashoffset: 0px; }
    50% { stroke-dasharray: 100px, 200px; stroke-dashoffset: -15px; }
    100% { stroke-dasharray: 100px, 200px; stroke-dashoffset: -120px; }
  }
</style>
