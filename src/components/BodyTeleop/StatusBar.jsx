import React, { useState, useEffect, useRef, useCallback } from 'react';
import BatteryFull from '@material-ui/icons/BatteryFull';

const LATENCY_BUFFER_SIZE = 10;
const LATENCY_HISTORY_MAX = 60;

const STATS_ROWS = [
  { label: 'Resolution', key: 'resolution' },
  { label: 'FPS', key: 'fps' },
  { label: 'Bitrate', key: 'bitrate' },
  { label: 'RTT', key: 'rtt' },
  { label: 'Jitter', key: 'jitter' },
];

const LATENCY_LAYERS = [
  { label: 'Capture', key: 'captureMs', color: 'rgba(76,175,80,0.55)', labelColor: 'rgba(76,175,80,0.7)' },
  { label: 'Encode', key: 'encodeMs', color: 'rgba(255,183,77,0.55)', labelColor: 'rgba(255,183,77,0.7)' },
  { label: 'Send delay', key: 'sendDelayMs', color: 'rgba(171,71,188,0.45)', labelColor: 'rgba(171,71,188,0.65)' },
  { label: 'Network', key: 'networkMs', color: 'rgba(66,165,245,0.55)', labelColor: 'rgba(66,165,245,0.7)' },
];


export const useStats = (connection, connectionState, latencyCallbackRef) => {
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [latency, setLatency] = useState(null);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const latencyBufferRef = useRef([]);
  const statsPollingRef = useRef({ interval: null, prevTimestamp: null, prevBytes: null, prevFrames: null });

  useEffect(() => {
    latencyCallbackRef.current = (raw) => {
      latencyBufferRef.current.push(raw);
      if (latencyBufferRef.current.length >= LATENCY_BUFFER_SIZE) {
        const buf = latencyBufferRef.current;
        latencyBufferRef.current = [];
        const avg = {};
        for (const key of ['captureMs', 'encodeMs', 'sendDelayMs', 'devicePipelineMs', 'networkMs', 'totalMs']) {
          const vals = buf.map((l) => l[key]).filter((v) => v != null);
          avg[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }
        avg.clockSynced = buf[buf.length - 1].clockSynced;
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
      let candidatePairStats = null;
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') videoStats = stat;
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') candidatePairStats = stat;
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
        rtt: candidatePairStats?.currentRoundTripTime !== undefined
          ? `${(candidatePairStats.currentRoundTripTime * 1000).toFixed(0)} ms`
          : '?',
      });
    } catch {
      /* peer connection may have closed */
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

  return { showStats, toggleStats, stats, latency, latencyHistory };
}

function drawLatencyGraph(canvas, latencyHistory) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
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
    ctx.lineTo((cums.length - 1) * xStep, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = LATENCY_LAYERS[li].color;
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '8px monospace';
  ctx.fillText(`${Math.round(maxVal)}ms`, 2, 9);
}

export const StatsPanel = ({ isLandscape, stats, latency, latencyHistory }) => {
  const latencyCanvasRef = useRef(null);

  useEffect(() => {
    if (!latencyHistory.length) return;
    const canvas = latencyCanvasRef.current;
    if (!canvas) return;
    drawLatencyGraph(canvas, latencyHistory);
  }, [latencyHistory]);

  if (!stats) return null;

  const fmtMs = (v) => (v != null ? `${v.toFixed(1)} ms` : '--');

  return (
    <div className={isLandscape
      ? 'absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center'
      : 'absolute top-0 right-1 z-10 flex flex-col items-end'}
    >
      <div className={`mt-0.5 p-[3px_6px] rounded-[5px] min-w-[120px] font-mono bg-glass-dark md:p-[10px_16px] md:min-w-[240px] md:rounded-[10px]`}>
        {STATS_ROWS.map(({ label, key }) => (
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
              <div key={key} className="flex justify-between leading-tight md:py-[3px]">
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
      </div>
    </div>
  );
};

const StatusBar = ({
  connectionState, batteryLevel, isLandscape, toggleStats,
}) => {
  const dotColor = connectionState === 'connecting' ? '#facc15'
    : connectionState === 'connected' ? '#22c967'
    : connectionState === 'failed' ? '#da2535'
    : '#4b5559';

  const wrapperClass = isLandscape
    ? 'absolute top-3 right-3 z-10 flex items-center gap-2'
    : 'flex items-center justify-end p-2 gap-2';

  const statsButton = (
    <div
      className={isLandscape
        ? `flex items-center justify-center gap-1.5 h-7 px-2.5 rounded-[14px] cursor-pointer bg-glass`
        : `h-7 px-2.5 rounded-[14px] text-[10px] font-bold tracking-[1px] flex items-center justify-center text-white/60 cursor-pointer select-none bg-glass hover:text-white/90 hover:!bg-black/60`}
      onClick={toggleStats}
      title="Toggle stats"
    >
      {isLandscape ? <span className="text-xs text-white/70">stats</span> : 'STATS'}
    </div>
  );

  const statusPill = (
    <div className="flex items-center justify-center gap-1.5 h-7 px-2.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: dotColor,
          animation: connectionState === 'connecting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span className="text-xs text-white/70">{connectionState}</span>
    </div>
  );

  const batteryPill = batteryLevel !== null && (
    <div className="flex items-center justify-center gap-1.5 h-7 px-2.5">
      <BatteryFull style={{ fontSize: isLandscape ? 16 : 14, color: 'rgba(255, 255, 255, 0.7)' }} />
      <span className="text-xs text-white/70">{batteryLevel}%</span>
    </div>
  );

  const content = isLandscape
    ? <>{statsButton}{statusPill}{batteryPill}</>
    : <div className="flex items-end gap-1.5">{statusPill}{batteryPill}{statsButton}<div style={{ flex: 1 }} /></div>;

  return <div className={wrapperClass}>{content}</div>;
};

export default StatusBar;
