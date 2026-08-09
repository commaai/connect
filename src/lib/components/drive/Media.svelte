<script>
  import * as Sentry from '@sentry/browser';
  import { innerWidth } from 'svelte/reactivity/window';

  import { drives as Drives, USERADMIN_URL_ROOT } from '$lib/api';
  import { deviceSupportsClips } from '$lib/api/clips';
  import InfoTooltip from '$lib/components/InfoTooltip.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import ErrorOutline from '$lib/icons/ErrorOutline.svelte';
  import InfoOutline from '$lib/icons/InfoOutline.svelte';
  import {
    FILE_NAMES,
    doUpload,
    fetchAthenaQueue,
    fetchFiles,
    fetchUploadUrls,
    getFiles,
    setRouteViewed,
    updateFiles,
    withDeviceStatus,
  } from '$lib/state/files.svelte.js';
  import { playback } from '$lib/state/playback.svelte.js';
  import { fetchEvents } from '$lib/state/routes.svelte.js';
  import { deviceIsOnline, deviceOnCellular, getSegmentNumber } from '$lib/utils';
  import { stringifyQuery } from '$lib/utils/query';
  import ClipMenu from './ClipMenu.svelte';
  import DriveMap from './DriveMap.svelte';
  import DriveVideo from './DriveVideo.svelte';
  import TimeDisplay from './TimeDisplay.svelte';
  import UploadQueue from './UploadQueue.svelte';

  const publicTooltip = 'Making a route public allows anyone with the route name or link to access it.';
  const preservedTooltip = 'Preserving a route will prevent it from being deleted. You can preserve up to 10 routes,'
    + ' or 100 if you have comma prime.';

  let { route, dongleId, device = null, profile = null, onanalytics = undefined } = $props();

  let inView = $state('video');
  let downloadMenu = $state(null);
  let clipMenu = $state(null);
  let moreInfoMenu = $state(null);
  let uploadModal = $state(false);
  let dcamUploadInfo = $state(null);
  let routePreserved = $state(null);
  let isMuted = $state(true);
  let hasAudio = $state(false);
  let clipsSupported = $state(false);

  // SwitchLoading's own state, one copy per switch in the more-info menu
  const publicSwitch = $state({ loading: false, checked: null, error: null, errorAnchor: null });
  const preserveSwitch = $state({ loading: false, checked: null, error: null, errorAnchor: null });

  // redux mutated the device record as athena learned it was online or metered
  const dev = $derived(withDeviceStatus(device));
  const files = $derived(getFiles());

  const windowWidth = $derived(innerWidth.current ?? 1280);
  const showMapAlways = $derived(windowWidth >= 1536);
  const mediaContainerStyle = $derived(showMapAlways ? 'width: 60%' : 'width: 100%');
  const mapContainerStyle = $derived(showMapAlways
    ? 'width: 40%; margin-bottom: 62px; margin-top: 46px; padding-left: 24px'
    : 'width: 100%');

  const online = $derived(deviceIsOnline(dev));
  const canUpload = $derived(Boolean(dev?.is_owner || profile?.superuser));
  const uploadButtonWidth = $derived(windowWidth < 425 ? 80 : 120);
  const segmentNumber = $derived(getSegmentNumber(route, playback.currentOffset()));
  const segmentName = $derived(route ? `${route.fullname.replace('|', '/')}/${segmentNumber}` : '---');

  let lastFullname = null;
  let lastInView = 'video';
  let lastDownloadMenu = null;
  let lastMoreInfoMenu = null;
  let preservedRequested = false;
  let routeViewed = false;

  $effect(() => {
    if (!route || route.fullname === lastFullname) return;
    lastFullname = route.fullname;
    routePreserved = null;
    preservedRequested = false;
    fetchEvents(route);
  });

  $effect(() => {
    if (!dev || !online) return;
    const id = dongleId;
    let cancelled = false;
    deviceSupportsClips(dev)
      .then((supported) => {
        if (!cancelled && id === dongleId) clipsSupported = supported;
      })
      // The button stays hidden when Athena is unavailable or too old.
      .catch(() => {});
    return () => { cancelled = true; };
  });

  $effect(() => {
    if (showMapAlways && inView === 'map') {
      inView = 'video';
    }
  });

  $effect(() => {
    if (!showMapAlways && inView === 'map' && playback.isBufferingVideo) {
      playback.bufferVideo(false);
    }
  });

  $effect(() => {
    if (inView === lastInView) return;
    lastInView = inView;
    onanalytics?.('media_switch_view', { in_view: inView });
  });

  // Both menus list the route's files, so opening either one fetches them.
  $effect(() => {
    const openedDownload = !lastDownloadMenu && downloadMenu;
    const openedMoreInfo = !lastMoreInfoMenu && moreInfoMenu;
    lastDownloadMenu = downloadMenu;
    lastMoreInfoMenu = moreInfoMenu;
    if (!route || !(openedDownload || (!files && openedMoreInfo))) return;

    if ((dev && !dev.shared) || profile?.superuser) {
      fetchAthenaQueue(dongleId);
    }
    fetchFiles(route.fullname);
  });

  $effect(() => {
    if (preservedRequested || routePreserved !== null) return;
    if (!(dev?.is_owner || profile?.superuser)) return;
    preservedRequested = true;
    fetchRoutePreserved();
  });

  $effect(() => {
    if (routeViewed || !route) return;
    if ((dev && !dev.shared) || profile?.superuser) {
      routeViewed = true;
      setRouteViewed(dongleId, route.fullname, dev);
    }
  });

  async function copySegmentName() {
    if (!route || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(segmentName);
    moreInfoMenu = null;
  }

  /** analytics.js attachRelTime, clustered by hour. */
  function relTime(key, value) {
    const dt = value - Date.now();
    return { [key]: value, [`rel_${key}_ms`]: dt, [`rel_${key}_h`]: Math.round(dt / (60 * 60 * 1000)) };
  }

  function openInUseradmin() {
    if (!route) {
      return;
    }
    onanalytics?.('open_in_useradmin', relTime('route_start_time', route.start_time_utc_millis));

    const win = window.open(`${USERADMIN_URL_ROOT}?${stringifyQuery({ onebox: route.fullname })}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  async function shareCurrentRoute() {
    try {
      await navigator.share({ title: 'comma connect', url: window.location.href });
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_navigator_share' });
    }
  }

  async function uploadFile(type) {
    if (!route) {
      return;
    }
    onanalytics?.('files_upload', { type });

    const routeNoDongleId = route.fullname.split('|')[1];
    updateFiles({ [`${dongleId}|${routeNoDongleId}--${segmentNumber}/${type}`]: { requested: true } });

    // request all possible file names
    const paths = FILE_NAMES[type].map((fn) => `${routeNoDongleId}--${segmentNumber}/${fn}`);
    const urls = await Promise.all(paths.map((path) => fetchUploadUrls(dongleId, [path]).then((u) => u?.[0])));
    if (urls) {
      doUpload(dev, paths, urls);
    }
  }

  async function uploadFilesAll(types = ['logs', 'cameras', 'dcameras', 'ecameras']) {
    const { loop } = playback;
    if (!route || !files || !loop) {
      return;
    }
    onanalytics?.('files_upload_all', {
      types: types.length === 1 && types[0] === 'logs' ? 'logs' : 'all',
    });

    const uploading = {};
    const adjustedStartTime = route.start_time_utc_millis + loop.startTime;
    for (let i = 0; i < route.segment_numbers.length; i++) {
      if (route.segment_start_times[i] < adjustedStartTime + loop.duration
        && route.segment_end_times[i] > adjustedStartTime) {
        for (const type of types) {
          const fileName = `${route.fullname}--${route.segment_numbers[i]}/${type}`;
          if (!files[fileName]) {
            uploading[fileName] = { requested: true };
          }
        }
      }
    }
    updateFiles(uploading);

    const paths = Object.keys(uploading).flatMap((fileName) => {
      const [seg, type] = fileName.split('/');
      return FILE_NAMES[type].map((file) => `${seg.split('|')[1]}/${file}`);
    });

    const urls = await fetchUploadUrls(dongleId, paths);
    if (urls) {
      doUpload(dev, paths, urls);
    }
  }

  function uploadStats(types, count, uploaded, uploading, paused, requested) {
    const adjustedStartTime = route.start_time_utc_millis + playback.loop.startTime;

    for (let i = 0; i < route.segment_numbers.length; i++) {
      if (route.segment_start_times[i] < adjustedStartTime + playback.loop.duration
        && route.segment_end_times[i] > adjustedStartTime) {
        for (const type of types) {
          count += 1;
          const log = files[`${route.fullname}--${route.segment_numbers[i]}/${type}`];
          if (log) {
            uploaded += Boolean(log.url || log.notFound);
            uploading += Boolean(log.progress !== undefined);
            paused += Boolean(log.paused);
            requested += Boolean(log.requested);
          }
        }
      }
    }

    return [count, uploaded, uploading, paused, requested];
  }

  const stats = $derived.by(() => {
    if (!files || !route || !playback.loop) {
      return null;
    }
    const [countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog] = uploadStats(['logs'], 0, 0, 0, 0, 0);
    const [countAll, uploadedAll, uploadingAll, pausedAll, requestedAll] = uploadStats(
      ['cameras', 'dcameras', 'ecameras'],
      countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog,
    );

    return {
      canRequestAll: countAll - uploadedAll - uploadingAll - requestedAll,
      canRequestRlog: countRlog - uploadedRlog - uploadingRlog - requestedRlog,
      isUploadingAll: !(countAll - uploadedAll - uploadingAll),
      isUploadingRlog: !(countRlog - uploadedRlog - uploadingRlog),
      isUploadedAll: !(countAll - uploadedAll),
      isUploadedRlog: !(countRlog - uploadedRlog),
      isPausedAll: Boolean(pausedAll > 0 && pausedAll === uploadingAll),
    };
  });

  const rlogUploadDisabled = $derived(!stats || stats.isUploadedRlog || stats.isUploadingRlog || !stats.canRequestRlog);
  const allUploadDisabled = $derived(!stats || stats.isUploadedAll || stats.isUploadingAll || !stats.canRequestAll);

  const segmentFiles = $derived.by(() => {
    if (!files || !route) {
      return [{}, {}, {}, {}];
    }
    const seg = `${route.fullname}--${segmentNumber}`;
    return [
      files[`${seg}/cameras`] || {},
      files[`${seg}/ecameras`] || {},
      files[`${seg}/dcameras`] || {},
      files[`${seg}/logs`] || {},
    ];
  });

  function downloadFile(file, type) {
    onanalytics?.('download_file', { type, ...relTime('route_start_time', route.start_time_utc_millis) });
    window.location.href = file.url;
  }

  async function onPublicToggle(checked) {
    try {
      const resp = await Drives.setRoutePublic(route.fullname, checked);
      if (resp && resp.fullname === route.fullname && resp.is_public !== checked) {
        return { error: 'unable to update' };
      }
      return null;
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_public' });
      return { error: 'could not update' };
    }
  }

  async function fetchRoutePreserved() {
    try {
      const resp = await Drives.getPreservedRoutes(dongleId);
      if (resp && Array.isArray(resp) && route) {
        routePreserved = Boolean(resp.find((r) => r.fullname === route.fullname));
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_fetch_preserved' });
    }
  }

  async function onPreserveToggle(checked) {
    try {
      const resp = await Drives.setRoutePreserved(route.fullname, checked);
      if (resp && resp.success) {
        routePreserved = checked;
        return null;
      }
      fetchRoutePreserved();
      return { error: 'unable to update' };
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_preserved' });
      fetchRoutePreserved();
      return { error: 'could not update' };
    }
  }

  async function onSwitchChange(local, ev, onchange) {
    if (local.loading) {
      return;
    }
    local.loading = true;
    local.checked = ev.currentTarget.checked;
    local.error = null;

    const res = await onchange(local.checked);
    local.loading = false;
    local.checked = null;
    local.error = res?.error ?? null;
  }

  /**
   * MUI's Popover measured the paper and clamped it to the viewport; anchoring the
   * corner named by transformOrigin is enough for these menus. A number is a pixel
   * offset from the anchor's left edge, as the more-info menu passes.
   */
  function menuPosition(el, transformHorizontal) {
    if (!el) {
      return 'display: none';
    }
    const rect = el.getBoundingClientRect();
    const top = Math.max(16, rect.top);
    if (transformHorizontal === 'right') {
      return `top: ${top}px; left: ${rect.right}px; transform: translateX(-100%)`;
    }
    return `top: ${top}px; left: ${Math.max(16, rect.left - transformHorizontal)}px`;
  }

  /** MUI Popper, placement="bottom" */
  function popperPosition(el) {
    if (!el) {
      return 'display: none';
    }
    const rect = el.getBoundingClientRect();
    return `top: ${rect.bottom}px; left: ${rect.left}px`;
  }

  function closeMenus() {
    downloadMenu = null;
    clipMenu = null;
    moreInfoMenu = null;
  }
</script>

<svelte:window onkeydown={(ev) => { if (ev.key === 'Escape') closeMenus(); }} />

<!-- MUI CircularProgress, indeterminate, default thickness -->
{#snippet progress(size)}
  <div class="progress" role="progressbar" style="width: {size}px; height: {size}px; color: #fff">
    <svg viewBox="22 22 44 44">
      <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
    </svg>
  </div>
{/snippet}

{#snippet menu(position, onclose, body)}
  <div class="fixed inset-0 z-[1300]">
    <!-- MUI Modal's invisible backdrop -->
    <div
      class="fixed inset-0"
      role="presentation"
      onclick={onclose}
      onkeydown={(ev) => { if (ev.key === 'Escape') onclose(); }}
    ></div>
    <div class="menuPaper" style={position}>
      <ul class="menuList" role="menu" tabindex="-1">
        {@render body()}
      </ul>
    </div>
  </div>
{/snippet}

{#snippet uploadMenuItem(file, name, type)}
  <li
    class="menuItem itemDisabled filesItem"
    style={files ? 'pointer-events: auto' : 'color: rgba(255, 255, 255, 0.6)'}
  >
    {name}
    {#if !files}
      <!-- the menu shows one spinner of its own until the file list arrives -->
    {:else if file.url}
      <button
        type="button"
        class="muiButton uploadButton"
        style="min-width: {uploadButtonWidth}px"
        onclick={() => downloadFile(file, type)}
      >
        <span class="label">download</span>
      </button>
    {:else if file.progress !== undefined}
      <div class="fakeUploadButton" style="min-width: {uploadButtonWidth - 24}px">
        {file.current ? `${Math.floor(file.progress * 100)}%` : (file.paused ? 'paused' : 'pending')}
      </div>
    {:else if file.requested}
      <div class="fakeUploadButton" style="min-width: {uploadButtonWidth - 24}px">
        {@render progress(17)}
      </div>
    {:else if file.notFound}
      <div
        class="fakeUploadButton"
        style="min-width: {uploadButtonWidth - 24}px"
        role="presentation"
        onmouseenter={(ev) => { if (type === 'dcameras') dcamUploadInfo = ev.currentTarget; }}
        onmouseleave={() => { if (type === 'dcameras') dcamUploadInfo = null; }}
      >
        not found
        {#if type === 'dcameras'}
          <!-- styles.dcameraUploadIcon: the icon's font-size is inline, so it only
               yields to a utility, which tailwind's `important` makes win -->
          <InfoOutline class="text-base ml-1" />
        {/if}
      </div>
    {:else if !canUpload}
      <button type="button" class="muiButton uploadButton" style="min-width: {uploadButtonWidth}px" disabled>
        <span class="label">download</span>
      </button>
    {:else}
      <button
        type="button"
        class="muiButton uploadButton"
        style="min-width: {uploadButtonWidth}px"
        onclick={() => uploadFile(type)}
      >
        <span class="label">{windowWidth < 425 ? 'upload' : 'request upload'}</span>
      </button>
    {/if}
  </li>
{/snippet}

{#snippet uploadAllItem(label, disabled, buttonLabel, isUploaded, isUploading, onclick)}
  <li
    class="menuItem itemDisabled filesItem"
    style={files && stats ? 'pointer-events: auto' : 'color: rgba(255, 255, 255, 0.6)'}
  >
    {label}
    {#if files && canUpload && !disabled}
      <button type="button" class="muiButton uploadButton" style="min-width: {uploadButtonWidth}px" {onclick}>
        <span class="label">{buttonLabel}</span>
      </button>
    {/if}
    {#if canUpload && disabled && stats}
      <div class="fakeUploadButton" style="min-width: {uploadButtonWidth - 24}px">
        {#if isUploaded}uploaded{:else if isUploading}pending{:else}{@render progress(17)}{/if}
      </div>
    {/if}
  </li>
{/snippet}

{#snippet switchLoading(local, checked, loading, label, tooltip, onchange)}
  <div class="switchLoadingRoot">
    <label class="formControlLabel">
      <span class="switch">
        <span class="switchBase {(local.checked ?? checked) ? 'switchChecked' : ''} {loading ? 'switchDisabled' : ''}">
          <input
            type="checkbox"
            class="switchInput"
            checked={Boolean(local.checked ?? checked)}
            disabled={loading}
            onchange={(ev) => onSwitchChange(local, ev, onchange)}
          />
          <span class="switchIcon {(loading || local.loading) ? 'switchThumbLoading' : ''}"></span>
        </span>
        <span class="switchBar {(local.checked ?? checked) ? 'switchBarChecked' : ''} {loading ? 'switchBarDisabled' : ''}"></span>
      </span>
      <span class="switchLabelText">{label}</span>
    </label>
    <InfoTooltip title={tooltip} />
    {#if local.error}
      <span
        role="presentation"
        class="errorIcon"
        onmouseenter={(ev) => { local.errorAnchor = ev.currentTarget; }}
        onmouseleave={() => { local.errorAnchor = null; }}
      >
        <ErrorOutline />
      </span>
      {#if local.errorAnchor}
        <div class="copiedPopover" style={popperPosition(local.errorAnchor)}>
          <p class="typography body1">{local.error}</p>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet warningIcon()}
  <!-- @material-ui/icons/Warning -->
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
{/snippet}

{#snippet downloadMenuItems()}
  {#if !files}
    <div class="menuLoading">{@render progress(36)}</div>
  {/if}
  {@render uploadMenuItem(segmentFiles[0], 'Road camera', 'cameras')}
  {@render uploadMenuItem(segmentFiles[1], 'Wide road camera', 'ecameras')}
  {@render uploadMenuItem(segmentFiles[2], 'Driver camera', 'dcameras')}
  {@render uploadMenuItem(segmentFiles[3], 'Log data', 'logs')}
  <li class="divider" role="separator"></li>
  {@render uploadAllItem(
    'All logs',
    rlogUploadDisabled,
    `upload ${stats?.canRequestRlog} logs`,
    stats?.isUploadedRlog,
    stats?.isUploadingRlog,
    () => uploadFilesAll(['logs']),
  )}
  {@render uploadAllItem(
    'All files',
    allUploadDisabled,
    `upload ${stats?.canRequestAll} files`,
    stats?.isUploadedAll,
    stats?.isUploadingAll,
    () => uploadFilesAll(),
  )}
  <li class="divider" role="separator"></li>
  {#if online || !files}
    <li
      class="menuItem filesItem {files ? '' : 'itemDisabled'}"
      role="menuitem"
      tabindex="-1"
      style={files ? 'pointer-events: auto' : 'color: rgba(255, 255, 255, 0.6)'}
      onclick={() => { if (files) { uploadModal = true; downloadMenu = null; } }}
      onkeydown={(ev) => { if (files && ev.key === 'Enter') { uploadModal = true; downloadMenu = null; } }}
    >
      View upload queue
    </li>
  {:else}
    <li class="menuItem itemDisabled offlineMenuItem">
      <div>
        {@render warningIcon()}
        Device offline
      </div>
      <span style="font-size: 0.8rem">uploading will resume when device is online</span>
    </li>
  {/if}
  {#if stats && stats.isPausedAll && deviceOnCellular(dev)}
    <li class="menuItem itemDisabled offlineMenuItem">
      <div>
        {@render warningIcon()}
        Connect to WiFi
      </div>
      <span style="font-size: 0.8rem">uploading paused on cellular connection</span>
    </li>
  {/if}
{/snippet}

{#snippet moreInfoMenuItems()}
  <li
    class="menuItem copySegment"
    role="menuitem"
    tabindex="-1"
    style="font-size: {windowWidth > 400 ? '0.8rem' : '0.7rem'}"
    onclick={copySegmentName}
    onkeydown={(ev) => { if (ev.key === 'Enter') copySegmentName(); }}
  >
    <div>{segmentName}</div>
    <!-- @material-ui/icons/ContentCopy -->
    <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  </li>
  {#if typeof navigator !== 'undefined' && typeof navigator.share !== 'undefined'}
    <li
      class="menuItem shareButton"
      role="menuitem"
      tabindex="-1"
      onclick={shareCurrentRoute}
      onkeydown={(ev) => { if (ev.key === 'Enter') shareCurrentRoute(); }}
    >
      Share this route
      <!-- @material-ui/icons/Share -->
      <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
      </svg>
    </li>
  {/if}
  <li class="divider" role="separator"></li>
  <li
    class="menuItem"
    role="menuitem"
    tabindex="-1"
    onclick={openInUseradmin}
    onkeydown={(ev) => { if (ev.key === 'Enter') openInUseradmin(); }}
  >
    View in useradmin
  </li>
  {#if dev?.is_owner || profile?.superuser}
    <li class="divider" role="separator"></li>
    <li class="listItem switchListItem">
      {@render switchLoading(publicSwitch, route?.is_public, false, 'Public access', publicTooltip, onPublicToggle)}
    </li>
    <li class="listItem switchListItem">
      {@render switchLoading(
        preserveSwitch,
        Boolean(routePreserved),
        routePreserved === null,
        'Preserved',
        preservedTooltip,
        onPreserveToggle,
      )}
    </li>
  {/if}
{/snippet}

<div class="root">
  <div style={mediaContainerStyle}>
    <div class="mediaOptionsRoot">
      {#if showMapAlways}
        <div></div>
      {:else}
        <div class="mediaOptions">
          <div
            class="mediaOption"
            role="button"
            tabindex="0"
            style={inView !== 'video' ? 'opacity: 0.6' : ''}
            onclick={() => { inView = 'video'; }}
            onkeydown={(ev) => { if (ev.key === 'Enter') inView = 'video'; }}
          >
            <p class="typography mediaOptionText">Video</p>
          </div>
          <div
            class="mediaOption noBorder"
            role="button"
            tabindex="0"
            style={inView !== 'map' ? 'opacity: 0.6' : ''}
            onclick={() => { inView = 'map'; }}
            onkeydown={(ev) => { if (ev.key === 'Enter') inView = 'map'; }}
          >
            <p class="typography mediaOptionText">Map</p>
          </div>
        </div>
      {/if}
      <div class="mediaOptions">
        {#if clipsSupported}
          <!-- MUI Tooltip cloned its child, so the option stayed a direct flex item -->
          <Tooltip
            title={online ? '' : 'Device offline'}
            placement="top"
            panelClass="rounded-[4px] bg-[#303639] px-2 py-1 text-[0.625rem] text-white"
          >
            <div
              class="mediaOption"
              role="button"
              tabindex="0"
              aria-haspopup="true"
              style={online ? '' : 'opacity: 0.7'}
              onclick={(ev) => { if (online) clipMenu = ev.currentTarget; }}
              onkeydown={(ev) => { if (online && ev.key === 'Enter') clipMenu = ev.currentTarget; }}
            >
              <p class="typography mediaOptionText">Clip</p>
            </div>
          </Tooltip>
        {/if}
        <div
          class="mediaOption"
          role="button"
          tabindex="0"
          aria-haspopup="true"
          onclick={(ev) => { downloadMenu = ev.currentTarget; }}
          onkeydown={(ev) => { if (ev.key === 'Enter') downloadMenu = ev.currentTarget; }}
        >
          <p class="typography mediaOptionText">Files</p>
        </div>
        <div
          class="mediaOption noBorder"
          role="button"
          tabindex="0"
          aria-haspopup="true"
          onclick={(ev) => { moreInfoMenu = ev.currentTarget; }}
          onkeydown={(ev) => { if (ev.key === 'Enter') moreInfoMenu = ev.currentTarget; }}
        >
          <p class="typography mediaOptionText">More info</p>
        </div>
      </div>
    </div>

    <!-- renderMenus: everything here is anchored to the options above, and none of
         it renders without a device -->
    {#if dev}
      <ClipMenu
        open={Boolean(clipMenu)}
        {dongleId}
        anchorEl={clipMenu}
        onclose={() => { clipMenu = null; }}
        {route}
        zoom={playback.zoom}
        deviceOnline={online}
      />
      {#if downloadMenu}
        {@render menu(menuPosition(downloadMenu, 'right'), () => { downloadMenu = null; }, downloadMenuItems)}
      {/if}
      {#if moreInfoMenu}
        {@render menu(
          menuPosition(moreInfoMenu, windowWidth > 400 ? 260 : 300),
          () => { moreInfoMenu = null; },
          moreInfoMenuItems,
        )}
      {/if}
      <UploadQueue
        open={uploadModal}
        onclose={() => { uploadModal = false; }}
        update={Boolean(moreInfoMenu || uploadModal || downloadMenu)}
        {dongleId}
        device={dev}
      />
      {#if dcamUploadInfo}
        <div class="dcameraUploadInfo" style={popperPosition(dcamUploadInfo)}>
          <p class="typography body1">make sure to enable the &ldquo;Record and Upload Driver Camera&rdquo; toggle</p>
        </div>
      {/if}
    {/if}

    {#if inView === 'video'}
      <DriveVideo
        {route}
        {dongleId}
        {isMuted}
        onaudiostatuschange={(value) => { hasAudio = value; }}
      />
    {/if}
    {#if inView === 'map' && !showMapAlways}
      <div style={mapContainerStyle}>
        <DriveMap {route} />
      </div>
    {/if}
    <div class="mt-3">
      <TimeDisplay
        {route}
        isThin
        {isMuted}
        {hasAudio}
        onmutetoggle={() => { isMuted = !isMuted; }}
      />
    </div>
  </div>
  {#if inView === 'video' && showMapAlways}
    <div style={mapContainerStyle}>
      <DriveMap {route} />
    </div>
  {/if}
</div>

<style>
  /**
   * MUI's JSS sheets and this component's `styles`, as plain CSS in the order JSS
   * injected them: the component's sheet is created after the MUI ones, so its
   * single-class rules win the ties (which is how `.filesItem` undoes the
   * disabled dimming below).
   */

  /* MuiTypography root */
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

  /* styles.root */
  .root {
    display: flex;
  }

  /* styles.mediaOptionsRoot */
  .mediaOptionsRoot {
    max-width: 964px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  /* styles.mediaOptions */
  .mediaOptions {
    margin-bottom: 12px;
    display: flex;
    width: max-content;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50px;
  }

  /* styles.mediaOption */
  .mediaOption {
    align-items: center;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    justify-content: center;
    cursor: pointer;
    min-height: 32px;
    min-width: 44px;
    padding-left: 15px;
    padding-right: 15px;
  }

  /* JSS `&:last-child`, spelled out: Tooltip's wrapper makes Clip the last child of
     its own span, which would strip the wrong border. */
  .noBorder {
    border-right: none;
  }

  /* styles.mediaOptionText, over MuiTypography body1 */
  .mediaOptionText {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.46429em;
    color: #fff;
    text-align: center;
  }

  /* MuiPaper elevation 8 + MuiPopover paper + MuiMenu paper */
  .menuPaper {
    position: fixed;
    overflow-x: hidden;
    overflow-y: auto;
    min-width: 16px;
    min-height: 16px;
    max-width: calc(100% - 32px);
    max-height: calc(100% - 96px);
    background-color: #30373b;
    border-radius: 4px;
    outline: none;
    box-shadow:
      0px 5px 5px -3px rgba(0, 0, 0, 0.2),
      0px 8px 10px 1px rgba(0, 0, 0, 0.14),
      0px 3px 14px 2px rgba(0, 0, 0, 0.12);
  }

  /* MuiList root + padding */
  .menuList {
    position: relative;
    padding: 8px 0;
    margin: 0;
    list-style: none;
    outline: none;
  }

  /* MuiListItem root + gutters */
  .listItem {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    width: 100%;
    box-sizing: border-box;
    padding: 12px 16px;
    text-align: left;
    text-decoration: none;
  }

  /* MuiListItem root/button + MuiMenuItem root (typography.subheading) */
  .menuItem {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    width: auto;
    height: 24px;
    box-sizing: content-box;
    padding: 12px 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    text-decoration: none;
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.5em;
    color: #fff;
    cursor: pointer;
    user-select: none;
    transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .menuItem:hover {
    text-decoration: none;
    background-color: rgba(255, 255, 255, 0.1);
  }

  /* MuiListItem disabled + ButtonBase disabled */
  .itemDisabled {
    opacity: 0.5;
    pointer-events: none;
    cursor: default;
  }

  /* MuiDivider */
  .divider {
    height: 1px;
    margin: 0;
    border: none;
    flex-shrink: 0;
    background-color: rgba(255, 255, 255, 0.12);
  }

  /* MuiButtonBase root + MuiButton root, with the theme's text-transform: none */
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
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      border 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .muiButton:disabled {
    pointer-events: none;
    cursor: default;
    color: rgba(255, 255, 255, 0.3);
  }

  /* MuiButton label */
  .label {
    width: 100%;
    display: inherit;
    align-items: inherit;
    justify-content: inherit;
  }

  /* MuiCircularProgress, indeterminate */
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

  /* styles.menuLoading */
  .menuLoading {
    position: absolute;
    outline: none;
    z-index: 5;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  /* styles.filesItem */
  .filesItem {
    justify-content: space-between;
    opacity: 1;
  }

  /* styles.switchListItem */
  .switchListItem {
    padding: 12px 16px;
    box-sizing: content-box;
    height: 24px;
    line-height: 1;
  }

  .switchListItem span {
    font-size: 1rem;
  }

  /* styles.offlineMenuItem */
  .offlineMenuItem {
    height: unset;
    flex-direction: column;
    align-items: flex-start;
  }

  .offlineMenuItem div {
    display: flex;
  }

  .offlineMenuItem svg {
    margin-right: 8px;
  }

  /* styles.uploadButton */
  .uploadButton {
    margin-left: 12px;
    color: #fff;
    border-radius: 13px;
    font-size: 0.8rem;
    padding: 4px 12px;
    min-height: 19px;
    background-color: rgba(255, 255, 255, 0.05);
  }

  .uploadButton:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  /* styles.fakeUploadButton */
  .fakeUploadButton {
    margin-left: 12px;
    color: #fff;
    font-size: 0.8rem;
    padding: 4px 12px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* styles.copySegment */
  .copySegment {
    pointer-events: auto;
    opacity: 1;
  }

  .copySegment div {
    white-space: normal;
    padding: 0 6px;
    border-radius: 4px;
    background-color: rgba(255, 255, 255, 0.08);
    margin-right: 4px;
  }

  /* styles.shareButton */
  .shareButton {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* styles.dcameraUploadInfo, on a MUI Popper */
  .dcameraUploadInfo {
    position: fixed;
    z-index: 2000;
    text-align: center;
    border-radius: 14px;
    font-size: 0.8em;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: #272c2f;
    color: #fff;
  }

  .dcameraUploadInfo p {
    font-size: 0.8rem;
  }

  /* SwitchLoading styles.root */
  .switchLoadingRoot {
    display: flex;
    align-items: center;
  }

  /* MuiFormControlLabel root */
  .formControlLabel {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    margin-left: -14px;
    margin-right: 16px;
  }

  /* FormControlLabel wraps its label in Typography body1; switchListItem's
     `& span` overrides only the font-size, leaving body1's line-height. */
  .switchLabelText {
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.46429em;
    color: #fff;
  }

  /* MuiSwitch root */
  .switch {
    display: inline-flex;
    width: 62px;
    position: relative;
    flex-shrink: 0;
    vertical-align: middle;
  }

  /* MuiSwitchBase root, an IconButton box */
  .switchBase {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 48px;
    height: 48px;
    color: #4b5559;
    transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  /* MuiSwitch checked, colorSecondary */
  .switchChecked {
    transform: translateX(14px);
    color: #1da756;
  }

  .switchInput {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    margin: 0;
    padding: 0;
    cursor: inherit;
  }

  /* MuiSwitch icon */
  .switchIcon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: currentColor;
    box-shadow:
      0px 1px 3px 0px rgba(0, 0, 0, 0.2),
      0px 1px 1px 0px rgba(0, 0, 0, 0.14),
      0px 2px 1px -1px rgba(0, 0, 0, 0.12);
  }

  /* SwitchLoading styles.switchThumbLoading */
  .switchThumbLoading::before {
    content: '';
    display: inline-block;
    height: 100%;
    width: 100%;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" viewBox="0 0 20 20"><circle cx="50%25" cy="50%25" r="5" stroke="%23eee" fill="none" stroke-width="2" stroke-dasharray="24px 8px"></circle></svg>');
    animation: circular-rotate 1s linear infinite;
  }

  /* MuiSwitch bar */
  .switchBar {
    border-radius: 7px;
    display: block;
    position: absolute;
    width: 34px;
    height: 14px;
    top: 50%;
    left: 50%;
    margin-top: -7px;
    margin-left: -17px;
    background-color: #fff;
    opacity: 0.3;
    transition:
      opacity 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .switchBarChecked {
    background-color: #1da756;
    opacity: 0.5;
  }

  /* MuiSwitch disabled, dark palette */
  .switchDisabled {
    color: #272c2f;
  }

  .switchBarDisabled {
    background-color: #fff;
    opacity: 0.1;
  }

  /* MuiSwitch iconChecked, shadows[2] */
  .switchChecked .switchIcon {
    box-shadow:
      0px 1px 5px 0px rgba(0, 0, 0, 0.2),
      0px 2px 2px 0px rgba(0, 0, 0, 0.14),
      0px 3px 1px -2px rgba(0, 0, 0, 0.12);
  }

  /* SwitchLoading styles.errorIcon */
  .errorIcon {
    display: inline-flex;
    color: #971a25;
  }

  /* SwitchLoading styles.copiedPopover */
  .copiedPopover {
    position: fixed;
    border-radius: 16px;
    padding: 8px 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: #272c2f;
    margin-top: 12px;
    z-index: 50000;
    max-width: 95%;
  }

  .copiedPopover p {
    max-width: 400px;
    font-size: 0.9rem;
    color: #fff;
    margin: 0;
  }
</style>
