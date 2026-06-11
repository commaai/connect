/* eslint-env jest */
import fs from 'fs';
import path from 'path';
import { goto } from '../utils';

const ATTEMPTS = 50;
const DEFAULT_ATTEMPT_DEADLINE_MS = 20000;
const DEFAULT_RUN_TIMEOUT_MS = 25 * 60 * 1000;
const DONGLE_ID_RE = /^[a-f0-9]{16}$/;

const parseOptionalNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric threshold, got "${value}"`);
  }
  return parsed;
};

const config = {
  accessToken: process.env.WEBRTC_LATENCY_ACCESS_TOKEN || process.env.COMMA_ACCESS_TOKEN,
  attemptDeadlineMs: Number(process.env.WEBRTC_LATENCY_ATTEMPT_DEADLINE_MS || DEFAULT_ATTEMPT_DEADLINE_MS),
  dongleId: process.env.WEBRTC_LATENCY_DONGLE_ID,
  maxConnectAverageMs: parseOptionalNumber(process.env.WEBRTC_LATENCY_MAX_CONNECT_AVG_MS),
  maxTotalAverageMs: parseOptionalNumber(process.env.WEBRTC_LATENCY_MAX_TOTAL_AVG_MS),
  minSuccessRate: Number(process.env.WEBRTC_LATENCY_MIN_SUCCESS_RATE || 100),
  reportPath: process.env.WEBRTC_LATENCY_REPORT_PATH || path.join(process.cwd(), 'artifacts/webrtc-latency/report.html'),
  runTimeoutMs: Number(process.env.WEBRTC_LATENCY_TIMEOUT_MS || DEFAULT_RUN_TIMEOUT_MS),
};

jest.setTimeout(config.runTimeoutMs + 60000);

const browserErrors = [];

const recordPageError = (err) => {
  browserErrors.push(err.message);
  console.error(`[pageerror] ${err.message}`);
};

const logBrowserConsoleError = (msg) => {
  if (msg.type() === 'error') {
    console.error(`[browser:${msg.type()}] ${msg.text()}`);
  }
};

const validateConfig = () => {
  if (!config.accessToken) {
    throw new Error('WEBRTC_LATENCY_ACCESS_TOKEN or COMMA_ACCESS_TOKEN is required');
  }
  if (!config.dongleId) {
    throw new Error('WEBRTC_LATENCY_DONGLE_ID is required');
  }
  if (!DONGLE_ID_RE.test(config.dongleId)) {
    throw new Error('WEBRTC_LATENCY_DONGLE_ID must be 16 lowercase hex characters');
  }
  if (!Number.isFinite(config.attemptDeadlineMs) || config.attemptDeadlineMs <= 0) {
    throw new Error('WEBRTC_LATENCY_ATTEMPT_DEADLINE_MS must be a positive number');
  }
  if (!Number.isFinite(config.runTimeoutMs) || config.runTimeoutMs <= 0) {
    throw new Error('WEBRTC_LATENCY_TIMEOUT_MS must be a positive number');
  }
  if (!Number.isFinite(config.minSuccessRate) || config.minSuccessRate < 0 || config.minSuccessRate > 100) {
    throw new Error('WEBRTC_LATENCY_MIN_SUCCESS_RATE must be between 0 and 100');
  }
};

const isNumber = (value) => Number.isFinite(value);

const percentile = (values, pct) => {
  if (values.length === 0) return null;
  const pos = (values.length - 1) * pct;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (values[base + 1] == null) return values[base];
  return values[base] + rest * (values[base + 1] - values[base]);
};

const seriesStats = (rawValues) => {
  const values = rawValues.filter(isNumber).sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    averageMs: values.length > 0 ? sum / values.length : null,
    maxMs: values.length > 0 ? values[values.length - 1] : null,
    medianMs: percentile(values, 0.5),
    minMs: values.length > 0 ? values[0] : null,
    p90Ms: percentile(values, 0.9),
    values,
  };
};

const computeStats = (results) => {
  const connectedResults = results.filter((result) => result.status === 'connected' && isNumber(result.elapsedMs));
  const connect = seriesStats(connectedResults.map((result) => result.elapsedMs));
  const firstFrame = seriesStats(connectedResults.map((result) => result.firstFrameMs));
  const total = seriesStats(connectedResults.map((result) => result.totalMs));
  const failed = results.filter((result) => result.status === 'failed').length;
  const stopped = results.filter((result) => result.status === 'stopped').length;

  return {
    attempts: results.length,
    averageMs: connect.averageMs,
    connected: connectedResults.length,
    connect,
    failed,
    firstFrame,
    maxMs: connect.maxMs,
    medianMs: connect.medianMs,
    minMs: connect.minMs,
    p90Ms: connect.p90Ms,
    stopped,
    successRate: results.length > 0 ? (connectedResults.length / results.length) * 100 : null,
    total,
  };
};

const fmt = (value) => {
  if (value == null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(1);
};

const fmtCount = (value) => {
  if (value == null || Number.isNaN(value)) return '-';
  return String(value);
};

const fmtPercent = (value) => {
  if (value == null || Number.isNaN(value)) return '-';
  return `${Number(value).toFixed(0)}%`;
};

const summaryRows = (stats) => [
  ['Attempts', fmtCount(stats.attempts)],
  ['Connected', fmtCount(stats.connected)],
  ['Failed', fmtCount(stats.failed)],
  ['Stopped', fmtCount(stats.stopped)],
  ['Success rate', fmtPercent(stats.successRate)],
  ['Average', `${fmt(stats.averageMs)} ms`],
  ['Median', `${fmt(stats.medianMs)} ms`],
  ['P90', `${fmt(stats.p90Ms)} ms`],
  ['Min / Max', `${fmt(stats.minMs)} / ${fmt(stats.maxMs)} ms`],
  ['First frame avg', `${fmt(stats.firstFrame.averageMs)} ms`],
  ['First frame median', `${fmt(stats.firstFrame.medianMs)} ms`],
  ['Total avg', `${fmt(stats.total.averageMs)} ms`],
  ['Total median', `${fmt(stats.total.medianMs)} ms`],
  ['Total P90', `${fmt(stats.total.p90Ms)} ms`],
  ['Total min / max', `${fmt(stats.total.minMs)} / ${fmt(stats.total.maxMs)} ms`],
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

const svgText = (message) => `<svg viewBox="0 0 900 260" role="img" xmlns="http://www.w3.org/2000/svg">
  <rect width="900" height="260" fill="#fff"/>
  <text x="450" y="130" fill="#666" font-family="sans-serif" font-size="14" text-anchor="middle">${escapeHtml(message)}</text>
</svg>`;

const latencyChartSvg = (results, target) => {
  const connected = results.filter((result) => result.status === 'connected' && isNumber(result.elapsedMs));
  if (connected.length === 0) return svgText('No successful connects');

  const width = 900;
  const height = 260;
  const left = 54;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const withTotals = connected.filter((result) => isNumber(result.totalMs));
  const maxMs = Math.max(10, ...connected.map((result) => result.elapsedMs), ...withTotals.map((result) => result.totalMs)) * 1.1;
  const xForAttempt = (attempt) => {
    if (target <= 1) return left + plotWidth / 2;
    return left + ((attempt - 1) / (target - 1)) * plotWidth;
  };
  const yForMs = (ms) => top + (1 - ms / maxMs) * plotHeight;
  const grid = [];

  for (let index = 0; index <= 4; index += 1) {
    const y = top + (index / 4) * plotHeight;
    const value = maxMs * (1 - index / 4);
    grid.push(`<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#ddd"/>`);
    grid.push(`<text x="${left - 8}" y="${y + 4}" fill="#555" font-family="sans-serif" font-size="12" text-anchor="end">${fmt(value)}</text>`);
  }

  const connectPoints = connected.map((result) => `${xForAttempt(result.attempt)},${yForMs(result.elapsedMs)}`).join(' ');
  const totalPoints = withTotals.map((result) => `${xForAttempt(result.attempt)},${yForMs(result.totalMs)}`).join(' ');
  const connectDots = connected.map((result) => `<circle cx="${xForAttempt(result.attempt)}" cy="${yForMs(result.elapsedMs)}" r="3" fill="#2563eb"/>`).join('');
  const totalDots = withTotals.map((result) => `<circle cx="${xForAttempt(result.attempt)}" cy="${yForMs(result.totalMs)}" r="3" fill="#7c3aed"/>`).join('');
  const failures = results
    .filter((result) => result.status !== 'connected')
    .map((result) => {
      const x = xForAttempt(result.attempt);
      const y = height - bottom - 7;
      return `<path d="M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}" stroke="#dc2626" stroke-width="2"/>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#fff"/>
    ${grid.join('')}
    <path d="M ${left} ${top} L ${left} ${height - bottom} L ${width - right} ${height - bottom}" fill="none" stroke="#888"/>
    <text x="${left}" y="${height - bottom + 20}" fill="#555" font-family="sans-serif" font-size="12" text-anchor="middle">1</text>
    <text x="${width - right}" y="${height - bottom + 20}" fill="#555" font-family="sans-serif" font-size="12" text-anchor="middle">${target}</text>
    <polyline points="${connectPoints}" fill="none" stroke="#2563eb" stroke-width="2"/>
    ${totalPoints ? `<polyline points="${totalPoints}" fill="none" stroke="#7c3aed" stroke-width="2"/>` : ''}
    ${connectDots}
    ${totalDots}
    ${failures}
    <text x="${width - right}" y="${top + 4}" fill="#7c3aed" font-family="sans-serif" font-size="12" text-anchor="end">total</text>
    <text x="${width - right - 42}" y="${top + 4}" fill="#2563eb" font-family="sans-serif" font-size="12" text-anchor="end">connect</text>
  </svg>`;
};

const distributionChartSvg = (stats) => {
  if (stats.connect.values.length === 0) return svgText('No successful connects');

  const width = 900;
  const height = 260;
  const left = 54;
  const right = 22;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const binCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(stats.connect.values.length))));
  const sameValue = stats.minMs === stats.maxMs;
  const padding = sameValue ? Math.max(1, stats.minMs * 0.05) : 0;
  const low = stats.minMs - padding;
  const high = stats.maxMs + padding;
  const span = Math.max(1, high - low);
  const counts = Array.from({ length: binCount }, () => 0);
  const grid = [];

  stats.connect.values.forEach((value) => {
    const bucket = Math.min(binCount - 1, Math.floor(((value - low) / span) * binCount));
    counts[bucket] += 1;
  });

  const maxCount = Math.max(1, ...counts);
  for (let index = 0; index <= 4; index += 1) {
    const y = top + (index / 4) * plotHeight;
    const value = maxCount * (1 - index / 4);
    grid.push(`<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#ddd"/>`);
    grid.push(`<text x="${left - 8}" y="${y + 4}" fill="#555" font-family="sans-serif" font-size="12" text-anchor="end">${Math.round(value)}</text>`);
  }

  const gap = 4;
  const barWidth = plotWidth / binCount;
  const bars = counts.map((count, index) => {
    const barHeight = (count / maxCount) * plotHeight;
    const x = left + index * barWidth + gap / 2;
    const y = height - bottom - barHeight;
    return `<rect x="${x}" y="${y}" width="${Math.max(1, barWidth - gap)}" height="${barHeight}" fill="#16a34a"/>`;
  }).join('');
  const avgX = left + ((stats.averageMs - low) / span) * plotWidth;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#fff"/>
    ${grid.join('')}
    <path d="M ${left} ${top} L ${left} ${height - bottom} L ${width - right} ${height - bottom}" fill="none" stroke="#888"/>
    ${bars}
    <line x1="${avgX}" y1="${top}" x2="${avgX}" y2="${height - bottom}" stroke="#d97706" stroke-width="2"/>
    <text x="${left}" y="${height - bottom + 22}" fill="#555" font-family="sans-serif" font-size="12" text-anchor="middle">${fmt(low)} ms</text>
    <text x="${width - right}" y="${height - bottom + 22}" fill="#555" font-family="sans-serif" font-size="12" text-anchor="middle">${fmt(high)} ms</text>
  </svg>`;
};

const renderMetric = ([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>`;

const thresholdText = () => [
  `min success rate ${config.minSuccessRate}%`,
  config.maxConnectAverageMs == null ? null : `max connect average ${config.maxConnectAverageMs} ms`,
  config.maxTotalAverageMs == null ? null : `max total average ${config.maxTotalAverageMs} ms`,
].filter(Boolean).join(', ');

const logsText = (logs) => logs.map((entry) => `${entry.time} +${entry.elapsedMs.toFixed(0)}ms ${entry.message}`).join('\n');

const buildReportHtml = (data, stats) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>WebRTC latency report</title>
    <style>
      body {
        color: #111;
        font-family: sans-serif;
        line-height: 1.4;
        margin: 20px;
      }

      main {
        max-width: 960px;
      }

      .meta,
      pre {
        border: 1px solid #bbb;
        padding: 8px;
      }

      .meta {
        margin: 0 0 16px;
      }

      .error {
        border-color: #dc2626;
        color: #991b1b;
      }

      .summary-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        margin: 0 0 16px;
        max-width: 760px;
      }

      .summary-grid div {
        border: 1px solid #ccc;
        padding: 8px;
      }

      .summary-grid dt {
        color: #555;
        font-size: 12px;
        margin: 0 0 3px;
      }

      .summary-grid dd {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }

      .charts {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .chart h3 {
        font-size: 16px;
        margin: 0 0 6px;
      }

      .chart svg {
        border: 1px solid #bbb;
        box-sizing: border-box;
        display: block;
        width: 100%;
      }

      pre {
        max-height: 360px;
        overflow: auto;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>WebRTC latency report</h1>
      <div class="meta${data.error ? ' error' : ''}">
        <div><strong>Generated:</strong> ${escapeHtml(data.generatedAt)}</div>
        <div><strong>Runner:</strong> ${escapeHtml(data.url || '-')}</div>
        <div><strong>Status:</strong> ${escapeHtml(data.status || '-')}</div>
        <div><strong>Dongle:</strong> ${escapeHtml(data.dongleId || '-')}</div>
        <div><strong>Attempts:</strong> ${escapeHtml(data.attempts || ATTEMPTS)}</div>
        <div><strong>Duration:</strong> ${fmt(data.durationMs)} ms</div>
        <div><strong>Thresholds:</strong> ${escapeHtml(thresholdText())}</div>
        ${data.error ? `<div><strong>Error:</strong> ${escapeHtml(data.error.message || data.error)}</div>` : ''}
      </div>

      <h2>Results</h2>
      <dl class="summary-grid">
${summaryRows(stats).map(renderMetric).join('')}
      </dl>

      <div class="charts">
        <div class="chart">
          <h3>Connect / total time by attempt</h3>
          ${latencyChartSvg(data.results, data.attempts || ATTEMPTS)}
        </div>
        <div class="chart">
          <h3>Distribution</h3>
          ${distributionChartSvg(stats)}
        </div>
      </div>

      <h2>Log</h2>
      <pre>${escapeHtml(logsText(data.logs || []))}</pre>
    </main>
  </body>
</html>
`;

const normalizeRunData = (payload) => {
  const data = payload.result || payload.state || {};
  const error = payload.error || data.error || null;
  return {
    attempts: data.attempts || ATTEMPTS,
    dongleId: data.dongleId || config.dongleId,
    durationMs: data.durationMs ?? null,
    error,
    generatedAt: new Date().toISOString(),
    logs: data.logs || [],
    results: data.results || [],
    status: data.status || (error ? 'failed' : 'unknown'),
    url: payload.url,
  };
};

const readRunData = async () => normalizeRunData(await page.evaluate(() => ({
  error: window.__webrtcLatencyError || null,
  result: window.__webrtcLatencyResult || null,
  state: window.__webrtcLatencyState || null,
  url: window.location.href,
})));

const writeReport = (data, stats) => {
  fs.mkdirSync(path.dirname(config.reportPath), { recursive: true });
  fs.writeFileSync(config.reportPath, buildReportHtml(data, stats));
  console.log(`Wrote WebRTC latency report to ${config.reportPath}`);
};

describe('WebRTC latency', () => {
  beforeAll(async () => {
    validateConfig();
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('authorization', token);
    }, config.accessToken);
    page.on('pageerror', recordPageError);
    page.on('console', logBrowserConsoleError);
  });

  afterAll(async () => {
    page.off('pageerror', recordPageError);
    page.off('console', logBrowserConsoleError);
  });

  it('runs the 50-attempt headless browser latency test and writes report.html', async () => {
    let runError = null;

    try {
      await goto('/src/__puppeteer__/webrtc-latency-runner.html');
      await page.waitForFunction(
        () => window.__webrtcLatencyReady === true && typeof window.runWebrtcLatencyTest === 'function',
        { timeout: 30000 },
      );
      await page.evaluate((runnerConfig) => {
        window.__webrtcLatencyError = null;
        window.__webrtcLatencyResult = null;
        window.runWebrtcLatencyTest(runnerConfig)
          .then((result) => {
            window.__webrtcLatencyResult = result;
          })
          .catch((err) => {
            window.__webrtcLatencyError = {
              message: err.message,
              stack: err.stack,
            };
          });
      }, {
        attemptDeadlineMs: config.attemptDeadlineMs,
        attempts: ATTEMPTS,
        dongleId: config.dongleId,
        token: config.accessToken,
      });

      await page.waitForFunction(
        () => window.__webrtcLatencyResult || window.__webrtcLatencyError,
        { timeout: config.runTimeoutMs, polling: 1000 },
      );
    } catch (err) {
      runError = err;
    }

    const data = await readRunData();
    const stats = computeStats(data.results);
    writeReport(data, stats);

    if (runError) throw runError;
    if (data.error) throw new Error(data.error.message || data.error);

    expect(data.status).toBe('complete');
    expect(stats.attempts).toBe(ATTEMPTS);
    expect(stats.connected).toBeGreaterThan(0);
    expect(stats.failed + stats.stopped + stats.connected).toBe(ATTEMPTS);
    expect(stats.successRate).toBeGreaterThanOrEqual(config.minSuccessRate);
    expect(browserErrors).toEqual([]);
    if (config.maxConnectAverageMs != null) {
      expect(stats.averageMs).toBeLessThanOrEqual(config.maxConnectAverageMs);
    }
    if (config.maxTotalAverageMs != null) {
      expect(stats.total.averageMs).toBeLessThanOrEqual(config.maxTotalAverageMs);
    }
  });
});
