import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import BatteryFull from '@material-ui/icons/BatteryFull';
import BatteryChargingFull from '@material-ui/icons/BatteryChargingFull';
import SettingsMenu from './SettingsMenu';
import { useClickOutside } from '../../hooks/useClickOutside';

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
  { label: 'Resolution', key: 'resolution' },
  { label: 'FPS', key: 'fps' },
  { label: 'Bitrate', key: 'bitrate' },
  { label: 'RTT', key: 'rtt'}
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


// round-trip time from the active ICE candidate pair (seconds -> ms)
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

const useStats = (connection, connectionState, latencyCallbackRef) => {
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [latency, setLatency] = useState(INITIAL_LATENCY);
  const [latencyHistory, setLatencyHistory] = useState([INITIAL_LATENCY]);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const latencyBufferRef = useRef([]);
  const firstLatencyShownRef = useRef(false);
  const statsPollingRef = useRef({
    interval: null, prevTimestamp: null, prevBytes: null, prevFrames: null,
    prevPacketsLost: null, prevPacketsReceived: null, mediaStarted: false,
  });

  useEffect(() => {
    latencyCallbackRef.current = (raw) => {
      if (!firstLatencyShownRef.current) {
        firstLatencyShownRef.current = true;
        setLatency(raw);
        setLatencyHistory((prev) => [...prev, raw].slice(-LATENCY_HISTORY_MAX));
      }
      latencyBufferRef.current.push(raw);
      if (latencyBufferRef.current.length >= LATENCY_BUFFER_SIZE) {
        const buf = latencyBufferRef.current;
        latencyBufferRef.current = [];
        const avg = {};
        for (const key of ['captureEncodeMs', 'networkMs', 'totalMs']) {
          const vals = buf.map((l) => l[key]).filter((v) => v != null);
          avg[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }
        setLatency(avg);
        setLatencyHistory((prev) => [...prev, avg].slice(-LATENCY_HISTORY_MAX));
      }
    };
    return () => { latencyCallbackRef.current = null; };
  }, [latencyCallbackRef]);

  const pollStats = useCallback(async () => {
    const pc = connection?.pc;
    if (!pc) return;
    const ref = statsPollingRef.current;
    try {
      const report = await pc.getStats();
      let videoStats = null;
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') videoStats = stat;
      });
      const rttMs = readRtt(report);
      const rttPoor = rttMs != null && rttMs > RTT_POOR_MS;
      // once media has flowed, losing the video stats entirely means the stream died
      if (!videoStats) { if (ref.mediaStarted) setConnectionQuality('poor'); return; }

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
        // stalled stream (no bytes after media started) or elevated packet loss is a poor link
        poor = (ref.mediaStarted && bitrate === 0) || lossRatio > PACKET_LOSS_POOR;
      }
      // high round-trip time degrades teleop responsiveness even when video is flowing cleanly
      setConnectionQuality(poor || rttPoor ? 'poor' : 'good');
      ref.prevTimestamp = now;
      ref.prevBytes = videoStats.bytesReceived;
      ref.prevFrames = videoStats.framesDecoded;
      ref.prevPacketsLost = videoStats.packetsLost ?? ref.prevPacketsLost;
      ref.prevPacketsReceived = videoStats.packetsReceived ?? ref.prevPacketsReceived;

      setStats({
        resolution: `${videoStats.frameWidth || '?'}x${videoStats.frameHeight || '?'}`,
        fps: fps.toFixed(1),
        bitrate: bitrate > 1000000
          ? `${(bitrate / 1000000).toFixed(2)} Mbps`
          : `${(bitrate / 1000).toFixed(0)} kbps`,
        rtt: rttMs != null ? `${Math.round(rttMs)} ms` : '--',
        jitter: videoStats.jitter !== undefined ? `${(videoStats.jitter * 1000).toFixed(1)} ms` : '?',
      });
    } catch (err) {
      console.warn('pollStats failed:', err);
      if (ref.mediaStarted) setConnectionQuality('poor');
    }
  }, [connection]);

  useEffect(() => {
    const ref = statsPollingRef.current;
    if (connectionState === 'connected') {
      ref.prevTimestamp = null;
      ref.prevBytes = null;
      ref.prevFrames = null;
      ref.prevPacketsLost = null;
      ref.prevPacketsReceived = null;
      ref.mediaStarted = false;
      setConnectionQuality('good');
      pollStats();
      ref.interval = setInterval(pollStats, STATS_INTERVAL_MS);
    } else {
      if (ref.interval) clearInterval(ref.interval);
      ref.interval = null;
      latencyBufferRef.current = [];
      firstLatencyShownRef.current = false;
      setStats(null);
      setLatency(INITIAL_LATENCY);
      setLatencyHistory([INITIAL_LATENCY]);
      setConnectionQuality('good');
    }
    return () => {
      if (ref.interval) clearInterval(ref.interval);
      ref.interval = null;
    };
  }, [connectionState, pollStats]);

  const toggleStats = useCallback(() => {
    setShowStats((prev) => {
      const next = !prev;
      connection?.setTimingSei(next);
      return next;
    });
  }, [connection]);

  const closeStats = useCallback(() => {
    setShowStats((prev) => {
      if (prev) connection?.setTimingSei(false);
      return false;
    });
  }, [connection]);

  return { showStats, toggleStats, closeStats, stats, latency, latencyHistory, connectionQuality };
}

function drawLatencyGraph(canvas, latencyHistory) {
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

  const maxVal = Math.max(10, ...latencyHistory.map((l) => (l.totalMs != null ? l.totalMs : l.devicePipelineMs) || 0));
  const yScale = (h - 2) / (maxVal * 1.35);
  const xStep = w / Math.max(latencyHistory.length - 1, 1);

  const cums = latencyHistory.map((l) => {
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

export const StatsPanel = ({ isLandscape, stats, latency, latencyHistory }) => {
  const latencyCanvasRef = useRef(null);
  const compact = useMemo(() => isLandscape && window.matchMedia('(max-height: 500px)').matches, [isLandscape]);

  useEffect(() => {
    const canvas = latencyCanvasRef.current;
    if (!canvas) return;
    drawLatencyGraph(canvas, latencyHistory);
  }, [latencyHistory, compact]);

  const fmtMs = (v) => (v != null ? `${v.toFixed(1)} ms` : '--');
  const textSize = compact ? "text-[9px]" : "text-[10px] md:text-[13px]"

  return (
    <div className={
      `absolute z-30 right-2 mt-2 flex bg-glass-dark backdrop-blur-[3px] rounded-[5px] md:rounded-[10px] font-mono
      ${compact ? "flex-row gap-2 items-center p-[6px_8px]" : "flex-col w-[150px] md:w-[240px] p-[3px_6px] md:p-[10px_16px]"}
    `}>
      <div className="flex flex-col">
        {STATS_ROWS.map(({ label, key }) => (
          <div key={key} className="flex justify-between leading-tight md:py-[3px]">
            <span className={`${textSize} text-white/45 mr-1.5 md:mr-[18px]`}>{label}</span>
            <span className={`${textSize} text-white/[0.85] text-right`}>{stats?.[key] ?? '--'}</span>
          </div>
        ))}
      </div>
      {!compact && <div className="h-px bg-white/[0.08] my-px md:my-[5px]" />}
      <div>
        {!compact && <div className="text-[7px] font-bold text-white/35 tracking-[0.5px] leading-tight py-[2px] pb-px md:text-[11px]">{"FRAME LATENCY"}</div>}
        {LATENCY_LAYERS.map(({ label, key, labelColor }) => (
          <div key={label} className="flex justify-between leading-tight md:py-[3px]">
            <span className={`${textSize} mr-1.5 md:mr-[20px]`} style={{ color: labelColor }}>{label}</span>
            <span className={`${textSize} text-nowrap text-white/[0.85] text-right`}>{fmtMs(latency?.[key])}</span>
          </div>
        ))}
        <div className="flex justify-between leading-tight md:py-[3px]">
          <span className={`${textSize} mr-1.5 md:mr-[18px]`} style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Frame Latency</span>
          <span className={`${textSize} text-white/[0.85] text-right`} style={{ fontWeight: 700 }}>{fmtMs(latency?.totalMs)}</span>
        </div>
      </div>
      <canvas ref={latencyCanvasRef} className={`${compact ? "w-[100px] self-stretch": "w-full h-[30px] md:h-[90px] mt-1"} rounded-[3px] bg-black/30 md:rounded-[6px]`} />
      {!compact && <div className="h-px bg-white/[0.08] my-px md:my-[5px]" />}
    </div>
  );
};


const StatsMenu = ({
  isLandscape, showStats, toggleStats, closeStats, stats, latency, latencyHistory,
}) => {
  const wrapperRef = useRef(null);
  useClickOutside(wrapperRef, showStats, closeStats);

  return (
    <div ref={wrapperRef}>
      <div
        className="group flex items-center justify-center h-9 px-3.5 rounded-[18px] cursor-pointer select-none bg-glass hover:!bg-black/60"
        onClick={toggleStats}
        title="Toggle stats"
      >
        <span className="text-[13px] font-semibold tracking-[0.5px] uppercase text-center leading-none text-white/60 group-hover:text-white/90">
          stats
        </span>
      </div>
      {showStats && (
        <StatsPanel isLandscape={isLandscape} stats={stats} latency={latency} latencyHistory={latencyHistory} />
      )}
    </div>
  );
};

const StatusBar = ({
  battery, className, isLandscape, connection, connectionState, latencyCallbackRef, onQualityChange,
}) => {
  const {
    showStats, toggleStats, closeStats, stats, latency, latencyHistory, connectionQuality,
  } = useStats(connection, connectionState, latencyCallbackRef);
  const BatteryIcon = battery?.charging ? BatteryChargingFull : BatteryFull;
  const indicator = QUALITY_INDICATOR[connectionQuality] || QUALITY_INDICATOR.good;

  return (
    <div className={className}>
      <div className="flex items-center mr-auto md:mr-0 gap-2 h-10 pl-3.5 md:p-1">
        <div
          className="w-3 h-3 rounded-full transition-colors"
          style={{ backgroundColor: indicator.color }}
          title={indicator.label}
        />
        <span className="text-base hidden xxs:inline text-white/70">{stats?.rtt ?? '--'}</span>
      </div>
      {battery && (
        <div className="flex items-center justify-center gap-2 h-10 px-3.5">
          <BatteryIcon style={{ fontSize: 20, color: 'rgba(255, 255, 255, 0.7)' }} />
          <span className="text-base text-white/70 w-9">{battery.level}%</span>
        </div>
      )}
      <StatsMenu
        isLandscape={isLandscape}
        showStats={showStats}
        toggleStats={toggleStats}
        closeStats={closeStats}
        stats={stats}
        latency={latency}
        latencyHistory={latencyHistory}
      />
      <SettingsMenu onQualityChange={onQualityChange} />
    </div>
  );
};

export default StatusBar;
