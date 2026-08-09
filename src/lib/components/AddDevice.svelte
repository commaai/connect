<script>
  import * as Sentry from '@sentry/browser';

  import { devices as Devices } from '$lib/api';
  import { pairErrorToMessage, verifyPairToken } from '$lib/utils';

  let { buttonText, buttonStyle = '', buttonIcon = false, onpaired, onanalytics } = $props();

  let modalOpen = $state(false);
  let hasCamera = $state(null);
  let cameraError = $state(null);
  let pairLoading = $state(false);
  let pairError = $state(null);
  let pairDongleId = $state(null);
  let videoEl = $state(null);
  let canvasEl = $state(null);

  let detector = null;
  let stream = null;
  let scanning = false;
  let scanFrameId = null;
  let canvasWidth = null;
  let canvasHeight = null;

  /**
   * DeviceList passes the CSS declarations React passed as a style object, which
   * have to stay inline: tailwind is imported with `important`, so a utility
   * class would win over them, where MUI's classes lost.
   */
  const asStyle = $derived(
    buttonStyle && (buttonStyle.includes(';') || /:\s/.test(buttonStyle)) ? buttonStyle : '',
  );
  const asClass = $derived(asStyle ? '' : (buttonStyle ?? ''));
  const scrim = $derived(Boolean(pairLoading || pairDongleId || pairError));

  // MUI's Modal portals to document.body, so the panel never inherits from the
  // trigger's container — NoDeviceUpsell renders the trigger inside `prose`.
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function scrollbarSize() {
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:-9999px;width:50px;height:50px;overflow:scroll';
    document.body.appendChild(div);
    const size = div.offsetWidth - div.clientWidth;
    div.remove();
    return size;
  }

  /**
   * MUI's Modal locks the body while it is open and pads it by the scrollbar
   * width, so the page behind does not jump when the scrollbar disappears.
   */
  $effect(() => {
    if (!modalOpen) return;

    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    if (body.clientWidth < window.innerWidth) {
      const padding = parseInt(window.getComputedStyle(body).paddingRight, 10) || 0;
      body.style.paddingRight = `${padding + scrollbarSize()}px`;
    }
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  });

  // componentDidMount: whether a camera exists decides which branch renders.
  $effect(() => {
    (async () => {
      try {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        hasCamera = mediaDevices.some((d) => d.kind === 'videoinput');
      } catch {
        hasCamera = false;
      }
    })();
  });

  $effect(() => () => {
    stopScanning();
    stopStream();
  });

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function getUserMediaError(err) {
    if (err.name === 'NotAllowedError') {
      return 'Camera access denied. Please allow camera access in your browser settings and try again.';
    }
    if (err.name === 'NotFoundError') {
      return 'No camera found on this device.';
    }
    if (err.name === 'NotReadableError') {
      return 'Camera is in use by another application.';
    }
    return 'Unable to access camera.';
  }

  async function startCamera(video) {
    try {
      // zxing is ~51KB and only the scanner needs it; keep it off the first load.
      const { BarcodeDetector } = await import('barcode-detector/ponyfill');
      detector = new BarcodeDetector({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      drawCorners();
      startScanning();
    } catch (err) {
      hasCamera = false;
      cameraError = getUserMediaError(err);
    }
  }

  $effect(() => {
    if (!modalOpen || !videoEl || !hasCamera || pairDongleId || detector) return;
    startCamera(videoEl);
  });

  function drawCorners() {
    if (!canvasEl || !videoEl?.srcObject) return;

    const { width, height } = canvasEl.getBoundingClientRect();
    if (canvasWidth === width && canvasHeight === height) return;
    canvasWidth = width;
    canvasHeight = height;

    const size = Math.min(width, height);
    const x = (width - size) / 2 + (size / 6);
    const y = (height - size) / 2 + (size / 6);
    const rect = size * (2 / 3);
    const stroke = size / 6;

    canvasEl.width = width;
    canvasEl.height = height;

    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'white';

    ctx.beginPath();
    ctx.moveTo(x, y + stroke);
    ctx.lineTo(x, y);
    ctx.lineTo(x + stroke, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + rect - stroke, y);
    ctx.lineTo(x + rect, y);
    ctx.lineTo(x + rect, y + stroke);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + rect, y + rect - stroke);
    ctx.lineTo(x + rect, y + rect);
    ctx.lineTo(x + rect - stroke, y + rect);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + stroke, y + rect);
    ctx.lineTo(x, y + rect);
    ctx.lineTo(x, y + rect - stroke);
    ctx.stroke();
  }

  async function scanFrame() {
    if (!scanning || !videoEl || !detector) return;

    try {
      const results = await detector.detect(videoEl);
      if (results.length > 0) {
        onQrRead(results[0].rawValue);
        return;
      }
    } catch {
      // Detection errors are transient, keep scanning.
    }

    scanFrameId = requestAnimationFrame(scanFrame);
  }

  function startScanning() {
    if (scanning) return;
    scanning = true;
    scanFrame();
  }

  function stopScanning() {
    scanning = false;
    if (scanFrameId) {
      cancelAnimationFrame(scanFrameId);
      scanFrameId = null;
    }
  }

  async function onQrRead(result) {
    if (pairLoading || pairError || pairDongleId || !result) {
      return;
    }

    Sentry.captureMessage('qr scanned', { extra: { result } });
    const fromUrl = result.startsWith('https://');
    let pairToken;
    if (fromUrl) {
      try {
        pairToken = new URL(result).searchParams.get('pair');
        if (!pairToken) {
          throw new Error('empty pairToken from url qr code');
        }
      } catch (err) {
        pairLoading = false;
        pairDongleId = null;
        pairError = 'Error: could not parse pair token from detected url';
        console.error(err);
        return;
      }
    } else {
      try {
        [, , pairToken] = result.split('--');
        if (!pairToken) {
          throw new Error('empty pairToken from qr code');
        }
      } catch (err) {
        pairLoading = false;
        pairDongleId = null;
        pairError = 'Error: invalid QR code detected';
        console.error(err);
        return;
      }
    }

    videoEl?.pause();
    stopScanning();
    pairLoading = true;
    pairDongleId = null;
    pairError = null;

    try {
      verifyPairToken(pairToken, fromUrl, 'adddevice_verify_pairtoken');
    } catch (err) {
      pairLoading = false;
      pairDongleId = null;
      pairError = `Error: ${err.message}`;
      return;
    }

    try {
      const resp = await Devices.pilotPair(pairToken);
      if (resp.dongle_id) {
        pairLoading = false;
        pairDongleId = resp.dongle_id;
        pairError = null;
        onanalytics?.('pair_device', { method: 'add_device_sidebar' });
      } else {
        pairLoading = false;
        pairDongleId = null;
        pairError = 'Error: could not pair';
        Sentry.captureMessage('qr scan failed', { extra: { resp } });
      }
    } catch (err) {
      const msg = pairErrorToMessage(err, 'adddevice_pair_qr');
      pairLoading = false;
      pairDongleId = null;
      pairError = `Error: ${msg}`;
    }
  }

  function restart() {
    pairLoading = false;
    pairError = null;
    pairDongleId = null;
    videoEl?.play();
    startScanning();
  }

  function modalClose() {
    const dongleId = pairDongleId;

    stopScanning();
    stopStream();
    detector = null;

    modalOpen = false;
    pairLoading = false;
    pairError = null;
    pairDongleId = null;

    // Selecting the new device, refreshing the list, and the reload that the
    // first pair of an account needs, are all the parent's calls to make.
    if (dongleId) onpaired?.(dongleId);
  }
</script>

<svelte:window
  onresize={drawCorners}
  onkeydown={(e) => { if (modalOpen && e.key === 'Escape') modalClose(); }}
/>

<!-- MUI Button, variant="text", with styles.addButton -->
<button type="button" class="muiButton addButton {asClass}" style={asStyle} onclick={() => { modalOpen = true; }}>
  <span class="label">{buttonText}{#if buttonIcon}<!-- @material-ui/icons/AddCircleOutline at Colors.white30 --><svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px; color: rgba(255, 255, 255, 0.3)" class="shrink-0" aria-hidden="true"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>{/if}</span>
</button>

{#if modalOpen}
  <div
    use:portal
    class="fixed inset-0 z-[1300]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-device-modal"
  >
    <!-- MUI Backdrop: z-index -1 inside the modal's stacking context -->
    <div
      class="fixed inset-0 z-[-1] bg-black/50"
      role="presentation"
      onclick={modalClose}
      onkeydown={(e) => e.key === 'Escape' && modalClose()}
    ></div>

    <!-- MUI Paper, backgroundColor overridden to #30373B by the theme -->
    <div
      role="document"
      tabindex="-1"
      style="line-height: 1.5"
      class="absolute top-1/2 left-1/2 w-[400px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-[#30373B] p-4 outline-none
             shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)]"
    >
      <div class="mb-[5px] flex items-baseline justify-between">
        <!-- MUI Typography variant="title": lineHeight 24.5/21 -->
        <h2 class="text-[1.3125rem] font-medium" style="line-height: 1.16667em">Pair device</h2>
        <!-- MUI Typography variant="caption": 12px, lineHeight 16.5/12, palette.text.secondary -->
        <span class="block text-[0.75rem] text-white/70" style="line-height: 1.375em">scan QR code</span>
      </div>

      <!-- MUI Divider, with styles.divider -->
      <div class="mb-[10px] h-px bg-white/12"></div>

      {#if hasCamera === false}
        <!-- MUI Typography body1: 0.875rem, not the browser's 16px default -->
        <p class="mb-[5px] text-[0.875rem]" style="line-height: 1.46429em">{cameraError || 'Camera not found, please enable camera access.'}</p>
        <!-- React's <br>: an empty line box sized by the panel's inherited 1.5 -->
        <br />
        <p class="text-[0.875rem]" style="line-height: 1.46429em">You can also scan the QR code using any other QR code reader application.</p>
      {:else}
        <div class="videoContainer {scrim ? 'videoScrim' : ''}">
          <canvas class="qrCanvas" bind:this={canvasEl}></canvas>
          <div class="videoOverlay">
            {#if pairLoading}
              <!-- MUI CircularProgress size="10vw" -->
              <div class="progress" role="progressbar" style="width: 10vw; height: 10vw; color: #525E66">
                <svg viewBox="22 22 44 44">
                  <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
                </svg>
              </div>
            {/if}
            {#if pairError}
              <p>{pairError}</p>
              <button type="button" class="muiButton retryButton" onclick={restart}>
                <span class="label">try again</span>
              </button>
            {/if}
            {#if pairDongleId}
              <p>Successfully paired device <span class="font-bold">{pairDongleId}</span></p>
              <button type="button" class="muiButton retryButton" onclick={modalClose}>
                <span class="label">close</span>
              </button>
            {/if}
          </div>
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={videoEl} onloadedmetadata={drawCorners}></video>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /**
   * MUI ButtonBase root + Button root (the theme drops text-transform) +
   * styles.addButton, as plain CSS: tailwind is imported with `important`, so a
   * utility class would beat the caller's inline buttonStyle, which MUI let win.
   */
  .muiButton {
    position: relative;
    box-sizing: border-box;
    display: inline-flex;
    min-width: 64px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border: 0;
    margin: 0;
    border-radius: 18px;
    background: #fff;
    color: #1e2224;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4em;
    text-decoration: none;
    text-transform: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      border 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .muiButton:hover {
    background-color: rgba(255, 255, 255, 0.7);
    color: #1e2224;
  }

  .addButton {
    width: 100%;
  }

  .retryButton {
    margin-top: 10px;
  }

  /* MUI Button's label span */
  .label {
    width: 100%;
    display: inherit;
    align-items: inherit;
    justify-content: inherit;
  }

  .videoContainer {
    position: relative;
    margin: 0 auto;
  }

  .videoContainer video {
    display: block;
    width: 100%;
    max-width: 100%;
  }

  .videoScrim::before {
    content: '';
    position: absolute;
    background-color: rgba(0, 0, 0, 0.8);
    top: -1px;
    bottom: -1px;
    right: -1px;
    left: -1px;
    z-index: 3;
  }

  .qrCanvas {
    position: absolute;
    z-index: 2;
    width: 100%;
    height: 100%;
  }

  .videoOverlay {
    position: absolute;
    z-index: 4;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
  }

  /* MUI Typography body1, overridden by styles.videoOverlay */
  .videoOverlay p {
    margin: 0;
    font-size: 1rem;
  }

  .progress {
    display: inline-block;
    line-height: 1;
    animation: circular-rotate 1.4s linear infinite;
  }

  .progressCircle {
    stroke: currentColor;
    stroke-dasharray: 80px, 200px;
    stroke-dashoffset: 0px;
    animation: circular-dash 1.4s ease-in-out infinite;
  }

  @keyframes circular-rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes circular-dash {
    0% {
      stroke-dasharray: 1px, 200px;
      stroke-dashoffset: 0px;
    }
    50% {
      stroke-dasharray: 100px, 200px;
      stroke-dashoffset: -15px;
    }
    100% {
      stroke-dasharray: 100px, 200px;
      stroke-dashoffset: -120px;
    }
  }
</style>
