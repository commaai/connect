<script>
  import { untrack } from 'svelte';

  import { video as Video } from '$lib/api';
  import ErrorOutline from '$lib/icons/ErrorOutline.svelte';
  import { playback } from '$lib/state/playback.svelte.js';
  import { isFirefox, isIos } from '$lib/utils/browser';

  let { route = null, isMuted = false, onaudiostatuschange = undefined } = $props();

  // react-player never bundled hls.js: it fetched the pinned build from jsdelivr at
  // runtime and read the library off window.Hls. config.hlsVersion was '1.4.8'.
  const HLS_SDK_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.8/dist/hls.min.js';
  const HLS_OPTIONS = { maxBufferLength: 40 };

  // ReactPlayer held a seek made before the manifest was parsed for this long.
  const SEEK_ON_PLAY_EXPIRY = 5000;

  let videoEl = $state(null);
  let videoError = $state(null);

  let hls = null;
  let sdkRequest = null;
  // ReactPlayer's Player refused to report a duration or a current time until the
  // manifest was parsed, which is what kept syncVideo off an unloaded player.
  let isReady = false;
  let isPlaying = false;
  let startOnPlay = true;
  let seekOnPlay = null;
  let firstSeek = true;
  let wasPlaying = null;
  let lastPlaySpeed = null;

  const src = $derived(route
    ? Video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig)
    : '');
  // iOS plays the m3u8 natively; hls.js does not run there.
  const useHls = $derived(Boolean(src) && !isIos());
  const playing = $derived(Boolean(route && playback.desiredPlaySpeed));

  // Leading-edge debounce: run immediately, then ignore calls until `wait` ms after the last one.
  function debounceLeading(func, wait) {
    let timeout = null;
    let timestamp;

    function later() {
      const last = Date.now() - timestamp;
      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
      }
    }

    return function debounced(...args) {
      timestamp = Date.now();
      const callNow = !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        return func(...args);
      }
      return undefined;
    };
  }

  function loadHlsSdk() {
    if (window.Hls) {
      return Promise.resolve(window.Hls);
    }
    if (!sdkRequest) {
      sdkRequest = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = HLS_SDK_URL;
        script.async = true;
        script.onload = () => resolve(window.Hls);
        script.onerror = (err) => {
          sdkRequest = null;
          script.remove();
          reject(err);
        };
        document.head.appendChild(script);
      });
    }
    return sdkRequest;
  }

  function getDuration() {
    if (!isReady || !videoEl) {
      return null;
    }
    const { duration, seekable } = videoEl;
    if (duration === Infinity && seekable.length > 0) {
      return seekable.end(seekable.length - 1);
    }
    return duration;
  }

  function getCurrentTime() {
    if (!isReady || !videoEl) {
      return null;
    }
    return videoEl.currentTime;
  }

  function getVideoState() {
    const currentTime = getCurrentTime();
    const { buffered } = videoEl;

    let bufferRemaining = -1;
    for (let i = 0; i < buffered.length; i += 1) {
      const end = buffered.end(i);
      if (currentTime >= buffered.start(i) && currentTime <= end) {
        bufferRemaining = end - currentTime;
        break;
      }
    }

    return {
      bufferRemaining,
      hasLoaded: bufferRemaining > 0,
    };
  }

  function currentVideoTime(offset = playback.currentOffset()) {
    if (!route) {
      return 0;
    }

    if (route.videoStartOffset) {
      offset -= route.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  /**
   * @param {any} e hls.js error data
   */
  function onHlsError(e) {
    playback.bufferVideo(true);

    if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // buffer but no error
      return;
    }

    if (e.type === 'networkError' && (e.response?.code === 404)) {
      videoError = 'This video segment has not uploaded yet or has been deleted.';
    } else {
      videoError = 'Unable to load video';
    }
  }

  /**
   * @param {Error|Event|string} e
   * @param {any} [data]
   */
  function onVideoError(e, data) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      onHlsError(data);
      return;
    }

    if (e.name === 'AbortError') {
      // ignore
      return;
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

    playback.bufferVideo(true);

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      videoError = 'Unable to load video. Check network connection.';
      return;
    }

    videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
  }

  function onVideoResume() {
    if (videoError) {
      videoError = null;
    }
  }

  function setPlaybackRate(rate) {
    try {
      videoEl.playbackRate = rate;
    } catch (err) {
      onVideoError(err);
    }
  }

  function play() {
    const playRes = videoEl.play();
    if (playRes) {
      playRes.catch(onVideoError);
    }
  }

  function seekTo(seconds) {
    if (!isReady) {
      // the player is not loaded yet, replay the seek once it starts
      if (seconds !== 0) {
        seekOnPlay = seconds;
        setTimeout(() => {
          seekOnPlay = null;
        }, SEEK_ON_PLAY_EXPIRY);
      }
      return;
    }
    videoEl.currentTime = seconds;
  }

  function onPlayerReady() {
    if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
      if (videoEl?.audioTracks?.length > 0) {
        onaudiostatuschange?.(true);
      }
    } else if (hls) { // on other platforms, inspect audio tracks before hls.js changes things
      hls.on('hlsBufferCodecs', (event, data) => {
        onaudiostatuschange?.(!!data.audio);
      });
    }
  }

  // MANIFEST_PARSED for hls.js, canplay for the native branch.
  function handleReady() {
    isReady = true;
    onPlayerReady();
    if (playing) {
      play();
    }
  }

  function handlePlay() {
    isPlaying = true;
    if (startOnPlay) {
      const rate = playback.desiredPlaySpeed;
      if (rate !== 1) {
        setPlaybackRate(rate);
      }
      startOnPlay = false;
    }
    onVideoResume();
    if (seekOnPlay) {
      seekTo(seekOnPlay);
      seekOnPlay = null;
    }
  }

  function handlePause() {
    isPlaying = false;
  }

  function onVideoBuffering() {
    if (!videoEl || !route || !getDuration()) {
      playback.bufferVideo(true);
    }

    if (firstSeek) {
      firstSeek = false;
      seekTo(currentVideoTime());
    }

    const { hasLoaded } = getVideoState();
    if (!hasLoaded || videoEl.readyState < 2) {
      playback.bufferVideo(true);
    }
  }

  function syncVideoNow() {
    if (!videoEl || !getDuration()) {
      return;
    }

    let newPlaybackRate = playback.desiredPlaySpeed;
    const desiredVideoTime = currentVideoTime();
    const curVideoTime = getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;

    if (Math.abs(timeDiff) <= Math.max(0.1, 0.5 * newPlaybackRate)) { // newPlaybackRate = 0 when paused, set minimum 0.1 to prevent seeking when paused
      if (!isIos()) {
        newPlaybackRate = Math.max(0, newPlaybackRate + Math.round(timeDiff * 10) / 10);
      }
    } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== getDuration()) {
      // logs start earlier than video, so skip to video ts 0
      playback.seek(playback.currentOffset() - (timeDiff * 1000));
    } else {
      seekTo(desiredVideoTime);
    }
    // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x causing audio to cut in and out with timeDiff rate shifts
    newPlaybackRate = Math.max(0, Math.min((isFirefox() && !isMuted) ? 8 : 16, newPlaybackRate));

    const { hasLoaded } = getVideoState();
    if (playback.isBufferingVideo && videoEl.readyState >= 4) {
      playback.bufferVideo(false);
    } else if (playback.isBufferingVideo || !hasLoaded || videoEl.readyState < 2) {
      if (!playback.isBufferingVideo) {
        playback.bufferVideo(true);
      }
      newPlaybackRate = 0; // in some circumstances, iOS won't update readyState unless temporarily paused
    }

    if (hls) {
      if (!videoEl.paused && newPlaybackRate === 0) {
        videoEl.pause();
      } else if (videoEl.playbackRate !== newPlaybackRate && newPlaybackRate !== 0) {
        videoEl.playbackRate = newPlaybackRate;
      }
      if (videoEl.paused && newPlaybackRate !== 0) {
        const playRes = videoEl.play();
        if (playRes) {
          playRes.catch(() => console.debug('[DriveVideo] play interrupted by pause'));
        }
      }
    } else {
      // TODO: fix iOS bug where video doesn't stop buffering while paused
      videoEl.playbackRate = newPlaybackRate;
    }
  }

  const syncVideo = debounceLeading(syncVideoNow, 200);

  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function loadSource(el, url) {
    videoError = null;
    // Player.componentDidUpdate re-armed the one-shot playback-rate set per url
    startOnPlay = true;

    if (!useHls) {
      // FilePlayer set the src attribute and loaded the element itself
      el.load();
      return;
    }

    loadHlsSdk().then((Hls) => {
      if (videoEl !== el || src !== url) {
        return;
      }
      hls = new Hls(HLS_OPTIONS);
      hls.on(Hls.Events.MANIFEST_PARSED, handleReady);
      hls.on(Hls.Events.ERROR, (event, data) => onVideoError('hlsError', data));
      hls.loadSource(url);
      hls.attachMedia(el);
    }).catch((err) => {
      console.error('[DriveVideo] could not load hls.js', err);
    });
  }

  // componentDidUpdate re-ran syncVideo after every store change; this is read
  // only to subscribe to the fields it looks at.
  const syncKey = $derived([
    route?.fullname,
    isMuted,
    playback.offset,
    playback.startTime,
    playback.desiredPlaySpeed,
    playback.isBufferingVideo,
  ].join('|'));

  $effect(() => {
    const el = videoEl;
    const url = src;
    if (!url) {
      // updateVideoSource dropped the error along with the source
      videoError = null;
      return;
    }
    if (!el) return;

    untrack(() => loadSource(el, url));
    return () => destroyHls();
  });

  // Player.componentDidUpdate drove play/pause off the `playing` prop; the first
  // run is the mount, where the autoplay attribute and handleReady cover it.
  $effect(() => {
    const want = playing;
    untrack(() => {
      if (!videoEl) { wasPlaying = null; return; }
      const prev = wasPlaying;
      wasPlaying = want;
      if (prev === null) return;
      if (!prev && want && !isPlaying) {
        play();
      } else if (prev && !want && isPlaying) {
        videoEl.pause();
      }
    });
  });

  // ...and the playbackRate prop the same way.
  $effect(() => {
    const rate = playback.desiredPlaySpeed;
    untrack(() => {
      const prev = lastPlaySpeed;
      lastPlaySpeed = rate;
      if (prev === null || prev === rate || !videoEl) return;
      setPlaybackRate(rate);
    });
  });

  $effect(() => {
    untrack(syncVideo);
    const intv = setInterval(syncVideo, 500);
    return () => clearInterval(intv);
  });

  $effect(() => {
    if (syncKey.length) {
      untrack(syncVideo);
    }
  });
</script>

<div class="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
  {#if videoError || playback.isBufferingVideo}
    <div class="z-50 absolute h-full w-full bg-page/67">
      <div class="relative text-center top-[calc(50%_-_25px)]">
        {#if videoError}
          <ErrorOutline class="mb-2 inline-block shrink-0 select-none" />
          <!-- Typography body1 -->
          <p style="display: block; margin: 0; font-size: 0.875rem; font-weight: 400; line-height: 1.46429em; color: var(--c-ink)">
            {videoError}
          </p>
        {:else}
          <!-- MuiCircularProgress, indeterminate, size={50} thickness={4} -->
          <div class="circularProgress" role="progressbar" style="width: 50px; height: 50px; color: var(--c-ink)">
            <svg viewBox="22 22 44 44">
              <circle class="circle" cx="44" cy="44" r="20" fill="none" stroke-width="4" />
            </svg>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <!-- ReactPlayer's wrapper, width/height 100%; it rendered no player without a url -->
  <div style="width: 100%; height: 100%">
    {#if src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoEl}
        src={useHls ? undefined : src}
        muted={isMuted}
        style="width: 100%; height: 100%"
        preload="auto"
        autoplay={playing || undefined}
        playsinline
        webkit-playsinline=""
        x5-playsinline=""
        oncanplay={useHls ? undefined : handleReady}
        onwaiting={onVideoBuffering}
        onplaying={onVideoResume}
        onplay={handlePlay}
        onpause={handlePause}
        onerror={onVideoError}
      ></video>
    {/if}
  </div>
</div>

<style>
  /* MuiCircularProgress root + indeterminate */
  .circularProgress {
    display: inline-block;
    line-height: 1;
    animation: mui-progress-circular-rotate 1.4s linear infinite;
  }

  /* MuiCircularProgress circle + circleIndeterminate */
  .circle {
    stroke: currentColor;
    stroke-dasharray: 80px, 200px;
    stroke-dashoffset: 0px;
    animation: mui-progress-circular-dash 1.4s ease-in-out infinite;
  }

  @keyframes mui-progress-circular-rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes mui-progress-circular-dash {
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
