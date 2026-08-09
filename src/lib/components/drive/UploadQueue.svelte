<script>
  import { untrack } from 'svelte';
  import { innerHeight, innerWidth } from 'svelte/reactivity/window';

  import {
    FILE_NAMES,
    cancelFetchUploadQueue,
    cancelUploads,
    fetchUploadQueue,
    getUploadQueue,
    getUploadQueueMeta,
    withDeviceStatus,
  } from '$lib/state/files.svelte.js';
  import { deviceIsOnline, deviceOnCellular, deviceVersionAtLeast } from '$lib/utils';

  let {
    open = false,
    update = false,
    device,
    // redux read this off `state.dongleId`, the device the app is looking at
    currentDongleId = null,
    onclose,
  } = $props();

  let cancelQueue = $state([]);

  const windowWidth = $derived(innerWidth.current ?? 1280);
  const windowHeight = $derived(innerHeight.current ?? 800);

  // the athena calls behind the queue are what learn the ping and metered flags
  const liveDevice = $derived(withDeviceStatus(device));
  const filesUploading = $derived(getUploadQueue());
  const filesUploadingMeta = $derived(getUploadQueueMeta());

  function setPolling(enable) {
    if (enable) {
      fetchUploadQueue(device, currentDongleId);
    } else {
      cancelFetchUploadQueue();
    }
  }

  let prevUpdate;
  let prevDongleId;
  let prevUploading;

  // componentDidUpdate, seeded by a componentDidMount that called it with no prevProps.
  $effect(() => {
    const nextUpdate = update;
    const nextDongleId = device?.dongle_id;
    const nextUploading = filesUploading;

    untrack(() => {
      if (prevUpdate !== nextUpdate) {
        setPolling(nextUpdate);
      } else if (nextUpdate && prevDongleId !== nextDongleId) {
        setPolling(true);
      } else if (nextUpdate && prevUploading !== nextUploading) {
        setPolling(Boolean(Object.keys(nextUploading).length));
      }
      prevUpdate = nextUpdate;
      prevDongleId = nextDongleId;
      prevUploading = nextUploading;
    });
  });

  $effect(() => () => cancelFetchUploadQueue());

  function cancelUploading(only) {
    const uploading = filesUploading;
    const ids = (only ?? Object.keys(uploading)).filter((id) => uploading[id] && !uploading[id].current);
    cancelQueue = cancelQueue.concat(ids);

    if (deviceVersionAtLeast(device, '0.8.13')) {
      cancelUploads(device.dongle_id, ids);
    } else {
      ids.forEach((id) => cancelUploads(device.dongle_id, id));
    }

    setPolling(true);
  }

  const deviceOffline = $derived(!deviceIsOnline(liveDevice));
  const hasData = $derived(filesUploadingMeta.dongleId === device?.dongle_id);
  const hasUploading = $derived(!deviceOffline && hasData && Object.keys(filesUploading).length > 0);
  const logNameLength = $derived(windowWidth < 600 ? 4 : 64);
  const segmentNameStyle = $derived(windowWidth < 450 ? `font-size: ${windowWidth < 400 ? '0.8rem' : '0.9rem'}` : '');
  const cellStyle = $derived(`padding: 0 ${windowWidth < 400 ? '2px' : (windowWidth < 450 ? '4px' : '8px')}`);
  const containerStyle = $derived(`max-height: ${(windowHeight * 0.90) - 98}px`);

  const uploadSorted = $derived.by(() => {
    const sorted = Object.entries(filesUploading);
    if (sorted.length && sorted[sorted.length - 1][1].current) {
      const curr = sorted.splice(sorted.length - 1, 1);
      sorted.unshift(curr[0]);
    }
    return sorted;
  });

  // `upload` is the [id, upload] entry, so `.paused` is never set and this is only
  // true for an empty queue -- which hasUploading already rules out.
  const allPaused = $derived(uploadSorted.every((upload) => upload.paused));

  function scrollbarSize() {
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:-9999px;width:50px;height:50px;overflow:scroll';
    document.body.appendChild(div);
    const size = div.offsetWidth - div.clientWidth;
    div.remove();
    return size;
  }

  /**
   * MUI's ModalManager blocks scroll for the first modal only, so this stays a no-op
   * when the queue opens on top of the device settings modal.
   */
  $effect(() => {
    if (!open) return;

    const { body } = document;
    if (body.style.overflow === 'hidden') return;

    const prevPaddingRight = body.style.paddingRight;
    if (body.clientWidth < window.innerWidth) {
      const padding = parseInt(window.getComputedStyle(body).paddingRight, 10) || 0;
      body.style.paddingRight = `${padding + scrollbarSize()}px`;
    }
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = '';
      body.style.paddingRight = prevPaddingRight;
    };
  });

  // styles.modal, on a MUI Paper whose background the theme overrides to #30373B.
  const paperClass = 'absolute top-1/2 left-1/2 w-max max-w-[90%] rounded-[4px] bg-[#30373B] p-4 outline-none '
    + 'shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)]';
  // MUI Button root; theme.MuiButton overrides text-transform to none.
  const buttonBase = 'box-border inline-flex min-h-[36px] min-w-[64px] cursor-pointer items-center justify-center '
    + 'rounded-[4px] px-4 py-2 align-middle text-[0.875rem] leading-[1.4em] font-medium transition-colors';
  // variant="contained" carries theme.shadows[2]; styles.cancelButton repaints it grey200/grey400.
  // The disabled rules outrank it: they are .contained$disabled, one class more specific.
  const cancelButton = `${buttonBase} ml-2 bg-[#5c696f] text-white hover:bg-[#4b5559] `
    + 'shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)] '
    + 'disabled:pointer-events-none disabled:cursor-default disabled:bg-white/12 disabled:text-white/30 disabled:shadow-none';
  // styles.uploadCell
  const cellClass = 'h-[25px]';

  // @material-ui/icons
  const HIGHLIGHT_OFF_PATH = 'M14.59 8L12 10.59 9.41 8 8 9.41 10.59 12 8 14.59 9.41 16 12 13.41 14.59 16 16 14.59 13.41 12 16 9.41 14.59 8zM12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z';
  const WARNING_PATH = 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z';
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onclose?.(); }} />

<!--
  MUI CircularProgress, indeterminate. The rotate/dash animations are what the gallery
  freezes, so the captured frame is this static geometry: r = (44 - thickness) / 2.
-->
{#snippet circularProgress(size, rootStyle)}
  <div class="progress inline-block" role="progressbar" style="width: {size}px; height: {size}px; line-height: 1; {rootStyle}">
    <svg viewBox="22 22 44 44">
      <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
    </svg>
  </div>
{/snippet}

{#if open && device}
  <div class="fixed inset-0 z-[1300]" role="dialog" aria-modal="true" aria-labelledby="upload-queue-modal">
    <div
      class="fixed inset-0 bg-black/50"
      role="presentation"
      onclick={() => onclose?.()}
      onkeydown={(e) => e.key === 'Escape' && onclose?.()}
    ></div>

    <div role="document" class={paperClass} style="transform: translate(-50%, -50%); line-height: 1.5">
      <!-- styles.titleContainer -->
      <div class="mb-[5px] flex items-baseline justify-between">
        <!-- MUI Typography variant="title" -->
        <h2 class="text-[1.3125rem] font-medium text-white" style="line-height: 1.16667em">Upload queue</h2>
        <!-- MUI Typography variant="caption", palette.text.secondary -->
        <span class="ml-2 block text-[0.75rem] text-white/70" style="line-height: 1.375em">{device.dongle_id}</span>
      </div>
      <!-- MUI Divider -->
      <hr class="m-0 h-px shrink-0 border-none bg-white/12" />

      <!-- styles.uploadContainer -->
      <div class="my-2 overflow-y-auto text-left text-white/90" style={containerStyle}>
        {#if hasUploading}
          {#if deviceOnCellular(liveDevice) && allPaused}
            <!-- styles.cellularWarning -->
            <div class="mb-2 flex flex-col rounded-[4px] bg-[#424a4f] px-4 py-3">
              <div class="mb-[2px] flex items-center">
                <svg viewBox="0 0 24 24" fill="currentColor" class="shrink-0 select-none" style="font-size: 24px; width: 1em; height: 1em; margin-right: 8px" aria-hidden="true">
                  <path d={WARNING_PATH} />
                </svg>
                Connect to WiFi
              </div>
              <span style="font-size: 0.8rem">uploading paused on cellular connection</span>
            </div>
          {/if}
          <table class="border-collapse">
            <thead>
              <tr>
                <th class={cellClass} style={cellStyle}>segment</th>
                <th class={cellClass} style={cellStyle}>type</th>
                <th class={cellClass} style={cellStyle}>progress</th>
                {#if windowWidth >= 600}<th class={cellClass} style={cellStyle}></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each uploadSorted as [id, upload] (id)}
                {@const isCancelled = cancelQueue.includes(id)}
                {@const [seg, type] = upload.fileName.split('/')}
                {@const segString = seg.split('|')[1]}
                <tr>
                  <td class={cellClass} style={cellStyle}>
                    <!-- styles.segmentName: two nowrap halves so the date can wrap to a new line -->
                    <div class="flex flex-wrap" style={segmentNameStyle}>
                      <span class="whitespace-nowrap">{segString.substring(0, 12)}</span>
                      <span class="whitespace-nowrap">{segString.substring(12)}</span>
                    </div>
                  </td>
                  <td class={cellClass} style={cellStyle}>{FILE_NAMES[type][0].split('.')[0].substring(0, logNameLength)}</td>
                  {#if upload.current}
                    <td class={cellClass} style={cellStyle}>
                      <!-- styles.uploadProgress, wrapping a MUI LinearProgress variant="determinate" -->
                      <div class="flex items-center justify-center text-[0.8rem]">
                        <div
                          class="relative overflow-hidden"
                          role="progressbar"
                          aria-valuenow={Math.round(upload.progress * 100)}
                          style="width: 80%; height: 8px; margin-right: 6px; background-color: rgba(255, 255, 255, 0.3)"
                        >
                          <div
                            class="absolute top-0 bottom-0 left-0 w-full"
                            style="transform-origin: left; background-color: rgba(255, 255, 255, 0.8); will-change: transform; transition: transform 0.5s linear; transform: scaleX({upload.progress})"
                          ></div>
                        </div>
                      </div>
                    </td>
                  {:else}
                    {#if windowWidth >= 600}
                      <td class={cellClass} style={cellStyle}>{upload.paused ? 'paused' : 'pending'}</td>
                    {/if}
                    <!-- styles.cancelCell -->
                    <td class="{cellClass} text-center" style={cellStyle}>
                      {#if isCancelled}
                        {@render circularProgress(15, 'color: #fff; margin: 1.5px')}
                      {:else}
                        <button
                          type="button"
                          aria-label="cancel upload"
                          class="inline-flex cursor-pointer items-center justify-center rounded-[13px] p-0 align-middle text-[0.875rem] leading-[1.4em] font-semibold text-white outline-none hover:bg-transparent"
                          onclick={() => cancelUploading([id])}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" class="shrink-0 select-none" style="font-size: 18px; width: 1em; height: 1em" aria-hidden="true">
                            <path d={HIGHLIGHT_OFF_PATH} />
                          </svg>
                        </button>
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        {:else if deviceOffline}
          <p>device offline</p>
        {:else if hasData}
          <p>no uploads</p>
        {:else}
          {@render circularProgress(17, 'color: #fff; margin: 8px')}
        {/if}
      </div>

      <!-- styles.buttonGroup -->
      <div class="text-right"><button type="button" class={cancelButton} disabled={!hasUploading} onclick={() => cancelUploading()}>Cancel All</button><button type="button" class={cancelButton} onclick={() => onclose?.()}>Close</button></div>
    </div>
  </div>
{/if}

<style>
  .progress {
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
