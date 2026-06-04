import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import BatteryFull from '@material-ui/icons/BatteryFull';
import BatteryChargingFull from '@material-ui/icons/BatteryChargingFull';
import SettingsMenu from './SettingsMenu';

const LATENCY_BUFFER_SIZE = 10;
const LATENCY_HISTORY_MAX = 60;

const STATS_ROWS = [
  { label: 'Resolution', key: 'resolution' },
  { label: 'FPS', key: 'fps' },
  { label: 'Bitrate', key: 'bitrate' },
  { label: 'Jitter', key: 'jitter' },
];

const STATS_ROWS_COMPACT = STATS_ROWS.filter(({ key }) => key === 'fps' || key === 'bitrate');

const LATENCY_LAYERS = [
  { label: 'Capture/Encode', key: 'captureEncodeMs', color: 'rgba(76,175,80,0.55)', labelColor: 'rgba(76,175,80,0.7)' },
  { label: 'Send delay', key: 'sendDelayMs', color: 'rgba(171,71,188,0.45)', labelColor: 'rgba(171,71,188,0.65)' },
  { label: 'Network', key: 'networkMs', color: 'rgba(66,165,245,0.55)', labelColor: 'rgba(66,165,245,0.7)' },
];


export const useStats = (connection, connectionState, latencyCallbackRef) => {
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [latency, setLatency] = useState(null);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const latencyBufferRef = useRef([]);
  const firstLatencyShownRef = useRef(false);
  const statsPollingRef = useRef({ interval: null, prevTimestamp: null, prevBytes: null, prevFrames: null });

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
        for (const key of ['captureEncodeMs', 'sendDelayMs', 'devicePipelineMs', 'networkMs', 'totalMs']) {
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
    try {
      const report = await pc.getStats();
      let videoStats = null;
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') videoStats = stat;
      });
      if (!videoStats) return;

      const ref = statsPollingRef.current;
      const now = videoStats.timestamp;
      let bitrate = 0;
      let fps = 0;
      if (ref.prevTimestamp !== null) {
        const elapsed = (now - ref.prevTimestamp) / 1000;
        if (elapsed > 0) {
          bitrate = ((videoStats.bytesReceived - ref.prevBytes) * 8) / elapsed;
          fps = (videoStats.framesDecoded - ref.prevFrames) / elapsed;
        }
      }
      ref.prevTimestamp = now;
      ref.prevBytes = videoStats.bytesReceived;
      ref.prevFrames = videoStats.framesDecoded;

      setStats({
        resolution: `${videoStats.frameWidth || '?'}x${videoStats.frameHeight || '?'}`,
        fps: fps.toFixed(1),
        bitrate: bitrate > 1000000
          ? `${(bitrate / 1000000).toFixed(2)} Mbps`
          : `${(bitrate / 1000).toFixed(0)} kbps`,
        jitter: videoStats.jitter !== undefined ? `${(videoStats.jitter * 1000).toFixed(1)} ms` : '?',
      });
    } catch (err) {
      console.warn('pollStats failed:', err);
    }
  }, [connection]);

  useEffect(() => {
    const ref = statsPollingRef.current;
    if (connectionState === 'connected') {
      ref.prevTimestamp = null;
      ref.prevBytes = null;
      ref.prevFrames = null;
      pollStats();
      ref.interval = setInterval(pollStats, 1000);
    } else {
      if (ref.interval) clearInterval(ref.interval);
      ref.interval = null;
      latencyBufferRef.current = [];
      firstLatencyShownRef.current = false;
      setStats(null);
      setLatency(null);
      setLatencyHistory([]);
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

  return { showStats, toggleStats, closeStats, stats, latency, latencyHistory };
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
  const yScale = (h - 2) / (maxVal * 1.15);
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

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '8px monospace';
}

export const StatsPanel = ({isLandscape, stats, latency, latencyHistory }) => {
  const latencyCanvasRef = useRef(null);
  const compact = useMemo(() => isLandscape && window.matchMedia('(max-height: 500px)').matches, [isLandscape]);

  useEffect(() => {
    if (!latencyHistory.length) return;
    const canvas = latencyCanvasRef.current;
    if (!canvas) return;
    drawLatencyGraph(canvas, latencyHistory);
  }, [latencyHistory, compact]);

  if (!stats) return null;

  const fmtMs = (v) => (v != null ? `${v.toFixed(1)} ms` : '--');
  const rows = compact ? STATS_ROWS_COMPACT : STATS_ROWS;

  return (
    <div className={`absolute right-1 z-30 flex flex-col items-end ${isLandscape ? 'top-14' : 'top-12'}`}
    >
      <div className={`mt-0.5 p-[3px_6px] rounded-[5px] w-[140px] font-mono bg-glass-dark md:p-[10px_16px] md:w-[240px] md:rounded-[10px]`}>
        {compact ? (
          <div className="flex gap-2 items-stretch">
            <div className="flex flex-col justify-between leading-tight shrink-0">
              {rows.map(({ label, key }) => (
                <div key={key} className="flex items-center justify-between gap-1.5">
                  <span className="text-[9px] text-white/45">{label}</span>
                  <span className="text-[9px] text-white/[0.85] text-right w-[60px]">{stats[key]}</span>
                </div>
              ))}
              {latency && (
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[8px]" style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Latency</span>
                  <span className="text-[9px] text-white/[0.85]">{fmtMs(latency.totalMs)}</span>
                </div>
              )}
            </div>
            {latency && (
              <canvas ref={latencyCanvasRef} className="flex-1 min-w-0 self-stretch h-[30px] rounded-[3px] bg-black/30" />
            )}
          </div>
        ) : (
          <>
            {rows.map(({ label, key }) => (
              <div key={key} className="flex justify-between leading-tight md:py-[3px]">
                <span className="text-[8px] text-white/45 mr-1.5 md:text-[13px] md:mr-[18px]">{label}</span>
                <span className="text-[8px] text-white/[0.85] text-right md:text-[13px]">{stats[key]}</span>
              </div>
            ))}
            <div className="h-px bg-white/[0.08] my-px md:my-[5px]" />
            {latency && (
              <>
                <div className="text-[7px] font-bold text-white/35 tracking-[0.5px] leading-tight py-[2px] pb-px md:text-[11px]">FRAME LATENCY</div>
                {LATENCY_LAYERS.map(({ label, key, labelColor }) => (
                  <div key={label} className="flex justify-between leading-tight md:py-[3px]">
                    <span className="text-[8px] mr-1.5 md:text-[13px] md:mr-[18px]" style={{ color: labelColor }}>{label}</span>
                    <span className="text-[8px] text-white/[0.85] text-right md:text-[13px]">{fmtMs(latency[key])}</span>
                  </div>
                ))}
                <div className="flex justify-between leading-tight md:py-[3px]">
                  <span className="text-[8px] mr-1.5 md:text-[13px] md:mr-[18px]" style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Total</span>
                  <span className="text-[8px] text-white/[0.85] text-right md:text-[13px]" style={{ fontWeight: 700 }}>{fmtMs(latency.totalMs)}</span>
                </div>
                <canvas ref={latencyCanvasRef} className="w-full h-[30px] mt-px rounded-[3px] bg-black/30 md:h-[90px] md:mt-1 md:rounded-[6px]" />
                <div className="h-px bg-white/[0.08] my-px md:my-[5px]" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const StatusBar = ({
  battery, className, toggleStats, onQualityChange, onSettingsOpen,
}) => {
  const BatteryIcon = battery?.charging ? BatteryChargingFull : BatteryFull;

  return (
    <div className={className}>
      <div className="flex items-center mr-auto md:mr-0 gap-2 h-10 px-3.5">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: '#22c967' }}
        />
        <span className="text-base text-white/70">connected</span>
      </div>
      {battery && (
        <div className="flex items-center justify-center gap-2 h-10 px-3.5">
          <BatteryIcon style={{ fontSize: 20, color: 'rgba(255, 255, 255, 0.7)' }} />
          <span className="text-base text-white/70 w-9">{battery.level}%</span>
        </div>
      )}
      <div
        className="group flex items-center justify-center h-9 px-3.5 rounded-[18px] cursor-pointer select-none bg-glass hover:!bg-black/60"
        onClick={toggleStats}
        title="Toggle stats"
      >
        <span className="text-[13px] font-semibold tracking-[0.5px] uppercase text-center leading-none text-white/60 group-hover:text-white/90">
          stats
        </span>
      </div>
      <SettingsMenu onQualityChange={onQualityChange} onOpen={onSettingsOpen} />
    </div>
  );
};

export default StatusBar;
