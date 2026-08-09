<script>
  import { untrack } from 'svelte';

  import SettingsMenu from './SettingsMenu.svelte';

  const LATENCY_BUFFER_SIZE = 10;
  const LATENCY_HISTORY_MAX = 60;

  const STATS_INTERVAL_MS = 1000;

  const PACKET_LOSS_POOR = 0.02;
  const RTT_POOR_MS = 250;

  const QUALITY_INDICATOR = {
    good: { color: '#22c967', label: 'connected' },
    poor: { color: '#f5c542', label: 'poor connection' },
  };

  const STATS_ROWS = [
    { label: 'FPS', key: 'fps', showInCompact: false },
    { label: 'Bitrate', key: 'bitrate' },
    { label: 'RTT', key: 'rtt' },
    { label: 'Loss', key: 'packetLoss' },
  ];

  const LATENCY_LAYERS = [
    { label: 'Capture/Encode', key: 'captureEncodeMs', color: 'rgba(76,175,80,1)', labelColor: 'rgba(76,175,80,1)' },
    { label: 'Network', key: 'networkMs', color: 'rgba(66,165,245,1)', labelColor: 'rgba(66,165,245,1)' },
  ];

  // prewarm the latency display so the graph shows a sensible band before the first real sample arrives
  const INITIAL_LATENCY = {
    captureEncodeMs: 45,
    sendDelayMs: 3,
    networkMs: 20,
    totalMs: 68,
  };

  const BATTERY_FULL = 'M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z';
  const BATTERY_CHARGING_FULL = 'M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM11 20v-5.5H9L13 7v5.5h2L11 20z';

  let {
    connection = null,
    connectionState = 'none',
    battery = null,
    isLandscape = false,
    // Plain `{ current }` box, like React's latencyCallbackRef: the page routes
    // the connection's raw samples into whatever is installed here.
    latencyCallbackRef = null,
    class: className = '',
    onqualitychange,
  } = $props();

  let showStats = $state(false);
  let stats = $state(null);
  let latency = $state(INITIAL_LATENCY);
  let latencyHistory = $state([INITIAL_LATENCY]);
  let connectionQuality = $state('good');
  let statsWrapper = $state(null);
  let latencyCanvas = $state(null);

  let latencyBuffer = [];
  let firstLatencyShown = false;
  const polling = {
    prevTimestamp: null,
    prevBytes: null,
    prevFrames: null,
    prevPacketsLost: null,
    prevPacketsReceived: null,
    mediaStarted: false,
  };

  const indicator = $derived(QUALITY_INDICATOR[connectionQuality] || QUALITY_INDICATOR.good);
  const compact = $derived(isLandscape && window.matchMedia('(max-height: 500px)').matches);
  const textSize = $derived(compact ? 'text-[9px]' : 'text-[10px] md:text-[13px]');

  function pushLatency(raw) {
    if (!firstLatencyShown) {
      firstLatencyShown = true;
      latency = raw;
      latencyHistory = [...latencyHistory, raw].slice(-LATENCY_HISTORY_MAX);
    }
    latencyBuffer.push(raw);
    if (latencyBuffer.length >= LATENCY_BUFFER_SIZE) {
      const buf = latencyBuffer;
      latencyBuffer = [];
      const avg = {};
      for (const key of ['captureEncodeMs', 'networkMs', 'totalMs']) {
        const vals = buf.map((l) => l[key]).filter((v) => v != null);
        avg[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }
      latency = avg;
      latencyHistory = [...latencyHistory, avg].slice(-LATENCY_HISTORY_MAX);
    }
  }

  $effect(() => {
    const box = latencyCallbackRef;
    if (!box) return undefined;
    box.current = pushLatency;
    return () => { box.current = null; };
  });

  function readRtt(report) {
    let pair = null;
    report.forEach((stat) => {
      if (stat.type === 'transport' && stat.selectedCandidatePairId) pair = report.get(stat.selectedCandidatePairId);
    });
    // fallback for browsers that don't set transport.selectedCandidatePairId
    if (!pair) {
      report.forEach((stat) => {
        if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') pair = stat;
      });
    }
    return pair?.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null;
  }

  async function pollStats() {
    const pc = connection?.pc;
    if (!pc) return;
    const ref = polling;
    try {
      const report = await pc.getStats();
      let videoStats = null;
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') videoStats = stat;
      });
      const rttMs = readRtt(report);
      const rttPoor = rttMs != null && rttMs > RTT_POOR_MS;
      if (!videoStats) {
        if (ref.mediaStarted) connectionQuality = 'poor';
        stats = { ...stats, rtt: rttMs != null ? `${Math.round(rttMs)} ms` : '--' };
        return;
      }

      const now = videoStats.timestamp;
      let bitrate = 0;
      let fps = 0;
      let lossRatio = 0;
      let poor = false;
      if (ref.prevTimestamp !== null) {
        const elapsed = (now - ref.prevTimestamp) / 1000;
        if (elapsed > 0) {
          bitrate = ((videoStats.bytesReceived - ref.prevBytes) * 8) / elapsed;
          fps = (videoStats.framesDecoded - ref.prevFrames) / elapsed;
        }
        if (ref.prevPacketsLost !== null && ref.prevPacketsReceived !== null && videoStats.packetsLost != null && videoStats.packetsReceived != null) {
          const lostDelta = videoStats.packetsLost - ref.prevPacketsLost;
          const recvDelta = videoStats.packetsReceived - ref.prevPacketsReceived;
          const total = lostDelta + recvDelta;
          if (total > 0) lossRatio = lostDelta / total;
        }
        if (bitrate > 0) ref.mediaStarted = true;
        poor = (ref.mediaStarted && bitrate === 0) || lossRatio > PACKET_LOSS_POOR;
      }
      connectionQuality = poor || rttPoor ? 'poor' : 'good';
      ref.prevTimestamp = now;
      ref.prevBytes = videoStats.bytesReceived;
      ref.prevFrames = videoStats.framesDecoded;
      ref.prevPacketsLost = videoStats.packetsLost ?? ref.prevPacketsLost;
      ref.prevPacketsReceived = videoStats.packetsReceived ?? ref.prevPacketsReceived;

      stats = {
        fps: fps.toFixed(1),
        bitrate: bitrate > 1000000
          ? `${(bitrate / 1000000).toFixed(2)} Mbps`
          : `${(bitrate / 1000).toFixed(0)} kbps`,
        rtt: rttMs != null ? `${Math.round(rttMs)} ms` : '--',
        packetLoss: `${(lossRatio * 100).toFixed(1)}%`,
        jitter: videoStats.jitter !== undefined ? `${(videoStats.jitter * 1000).toFixed(1)} ms` : '?',
      };
    } catch (err) {
      console.warn('pollStats failed:', err);
      if (ref.mediaStarted) connectionQuality = 'poor';
    }
  }

  $effect(() => {
    const isConnected = connectionState === 'connected';
    // pollStats both reads and writes `stats`, so the first sample has to stay
    // out of this effect's dependencies.
    untrack(() => {
      if (isConnected) {
        Object.assign(polling, {
          prevTimestamp: null,
          prevBytes: null,
          prevFrames: null,
          prevPacketsLost: null,
          prevPacketsReceived: null,
          mediaStarted: false,
        });
        connectionQuality = 'good';
        pollStats();
      } else {
        latencyBuffer = [];
        firstLatencyShown = false;
        stats = null;
        latency = INITIAL_LATENCY;
        latencyHistory = [INITIAL_LATENCY];
        connectionQuality = 'good';
      }
    });

    if (!isConnected) return undefined;
    const interval = setInterval(pollStats, STATS_INTERVAL_MS);
    return () => clearInterval(interval);
  });

  function toggleStats() {
    showStats = !showStats;
    connection?.setTimingSei(showStats);
  }

  function closeStats() {
    if (showStats) connection?.setTimingSei(false);
    showStats = false;
  }

  // useClickOutside: the listener is only attached while the panel is open.
  $effect(() => {
    if (!showStats) return undefined;
    const onDown = (e) => {
      if (statsWrapper && !statsWrapper.contains(e.target)) closeStats();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  function drawLatencyGraph(canvas, history) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const newW = w * dpr;
    const newH = h * dpr;
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(10, ...history.map((l) => (l.totalMs != null ? l.totalMs : l.devicePipelineMs) || 0));
    const yScale = (h - 2) / (maxVal * 1.35);
    const xStep = w / Math.max(history.length - 1, 1);

    const cums = history.map((l) => {
      let sum = 0;
      return LATENCY_LAYERS.map(({ key }) => {
        const v = l[key];
        sum += (v != null && v > 0) ? v : 0;
        return sum;
      });
    });

    for (let li = LATENCY_LAYERS.length - 1; li >= 0; li--) {
      ctx.beginPath();
      for (let i = 0; i < cums.length; i++) {
        const x = i * xStep;
        const y = h - cums[i][li] * yScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      // a single sample has no width, so extend it across the full canvas as a flat band
      if (cums.length === 1) ctx.lineTo(w, h - cums[0][li] * yScale);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = LATENCY_LAYERS[li].color;
      ctx.fill();
    }

    const peakY = h - maxVal * yScale;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, peakY);
    ctx.lineTo(w, peakY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(maxVal)} ms`, 3, peakY - 1);
  }

  $effect(() => {
    // `compact` swaps the canvas size classes, so it has to redraw as well
    void compact;
    const canvas = latencyCanvas;
    if (canvas) drawLatencyGraph(canvas, latencyHistory);
  });

  const fmtMs = (v) => (v != null ? `${v.toFixed(1)} ms` : '--');
</script>

<div class={className}>
  <div class="flex items-center mr-auto md:mr-0 gap-2 h-10 pl-3.5 md:p-1">
    <div
      class="w-3 h-3 rounded-full transition-colors"
      style="background-color: {indicator.color}"
      title={indicator.label}
    ></div>
    <span class="text-base hidden xxs:inline text-white/70">{stats?.rtt ?? '--'}</span>
  </div>
  {#if battery}
    <div class="flex items-center justify-center gap-2 h-10 px-3.5">
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        width="1em"
        height="1em"
        style="font-size: 20px; color: rgba(255, 255, 255, 0.7); display: inline-block; flex-shrink: 0"
        aria-hidden="true"
        focusable="false"
      ><path d={battery.charging ? BATTERY_CHARGING_FULL : BATTERY_FULL} /></svg>
      <span class="text-base text-white/70 w-9">{battery.level}%</span>
    </div>
  {/if}
  <div bind:this={statsWrapper}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="group flex items-center justify-center h-9 px-3.5 rounded-[18px] cursor-pointer select-none bg-glass hover:!bg-black/60"
      onclick={toggleStats}
      title="Toggle stats"
    >
      <span class="text-[13px] font-semibold tracking-[0.5px] uppercase text-center leading-none text-white/60 group-hover:text-white/90">stats</span>
    </div>
    {#if showStats}
      <div class="absolute z-30 right-2 mt-2 flex bg-glass-dark backdrop-blur-[3px] rounded-[5px] md:rounded-[10px] font-mono {compact ? 'flex-row gap-2 items-center p-[6px_8px]' : 'flex-col w-[150px] md:w-[240px] p-[3px_6px] md:p-[10px_16px]'}">
        <div class="flex flex-col">
          {#each STATS_ROWS as { label, key, showInCompact } (key)}
            {#if !(showInCompact === false && compact)}
              <div class="flex justify-between leading-tight md:py-[3px]">
                <span class="{textSize} text-white/45 mr-1.5">{label}</span>
                <span class="{textSize} text-white/[0.85] text-right min-w-16">{stats?.[key] ?? '--'}</span>
              </div>
            {/if}
          {/each}
        </div>
        {#if !compact}<div class="h-px bg-white/[0.08] my-px md:my-[5px]"></div>{/if}
        <div>
          {#if !compact}<div class="text-[7px] font-bold text-white/35 tracking-[0.5px] leading-tight py-[2px] pb-px md:text-[11px]">FRAME LATENCY</div>{/if}
          {#each LATENCY_LAYERS as { label, key, labelColor } (label)}
            <div class="flex justify-between leading-tight md:py-[3px]">
              <span class="{textSize} mr-1.5 md:mr-[20px]" style="color: {labelColor}">{label}</span>
              <span class="{textSize} text-nowrap text-white/[0.85] text-right">{fmtMs(latency?.[key])}</span>
            </div>
          {/each}
          <div class="flex justify-between leading-tight md:py-[3px]">
            <span class="{textSize} mr-1.5 md:mr-[18px]" style="font-weight: 700; color: rgba(255,255,255,0.65)">Frame Latency</span>
            <span class="{textSize} text-white/[0.85] text-right" style="font-weight: 700">{fmtMs(latency?.totalMs)}</span>
          </div>
        </div>
        <canvas
          bind:this={latencyCanvas}
          class="{compact ? 'w-[100px] self-stretch' : 'w-full h-[30px] md:h-[90px] mt-1'} rounded-[3px] bg-black/30 md:rounded-[6px]"
        ></canvas>
        {#if !compact}<div class="h-px bg-white/[0.08] my-px md:my-[5px]"></div>{/if}
      </div>
    {/if}
  </div>
  <SettingsMenu {onqualitychange} />
</div>
