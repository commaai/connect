import React, { useState, useEffect, useRef, useCallback } from 'react';
import BatteryFull from '@material-ui/icons/BatteryFull';
import PhotoCamera from '@material-ui/icons/PhotoCamera';
import Colors from '../../colors';

const LATENCY_BUFFER_SIZE = 10;
const LATENCY_HISTORY_MAX = 60;

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
        codec: videoStats.decoderImplementation || '?',
        framesDecoded: videoStats.framesDecoded || 0,
        framesDropped: videoStats.framesDropped || 0,
        packetsLost: videoStats.packetsLost || 0,
        packetsReceived: videoStats.packetsReceived || 0,
        jitter: videoStats.jitter !== undefined ? `${(videoStats.jitter * 1000).toFixed(1)} ms` : '?',
        rtt: candidatePairStats?.currentRoundTripTime !== undefined
          ? `${(candidatePairStats.currentRoundTripTime * 1000).toFixed(0)} ms`
          : '?',
        nackCount: videoStats.nackCount || 0,
        pliCount: videoStats.pliCount || 0,
        firCount: videoStats.firCount || 0,
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

export const StatsPanel = ({ classes, isLandscape, stats, latency, latencyHistory }) => {
  const latencyCanvasRef = useRef(null);

  useEffect(() => {
    if (!latencyHistory.length) return;
    const canvas = latencyCanvasRef.current;
    if (!canvas) return;

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

    const layers = [
      { key: 'captureMs', color: 'rgba(76,175,80,0.55)' },
      { key: 'encodeMs', color: 'rgba(255,183,77,0.55)' },
      { key: 'sendDelayMs', color: 'rgba(171,71,188,0.45)' },
      { key: 'networkMs', color: 'rgba(66,165,245,0.55)' },
    ];

    const cums = latencyHistory.map((l) => {
      let sum = 0;
      return layers.map(({ key }) => {
        const v = l[key];
        sum += (v != null && v > 0) ? v : 0;
        return sum;
      });
    });

    for (let li = layers.length - 1; li >= 0; li--) {
      ctx.beginPath();
      for (let i = 0; i < cums.length; i++) {
        const x = i * xStep;
        const y = h - cums[i][li] * yScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo((cums.length - 1) * xStep, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = layers[li].color;
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.fillText(`${Math.round(maxVal)}ms`, 2, 9);
  }, [latencyHistory]);

  if (!stats) return null;

  const fmtMs = (v) => (v != null ? `${v.toFixed(1)} ms` : '--');

  return (
    <div className={isLandscape ? classes.statsToggle : classes.statsTogglePortrait}>
      <div className={classes.statsPanel}>
        <div className={classes.statsRow}>
          <span className={classes.statsLabel}>Resolution</span>
          <span className={classes.statsValue}>{stats.resolution}</span>
        </div>
        <div className={classes.statsRow}>
          <span className={classes.statsLabel}>FPS</span>
          <span className={classes.statsValue}>{stats.fps}</span>
        </div>
        <div className={classes.statsRow}>
          <span className={classes.statsLabel}>Bitrate</span>
          <span className={classes.statsValue}>{stats.bitrate}</span>
        </div>
        <div className={classes.statsRow}>
          <span className={classes.statsLabel}>RTT</span>
          <span className={classes.statsValue}>{stats.rtt}</span>
        </div>
        <div className={classes.statsRow}>
          <span className={classes.statsLabel}>Jitter</span>
          <span className={classes.statsValue}>{stats.jitter}</span>
        </div>
        <div className={classes.statsDivider} />
        {latency && (
          <>
            <div className={classes.latencySectionHeader}>FRAME LATENCY</div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel} style={{ color: 'rgba(76,175,80,0.7)' }}>Capture</span>
              <span className={classes.statsValue}>{fmtMs(latency.captureMs)}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel} style={{ color: 'rgba(255,183,77,0.7)' }}>Encode</span>
              <span className={classes.statsValue}>{fmtMs(latency.encodeMs)}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel} style={{ color: 'rgba(171,71,188,0.65)' }}>Send delay</span>
              <span className={classes.statsValue}>{fmtMs(latency.sendDelayMs)}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel} style={{ color: 'rgba(66,165,245,0.7)' }}>Network</span>
              <span className={classes.statsValue}>{fmtMs(latency.networkMs)}</span>
            </div>
            <div className={classes.statsRow}>
              <span className={classes.statsLabel} style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Total</span>
              <span className={classes.statsValue} style={{ fontWeight: 700 }}>{fmtMs(latency.totalMs)}</span>
            </div>
            <canvas ref={latencyCanvasRef} className={classes.latencyGraph} />
            <div className={classes.statsDivider} />
          </>
        )}
      </div>
    </div>
  );
};

const StatusBar = ({
  classes, connectionState, batteryLevel, isLandscape,
  showStats, toggleStats, stats, latency, latencyHistory, videoRef,
}) => {
  const handleScreenshot = () => {
    const video = videoRef?.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.download = `screenshot_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const dotColor = connectionState === 'connecting' ? '#facc15'
    : connectionState === 'connected' ? Colors.green50
    : connectionState === 'failed' ? Colors.red50
    : Colors.grey400;

  if (!isLandscape) {
    return (
      <div className={`${classes.controlsGroup} ${classes.controlsGroupPortrait}`}>
        <div className={classes.portraitRow}>
          <div className={classes.hudPill}>
            <div
              className={classes.statusDot}
              style={{
                backgroundColor: dotColor,
                animation: connectionState === 'connecting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}
            />
            <span className={classes.hudText}>{connectionState}</span>
          </div>
          {batteryLevel !== null && (
            <div className={classes.hudPill}>
              <BatteryFull style={{ fontSize: 14, color: Colors.white70 }} />
              <span className={classes.hudText}>{batteryLevel}%</span>
            </div>
          )}
          <div className={classes.statsToggleButton} onClick={toggleStats} title="Toggle stats">
            STATS
          </div>
          <div style={{ flex: 1 }} />
          <div className={classes.controlsButtons}>
            <div
              className={`${classes.actionButton} ${classes.actionButtonPortrait}`}
              onClick={handleScreenshot}
              title="Save screenshot"
            >
              <PhotoCamera className={classes.actionButtonIconPortrait} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Landscape: HUD top-right
  return (
    <>
      <div className={classes.hudTopRight}>
        <div className={classes.hudPillButton} onClick={toggleStats} title="Toggle stats">
          <span className={classes.hudText}>stats</span>
        </div>
        <div className={classes.hudPill}>
          <div className={classes.statusDot} style={{ backgroundColor: dotColor }} />
          <span className={classes.hudText}>{connectionState}</span>
        </div>
        {batteryLevel !== null && (
          <div className={classes.hudPill}>
            <BatteryFull style={{ fontSize: 16, color: Colors.white70 }} />
            <span className={classes.hudText}>{batteryLevel}%</span>
          </div>
        )}
      </div>
      {showStats && (
        <StatsPanel
          classes={classes}
          isLandscape
          stats={stats}
          latency={latency}
          latencyHistory={latencyHistory}
        />
      )}
    </>
  );
};

export default StatusBar;
