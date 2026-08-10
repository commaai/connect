<script>
  import { untrack } from 'svelte';

  import { clipDevice } from '$lib/api/clips';
  import InfoTooltip from '$lib/components/InfoTooltip.svelte';
  import { lockBodyScroll } from '$lib/utils/scroll-lock';

  let {
    open = false,
    anchorEl = null,
    dongleId,
    route = null,
    routes = null,
    zoom = null,
    deviceOnline = false,
    inventoryOnly = false,
    onclose,
  } = $props();

  const MAX_CLIP_DURATION = 30 * 60;
  const POLL_INTERVAL = 1000;
  const ACTIVE_STATUSES = new Set(['queued', 'encoding']);

  const CAMERAS = [
    ['fcamera.hevc', 'Road'],
    ['ecamera.hevc', 'Wide road'],
    ['dcamera.hevc', 'Driver'],
  ];

  const BITRATES = [
    [5, 'Standard', '5 Mbps'],
    [8, 'High', '8 Mbps'],
    [12, 'Extreme', '12 Mbps'],
  ];

  const SPEEDUPS = [1, 2, 4, 5, 10];

  const CLOSE_BOLD = 'm249-183-66-66 231-231-231-231 66-66 231 231 231-231 66 66-231 231 231 231-66 66-231-231-231 231Z';
  const DOWNLOAD = 'M480-313 287-506l43-43 120 120v-371h60v371l120-120 43 43-193 193ZM220-160q-24 0-42-18t-18-42v-143h60v143h520v-143h60v143q0 24-18 42t-42 18H220Z';
  const PLAY_ARROW = 'M320-203v-560l440 280-440 280Z';
  const TRASH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12Zm2-10h2v8H8V9Zm4 0h2v8h-2V9Zm-7-5v2h14V4h-3.5l-1-1h-5l-1 1H5Z';

  let clips = $state([]);
  let camera = $state('fcamera.hevc');
  let bitrate = $state(5);
  let speedup = $state(1);
  let filename = $state('');
  let cameraRanges = $state(null);
  let loading = $state(false);
  let creating = $state(false);
  let error = $state(null);
  let autoDownloadFilename = $state(null);
  let viewingClip = $state(null);
  let previewingClip = $state(null);
  let previewUrl = $state(null);
  let previewProgress = $state(0);
  let deletingClip = $state(null);
  let deleteDialogOpen = $state(false);
  let deleting = $state(false);

  let paperEl = $state(null);

  let poll = null;
  let mounted = false;
  let previewRequest = 0;

  function formatTime(time) {
    const totalSeconds = Math.max(0, Math.round(time));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours ? `${hours}:` : ''}${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDuration(duration) {
    const totalSeconds = Math.max(0, Math.round(duration));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours && `${hours}h`, minutes && `${minutes}m`, (seconds || (!hours && !minutes)) && `${seconds}s`].filter(Boolean).join(' ');
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
  }

  function normalizeFilename(name) {
    return name.trim().replace(/\.mp4$/i, '');
  }

  function validFilename(name) {
    const normalized = normalizeFilename(name);
    return !name.trim() || /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalized);
  }

  function deviceRouteName(r) {
    return r?.fullname?.split(/[|/]/).pop() || null;
  }

  function defaultFilename(id, r, cam, startTime, endTime, speed) {
    const parts = [
      id,
      deviceRouteName(r),
      Math.round(startTime),
      Math.round(endTime),
      cam.replace(/\.hevc$/i, ''),
    ];
    if (speed > 1) parts.push(`${speed}x`);
    return parts.join('_');
  }

  function cameraCoversRange(ranges, cam, startTime, endTime) {
    return Boolean(ranges?.[cam]?.available_ranges?.some(([start, end]) => start <= startTime && end >= endTime));
  }

  function cameraLabel(value) {
    return CAMERAS.find(([cam]) => cam === value)?.[1] || value;
  }

  const startTime = $derived(zoom ? zoom.start / 1000 : 0);
  const endTime = $derived(zoom ? zoom.end / 1000 : 0);
  const duration = $derived(endTime - startTime);
  const outputDuration = $derived(duration / speedup);
  const estimatedSize = $derived(outputDuration * bitrate * 125000);
  const invalidDuration = $derived(duration <= 0 || duration > MAX_CLIP_DURATION);
  const invalidFilename = $derived(!validFilename(filename));
  const cameraUnavailable = $derived(
    !inventoryOnly && cameraRanges !== null && !cameraCoversRange(cameraRanges, camera, startTime, endTime),
  );
  const cameraAvailable = $derived(
    cameraRanges === null || CAMERAS.some(([value]) => cameraCoversRange(cameraRanges, value, startTime, endTime)),
  );
  const deviceBusy = $derived(clips.some((clip) => ACTIVE_STATUSES.has(clip.status)));

  function stopPolling() {
    if (poll) clearTimeout(poll);
    poll = null;
  }

  async function loadClips(showLoading = true) {
    const routeName = deviceRouteName(route);
    const id = dongleId;
    if (!deviceOnline) {
      clips = [];
      cameraRanges = null;
      loading = false;
      error = null;
      return;
    }
    if (showLoading) {
      loading = true;
      error = null;
    }
    try {
      const state = await clipDevice.getClipState(id, routeName ? { route: route.fullname } : {});
      if (!mounted || routeName !== deviceRouteName(route) || id !== dongleId) return;
      clips = state.clips;
      cameraRanges = routeName ? state.cameras || {} : null;
      loading = false;
      stopPolling();
      if (open && clips.some((clip) => ACTIVE_STATUSES.has(clip.status))) {
        poll = setTimeout(() => loadClips(false), POLL_INTERVAL);
      }
      const autoClip = clips.find((clip) => clip.filename === autoDownloadFilename && clip.status === 'ready');
      if (open && autoClip) {
        autoDownloadFilename = null;
        openViewer(autoClip);
      }
    } catch (err) {
      if (mounted) {
        loading = false;
        error = err.message || 'Could not reach the device';
      }
    }
  }

  async function createClip() {
    if (!route || !zoom || !deviceOnline || !validFilename(filename)) return;
    const generatedFilename = defaultFilename(dongleId, route, camera, zoom.start / 1000, zoom.end / 1000, speedup);
    const outputFilename = `${normalizeFilename(filename) || generatedFilename}.mp4`;
    creating = true;
    autoDownloadFilename = outputFilename;
    error = null;
    try {
      await clipDevice.createClip(dongleId, {
        route: route.fullname,
        source_start_time: zoom.start / 1000,
        source_end_time: zoom.end / 1000,
        clip: {
          camera,
          bitrate,
          speedup,
          filename: outputFilename,
        },
      });
      if (!mounted) return;
      creating = false;
      await loadClips(false);
    } catch (err) {
      if (mounted) {
        creating = false;
        autoDownloadFilename = null;
        error = err.message || 'Could not create clip';
      }
    }
  }

  function downloadViewedClip() {
    if (!previewUrl || !viewingClip) return;
    const defaultName = `comma-clip-${viewingClip.camera}-${formatTime(viewingClip.source_start_time).replaceAll(':', '-')}-${formatTime(viewingClip.source_end_time).replaceAll(':', '-')}`;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `${(viewingClip.filename || defaultName).replace(/\.mp4$/i, '')}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function removeClip(clip) {
    if (!deviceOnline) return false;
    if (clip.filename === previewingClip) {
      previewRequest += 1;
      previewingClip = null;
      previewProgress = 0;
    }
    try {
      await clipDevice.deleteClip(dongleId, { filename: clip.filename });
      if (clip.filename === autoDownloadFilename) autoDownloadFilename = null;
      if (mounted) await loadClips(false);
      return true;
    } catch (err) {
      if (mounted) error = err.message || 'Could not remove clip';
      return false;
    }
  }

  async function confirmDelete() {
    if (!deletingClip || deleting) return;
    deleting = true;
    const deleted = await removeClip(deletingClip);
    if (mounted) {
      deleteDialogOpen = !deleted;
      deleting = false;
    }
  }

  async function openViewer(clip) {
    if (!deviceOnline) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewRequest += 1;
    const request = previewRequest;
    previewingClip = clip.filename;
    previewUrl = null;
    previewProgress = 0;
    error = null;
    try {
      const url = await clipDevice.getClipUrl(dongleId, clip.filename, clip.requested_at, (loaded, total) => {
        if (mounted && request === previewRequest) previewProgress = loaded / total;
      });
      if (!mounted || request !== previewRequest || previewingClip !== clip.filename) {
        URL.revokeObjectURL(url);
        return;
      }
      if (open) {
        viewingClip = clip;
        previewingClip = null;
        previewUrl = url;
        previewProgress = 0;
      } else {
        URL.revokeObjectURL(url);
        previewingClip = null;
        previewProgress = 0;
      }
    } catch (err) {
      if (mounted && request === previewRequest) {
        previewingClip = null;
        previewProgress = 0;
        error = err.message || 'Could not preview clip';
      }
    }
  }

  function closeViewer() {
    previewRequest += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    viewingClip = null;
    previewingClip = null;
    previewUrl = null;
    previewProgress = 0;
  }

  let prevOpen = false;
  let prevRouteName = undefined;
  let prevDongleId = undefined;
  let prevOnline = false;

  $effect(() => {
    const nextOpen = open;
    const nextRouteName = route?.fullname;
    const nextDongleId = dongleId;
    const nextOnline = deviceOnline;

    untrack(() => {
      const opened = nextOpen && !prevOpen;
      const routeChanged = nextRouteName !== prevRouteName;
      const deviceChanged = nextDongleId !== prevDongleId;
      const reconnected = nextOnline && !prevOnline;
      const wasOpen = prevOpen;
      const wasOnline = prevOnline;

      prevOpen = nextOpen;
      prevRouteName = nextRouteName;
      prevDongleId = nextDongleId;
      prevOnline = nextOnline;

      if ((opened || routeChanged || deviceChanged || reconnected) && nextOpen) loadClips();
      if (!nextOnline && wasOnline) {
        stopPolling();
        loading = false;
      }
      if (!nextOpen && wasOpen) {
        stopPolling();
        if (viewingClip) closeViewer();
      }
    });
  });

  $effect(() => {
    mounted = true;
    return () => {
      mounted = false;
      previewRequest += 1;
      stopPolling();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  });

  // Dialog TransitionProps.onExited: the clip outlives the dialog only while it animates out.
  $effect(() => {
    if (!deleteDialogOpen) deletingClip = null;
  });

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  $effect(() => {
    if (!open && !viewingClip && !deleteDialogOpen) return;
    return lockBodyScroll();
  });

  const MARGIN_THRESHOLD = 16;

  /**
   * Popover.getPositioningStyle with anchorOrigin/transformOrigin top-right.
   * Menu always supplies getContentAnchorEl, so the anchor's vertical origin
   * silently becomes 'center' and the paper is pulled up by half the height of
   * the list's first child.
   */
  function positionPaper() {
    const paper = paperEl;
    if (!paper) return;

    const content = paper.firstElementChild?.firstElementChild;
    let contentAnchorOffset = 0;
    if (content && paper.contains(content)) {
      let node = content;
      let scrollTop = 0;
      while (node && node !== paper) {
        node = node.parentNode;
        scrollTop += node.scrollTop;
      }
      contentAnchorOffset = content.offsetTop + content.clientHeight / 2 - scrollTop || 0;
    }

    const elemRect = { width: paper.clientWidth, height: paper.clientHeight };
    const transformOrigin = { vertical: contentAnchorOffset, horizontal: elemRect.width };

    const anchorRect = (anchorEl || document.body).getBoundingClientRect();
    const anchorOffset = {
      top: anchorRect.top + (contentAnchorOffset === 0 ? 0 : anchorRect.height / 2),
      left: anchorRect.left + anchorRect.width,
    };

    let top = anchorOffset.top - transformOrigin.vertical;
    let left = anchorOffset.left - transformOrigin.horizontal;
    const bottom = top + elemRect.height;
    const right = left + elemRect.width;
    const heightThreshold = window.innerHeight - MARGIN_THRESHOLD;
    const widthThreshold = window.innerWidth - MARGIN_THRESHOLD;

    if (top < MARGIN_THRESHOLD) {
      const diff = top - MARGIN_THRESHOLD;
      top -= diff;
      transformOrigin.vertical += diff;
    } else if (bottom > heightThreshold) {
      const diff = bottom - heightThreshold;
      top -= diff;
      transformOrigin.vertical += diff;
    }

    if (left < MARGIN_THRESHOLD) {
      const diff = left - MARGIN_THRESHOLD;
      left -= diff;
      transformOrigin.horizontal += diff;
    } else if (right > widthThreshold) {
      const diff = right - widthThreshold;
      left -= diff;
      transformOrigin.horizontal += diff;
    }

    paper.style.top = `${top}px`;
    paper.style.left = `${left}px`;
    paper.style.transformOrigin = `${transformOrigin.horizontal}px ${transformOrigin.vertical}px`;
  }

  // Popover measures once, on enter, and again only on resize; growing content
  // does not re-anchor the paper.
  $effect(() => {
    if (!paperEl) return;

    // Popover measures once on enter, and thereafter only on resize.
    untrack(positionPaper);
    window.addEventListener('resize', positionPaper);
    return () => window.removeEventListener('resize', positionPaper);
  });

  function onEscape() {
    if (deleteDialogOpen) {
      if (!deleting) deleteDialogOpen = false;
    } else if (viewingClip) closeViewer();
    else if (open) onclose?.();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onEscape(); }} />

{#snippet icon(path, viewBox, size)}
  <svg {viewBox} class="icon" style="font-size: {size}px" aria-hidden="true"><path d={path} /></svg>
{/snippet}

{#snippet circularProgress(size)}
  <div class="progress" role="progressbar" style="width: {size}px; height: {size}px">
    <svg viewBox="22 22 44 44">
      <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
    </svg>
  </div>
{/snippet}

{#snippet clipRow(clip)}
  {@const knownRoute = routes?.find((r) => deviceRouteName(r) === clip.route)}
  {@const routeLabel = clip.route === deviceRouteName(route)
    ? 'This route'
    : (knownRoute?.start_time_utc_millis
      ? new Date(knownRoute.start_time_utc_millis).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      : clip.route)}
  {@const active = ACTIVE_STATUSES.has(clip.status)}
  {@const previewing = previewingClip === clip.filename}
  <div class="clip">
    <div class="clipTop">
      <div class="clipDetails">
        <p class="clipTitle">{clip.filename?.replace(/\.mp4$/i, '') || 'Clip'}</p>
        <p class="clipMeta">{routeLabel}</p>
        <p class="clipMeta">
          {`${cameraLabel(clip.camera)} · ${formatDuration((clip.source_end_time - clip.source_start_time) / (clip.speedup || 1))}${clip.size ? ` · ${formatSize(clip.size)}` : ''}`}
        </p>
      </div>
      <div class="clipActions">
        {#if clip.status === 'ready'}
          <button
            type="button"
            aria-label="Play clip"
            class="iconButton clipAction"
            disabled={!deviceOnline || previewing}
            title={deviceOnline ? (previewing ? 'Downloading' : 'Play clip') : 'Device offline'}
            onclick={() => openViewer(clip)}
          >
            <span class="iconLabel">{@render icon(PLAY_ARROW, '0 -960 960 960', 27)}</span>
          </button>
        {/if}
        {#if clip.status === 'encoding'}<p class="clipMeta">Encoding</p>{/if}
        {#if clip.status === 'queued'}<p class="clipMeta">Queued</p>{/if}
        <button
          type="button"
          aria-label={active ? 'Cancel clip' : 'Delete clip'}
          class="iconButton clipAction"
          disabled={!deviceOnline}
          title={deviceOnline ? (active ? 'Cancel clip' : 'Delete clip') : 'Device offline'}
          onclick={() => {
            if (active) {
              removeClip(clip);
            } else {
              deletingClip = clip;
              deleteDialogOpen = true;
            }
          }}
        >
          <span class="iconLabel">
            {#if active}
              {@render icon(CLOSE_BOLD, '0 -960 960 960', 20)}
            {:else}
              {@render icon(TRASH, '0 0 24 24', 20)}
            {/if}
          </span>
        </button>
      </div>
    </div>
    {#if clip.status === 'encoding'}
      <div class="linear encodingProgress" role="progressbar">
        <div class="linearBar linearBar1Indeterminate"></div>
        <div class="linearBar linearBar2Indeterminate"></div>
      </div>
    {/if}
    {#if previewing}
      <div class="linear transferProgress" role="progressbar" aria-valuenow={Math.round(previewProgress * 100)}>
        <div class="linearBar linearBar1Determinate" style="transform: scaleX({previewProgress})"></div>
      </div>
      <p class="transferLabel">Downloading · {Math.round(previewProgress * 100)}%</p>
    {/if}
  </div>
{/snippet}

{#if open}
  <div use:portal class="modalRoot">
    <div
      class="backdrop"
      role="presentation"
      onclick={() => onclose?.()}
      onkeydown={(e) => e.key === 'Escape' && onclose?.()}
    ></div>

    <div bind:this={paperEl} class="menuPaper" class:createPaper={!inventoryOnly}>
      <ul class="menuList" class:createMenuList={!inventoryOnly} role="menu" tabindex="-1" style="outline: none">
        {#if !inventoryOnly}
          <div class="menuBody" tabindex="-1">
            <div class="createHeader">
              <p class="header">Create a clip</p>
              <button type="button" aria-label="Close clip menu" class="iconButton mobileClose" onclick={() => onclose?.()}>
                <span class="iconLabel">{@render icon(CLOSE_BOLD, '0 -960 960 960', 24)}</span>
              </button>
            </div>
            <div class="range">
              <p class="supporting">Selected timeline range</p>
              <p class="rangeValue">{zoom ? `${formatTime(startTime)}–${formatTime(endTime)} · ${formatDuration(duration)}` : '—'}</p>
            </div>
            <div class="field">
              <p class="label">CAMERA</p>
              <div class="segmentedControl">
                {#each CAMERAS as [value, label] (value)}
                  <button
                    type="button"
                    aria-pressed={camera === value}
                    class="muiButton segmentedButton"
                    disabled={cameraRanges !== null && !cameraCoversRange(cameraRanges, value, startTime, endTime)}
                    onclick={() => { camera = value; }}
                  >
                    <span class="buttonLabel">{label}</span>
                  </button>
                {/each}
              </div>
              {#if !cameraAvailable}
                <p class="availabilityHint">No camera footage covers this entire range. Choose a smaller range.</p>
              {/if}
            </div>
            <div class="field">
              <p class="label">QUALITY</p>
              <div class="segmentedControl">
                {#each BITRATES as [value, label, detail] (value)}
                  <button
                    type="button"
                    aria-pressed={bitrate === value}
                    class="muiButton segmentedButton"
                    onclick={() => { bitrate = value; }}
                  >
                    <span class="buttonLabel"><span>{label}<span class="qualityDetail">{detail}</span></span></span>
                  </button>
                {/each}
              </div>
            </div>
            <div class="field">
              <p class="label">SPEED</p>
              <div class="segmentedControl">
                {#each SPEEDUPS as value (value)}
                  <button
                    type="button"
                    aria-pressed={speedup === value}
                    class="muiButton segmentedButton"
                    onclick={() => { speedup = value; }}
                  >
                    <span class="buttonLabel">{`${value}×`}</span>
                  </button>
                {/each}
              </div>
              <div class="estimate">
                <p class="supporting">{`Output: ${formatDuration(outputDuration)}`}</p>
                <p class="estimateValue">{`About ${formatSize(estimatedSize)}`}</p>
              </div>
            </div>
            <div class="field">
              <p class="label">FILENAME</p>
              <input
                class="input"
                style="line-height: 1.5"
                value={filename}
                maxlength="80"
                placeholder={defaultFilename(dongleId, route, camera, startTime, endTime, speedup)}
                oninput={(e) => { filename = e.currentTarget.value; }}
              />
              {#if invalidFilename}
                <p class="error">Use letters, numbers, periods, underscores, and hyphens only.</p>
              {/if}
            </div>
            {#if duration > MAX_CLIP_DURATION}
              <p class="error">Choose a range of 30 minutes or less.</p>
            {/if}
            <button
              type="button"
              class="muiButton create"
              disabled={!deviceOnline || loading || creating || deviceBusy || invalidDuration || invalidFilename || cameraUnavailable || !route}
              onclick={createClip}
            >
              <span class="buttonLabel">
                {#if creating}
                  {@render circularProgress(18)}
                {:else if !deviceOnline}
                  Device offline
                {:else if deviceBusy}
                  Clip in progress
                {:else}
                  Create clip
                {/if}
              </span>
            </button>
          </div>
          <hr class="divider" />
        {/if}
        <div class="clipsSection" tabindex="-1">
          <div class="sectionHeader">
            <p class="sectionTitle">CLIPS ON THIS DEVICE</p>
            <InfoTooltip title="Clips are stored on your device and may be cleared to make room for more recent driving footage." />
          </div>
          {#if error}
            <p class="error">{error}</p>
          {/if}
          {#if loading}
            <div class="empty">{@render circularProgress(18)}</div>
          {:else}
            {#if clips.length === 0}
              <p class="empty">{deviceOnline ? 'No clips yet' : 'Device offline'}</p>
            {/if}
            {#each clips as clip (clip.filename)}
              {@render clipRow(clip)}
            {/each}
          {/if}
        </div>
      </ul>
    </div>
  </div>
{/if}

{#if viewingClip}
  <div use:portal class="modalRoot scrollPaper" role="dialog" aria-modal="true" aria-label="Clip">
    <div
      class="backdrop backdropVisible"
      role="presentation"
      onclick={closeViewer}
      onkeydown={(e) => e.key === 'Escape' && closeViewer()}
    ></div>
    <div class="dialogPaper paperWidthMd viewerPaper">
      <div class="dialogTitle viewerTitle">
        <div class="viewerDetails">
          <p class="header">{viewingClip.filename?.replace(/\.mp4$/i, '') || 'Clip'}</p>
          <p class="viewerMeta">
            {[
              viewingClip.route ? `${dongleId}/${viewingClip.route}` : dongleId,
              cameraLabel(viewingClip.camera),
              formatDuration((viewingClip.source_end_time - viewingClip.source_start_time) / (viewingClip.speedup || 1)),
              formatSize(viewingClip.size),
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div class="viewerActions">
          <button type="button" aria-label="Download clip" title="Download clip" class="iconButton" onclick={downloadViewedClip}>
            <span class="iconLabel">{@render icon(DOWNLOAD, '0 -960 960 960', 25)}</span>
          </button>
          <button type="button" aria-label="Close video" title="Close" class="iconButton" onclick={closeViewer}>
            <span class="iconLabel">{@render icon(CLOSE_BOLD, '0 -960 960 960', 24)}</span>
          </button>
        </div>
      </div>
      <div class="dialogContent viewerContent">
        {#if previewUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video class="viewerVideo" src={previewUrl} controls autoplay playsinline></video>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if deleteDialogOpen}
  <div use:portal class="modalRoot scrollPaper" role="dialog" aria-modal="true" aria-label="Delete clip?">
    <div
      class="backdrop backdropVisible"
      role="presentation"
      onclick={() => { if (!deleting) deleteDialogOpen = false; }}
      onkeydown={(e) => e.key === 'Escape' && !deleting && (deleteDialogOpen = false)}
    ></div>
    <div class="dialogPaper paperWidthSm deletePaper">
      <div class="dialogTitle deleteTitle">
        <h2 class="title">Delete clip?</h2>
      </div>
      <div class="dialogContent">
        <p class="deleteContent">
          {`${deletingClip?.filename?.replace(/\.mp4$/i, '') || 'this clip'} will be permanently deleted from your comma device.`}
        </p>
      </div>
      <div class="dialogActions deleteActions">
        <button type="button" class="muiButton dialogAction" disabled={deleting} onclick={() => { deleteDialogOpen = false; }}>
          <span class="buttonLabel">Cancel</span>
        </button>
        <button type="button" class="muiButton dialogAction deleteButton" disabled={deleting} onclick={confirmDelete}>
          <span class="buttonLabel">
            {#if deleting}{@render circularProgress(18)}{:else}Delete{/if}
          </span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modalRoot {
    position: fixed;
    z-index: 1300;
    inset: 0;
  }

  .scrollPaper {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    position: fixed;
    z-index: -1;
    inset: 0;
    background-color: transparent;
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
  }

  .backdropVisible {
    background-color: rgba(0, 0, 0, 0.5);
  }

  .menuPaper {
    position: absolute;
    display: flex;
    width: 360px;
    min-width: 16px;
    min-height: 16px;
    max-width: calc(100vw - 24px);
    max-height: calc(100% - 96px);
    overflow: hidden;
    outline: none;
    border-radius: 4px;
    background-color: #30373b;
    box-shadow:
      0px 5px 5px -3px rgba(0, 0, 0, 0.2),
      0px 8px 10px 1px rgba(0, 0, 0, 0.14),
      0px 3px 14px 2px rgba(0, 0, 0, 0.12);
    -webkit-overflow-scrolling: touch;
    line-height: 1.5;
  }

  @media (max-width: 600px) {
    .createPaper {
      border-radius: 0;
      bottom: 0 !important;
      height: 100vh;
      left: 0 !important;
      max-height: none;
      max-width: none;
      right: 0 !important;
      top: 0 !important;
      transform: none !important;
      width: 100vw;
    }
  }

  .menuList {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    max-height: calc(100vh - 96px);
    margin: 0;
    padding: 8px 0;
    list-style: none;
  }

  @media (max-width: 600px) {
    .createMenuList {
      height: 100vh;
      max-height: none;
    }
  }

  .menuBody {
    outline: none;
    padding: 16px;
  }

  .menuBody:focus {
    outline: none;
  }

  .createHeader {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }


  .header {
    display: block;
    margin: 0 0 4px;
    color: #fff;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.46429em;
  }

  .supporting {
    display: block;
    margin: 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
  }

  .range {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    margin: 14px 0;
    padding: 10px 12px;
  }

  .rangeValue {
    display: block;
    margin: 0;
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.46429em;
  }

  .field {
    margin-top: 14px;
  }

  .label {
    display: block;
    margin: 0 0 6px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.46429em;
  }

  .segmentedControl {
    display: flex;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    overflow: hidden;
  }

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
    border-radius: 4px;
    background-color: transparent;
    color: #fff;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4em;
    text-transform: none;
    text-decoration: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      border 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .muiButton:hover {
    text-decoration: none;
    background-color: rgba(255, 255, 255, 0.1);
  }

  .muiButton:disabled {
    pointer-events: none;
    cursor: default;
    color: rgba(255, 255, 255, 0.3);
  }

  .muiButton:disabled:hover {
    background-color: transparent;
  }

  .buttonLabel {
    width: 100%;
    display: inherit;
    align-items: inherit;
    justify-content: inherit;
  }

  .segmentedButton {
    border: none;
    border-radius: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    flex: 1 1 0;
    font-size: 12px;
    line-height: 1.2;
    min-height: 44px;
    min-width: 0;
    padding: 5px 4px;
    text-transform: none;
  }

  .segmentedButton:last-child {
    border-right: none;
  }

  .segmentedButton:disabled {
    color: rgba(255, 255, 255, 0.3);
  }

  .segmentedButton[aria-pressed='true'],
  .segmentedButton[aria-pressed='true']:hover,
  .segmentedButton[aria-pressed='true']:focus {
    background: rgba(255, 255, 255, 0.14);
  }

  .qualityDetail {
    color: rgba(255, 255, 255, 0.6);
    display: block;
    font-size: 10px;
    font-weight: 400;
    margin-top: 2px;
  }

  .availabilityHint {
    display: block;
    margin: 7px 0 0;
    color: #ffcc80;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
  }

  .estimate {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }

  .estimateValue {
    display: block;
    margin: 0;
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.46429em;
  }

  .input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-sizing: border-box;
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    padding: 9px 11px;
    width: 100%;
  }

  .input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .error {
    display: block;
    margin: 10px 0 0;
    color: #ff8a80;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.46429em;
  }

  .create {
    background: #fff;
    border-radius: 16px;
    color: #1e2224;
    margin-top: 16px;
    min-height: 32px;
    text-transform: none;
    width: 100%;
  }

  .create:hover {
    background: #eee;
  }

  .create:disabled {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.6);
  }

  .divider {
    height: 1px;
    margin: 0;
    border: none;
    flex-shrink: 0;
    background-color: rgba(255, 255, 255, 0.12);
  }

  .clipsSection {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 13px 16px 16px;
  }

  .sectionHeader {
    align-items: center;
    color: rgba(255, 255, 255, 0.6);
    display: flex;
    margin-bottom: 8px;
  }

  .sectionTitle {
    display: block;
    margin: 0;
    color: inherit;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
  }

  .clip {
    padding: 8px 0;
  }

  .clip + .clip {
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .clip:last-child {
    padding-bottom: 0;
  }

  .clipTop {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .clipDetails {
    min-width: 0;
  }

  .clipTitle {
    display: block;
    margin: 0;
    color: #fff;
    font-size: 15px;
    font-weight: 400;
    line-height: 1.35;
  }

  .clipMeta {
    display: block;
    margin: 2px 0 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
  }

  .clipActions {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 2px;
    margin: -4px -7px -4px 0;
  }

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
    font-family: inherit;
    font-size: 1.5rem;
    text-align: center;
    text-decoration: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .iconButton:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .iconButton:disabled {
    pointer-events: none;
    cursor: default;
    color: rgba(255, 255, 255, 0.3);
  }

  .iconButton:disabled:hover {
    background-color: transparent;
  }

  .mobileClose {
    display: none;
  }

  @media (max-width: 600px) {
    .mobileClose {
      display: flex;
      margin: -8px -8px -8px 0;
    }
  }


  .iconLabel {
    width: 100%;
    display: flex;
    align-items: inherit;
    justify-content: inherit;
  }

  .clipAction {
    color: #fff;
    flex: 0 0 auto;
    height: 32px;
    padding: 7px;
    width: 32px;
  }

  .clipAction:disabled {
    color: rgba(255, 255, 255, 0.4);
  }

  .icon {
    user-select: none;
    width: 1em;
    height: 1em;
    display: inline-block;
    fill: currentColor;
    flex-shrink: 0;
  }

  .progress {
    display: inline-block;
    line-height: 1;
    color: #57a9e3;
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

  .linear {
    position: relative;
    overflow: hidden;
    height: 5px;
    background-color: rgb(201, 227, 245);
  }

  .linearBar {
    width: 100%;
    position: absolute;
    left: 0;
    bottom: 0;
    top: 0;
    background-color: #57a9e3;
    transition: transform 0.2s linear;
    transform-origin: left;
  }

  .linearBar1Determinate {
    will-change: transform;
    transition: transform 0.4s linear;
  }

  .linearBar1Indeterminate {
    width: auto;
    will-change: left, right;
    animation: mui-indeterminate1 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
  }

  .linearBar2Indeterminate {
    width: auto;
    will-change: left, right;
    animation: mui-indeterminate2 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) infinite;
    animation-delay: 1.15s;
  }

  @keyframes mui-indeterminate1 {
    0% {
      left: -35%;
      right: 100%;
    }
    60% {
      left: 100%;
      right: -90%;
    }
    100% {
      left: 100%;
      right: -90%;
    }
  }

  @keyframes mui-indeterminate2 {
    0% {
      left: -200%;
      right: 100%;
    }
    60% {
      left: 107%;
      right: -8%;
    }
    100% {
      left: 107%;
      right: -8%;
    }
  }

  .encodingProgress {
    margin-top: 7px;
  }

  .transferProgress {
    border-radius: 3px;
    height: 5px;
    margin-top: 8px;
  }

  .transferLabel {
    display: block;
    margin: 8px 0 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.46429em;
    text-align: center;
  }

  .empty {
    display: block;
    margin: 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    padding-top: 5px;
  }

  .dialogPaper {
    display: flex;
    flex-direction: column;
    position: relative;
    flex: 0 1 auto;
    margin: 48px;
    max-height: calc(100% - 96px);
    overflow-y: auto;
    outline: none;
    border-radius: 4px;
    background-color: #30373b;
    box-shadow:
      0px 11px 15px -7px rgba(0, 0, 0, 0.2),
      0px 24px 38px 3px rgba(0, 0, 0, 0.14),
      0px 9px 46px 8px rgba(0, 0, 0, 0.12);
    line-height: 1.5;
  }

  .paperWidthSm {
    max-width: 600px;
  }

  .paperWidthMd {
    max-width: 960px;
  }

  .dialogTitle {
    margin: 0;
    padding: 24px 24px 20px;
    flex: 0 0 auto;
  }

  .title {
    display: block;
    margin: 0;
    color: #fff;
    font-size: 1.3125rem;
    font-weight: 500;
    line-height: 1.16667em;
  }

  .dialogContent {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0 24px 24px;
    -webkit-overflow-scrolling: touch;
  }

  .dialogActions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
    margin: 8px 4px;
  }

  .dialogAction {
    margin: 0 4px;
  }

  .viewerPaper {
    background: #1e2224;
    max-width: 800px;
    width: calc(100vw - 32px);
  }

  .viewerTitle {
    align-items: flex-start;
    display: flex;
    justify-content: space-between;
    padding: 16px 12px 12px 20px;
  }

  .viewerDetails {
    min-width: 0;
    padding-top: 1px;
  }

  .viewerMeta {
    display: block;
    margin: 3px 0 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
  }

  .viewerActions {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    margin-top: -4px;
  }

  .viewerContent {
    padding: 0 20px 20px;
  }

  .viewerVideo {
    background: #151819;
    display: block;
    max-height: 70vh;
    width: 100%;
  }

  .deletePaper {
    background: #1e2224;
    width: 360px;
  }

  .deleteTitle {
    padding-bottom: 8px;
  }

  .deleteContent {
    display: block;
    margin: 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
  }

  .deleteActions {
    padding: 8px 16px 16px;
  }

  .deleteButton {
    color: #ff8a80;
  }
</style>
