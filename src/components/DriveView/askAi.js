const MAX_SEGMENTS = 5;
const ALERT_STATUSES = ['normal', 'userPrompt', 'critical'];

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function askAiSegments(loop, offset) {
  const first = Math.floor(loop.startTime / 60000);
  const last = Math.floor((loop.startTime + loop.duration - 1) / 60000);
  const current = Math.floor(offset / 60000);
  const start = Math.max(first, Math.min(current - 2, last - MAX_SEGMENTS + 1));
  const segments = [];
  for (let i = start; i <= Math.min(last, start + MAX_SEGMENTS - 1); i++) {
    segments.push(i);
  }
  return segments;
}

export function askAiPrompt(route, files, segments, offset) {
  const windowStart = segments[0] * 60000;
  const windowEnd = (segments[segments.length - 1] + 1) * 60000;

  const timeline = (route.events || [])
    .filter((ev) => ev.route_offset_millis < windowEnd && (ev.data?.end_route_offset_millis ?? ev.route_offset_millis) >= windowStart)
    .map((ev) => {
      const start = formatTime(ev.route_offset_millis);
      const end = ev.data?.end_route_offset_millis !== undefined ? `-${formatTime(ev.data.end_route_offset_millis)}` : '';
      if (ev.type === 'engage') return `- ${start}${end} engaged`;
      if (ev.type === 'overriding') return `- ${start}${end} driver overriding`;
      if (ev.type === 'bookmark') return `- ${start} driver bookmarked this moment`;
      if (ev.type === 'alert' && ev.data.alertStatus) return `- ${start}${end} ${ALERT_STATUSES[ev.data.alertStatus] || ev.data.alertStatus} alert`;
      return null;
    })
    .filter(Boolean);

  const logs = segments
    .map((seg) => [seg, files?.[`${route.fullname}--${seg}/qlogs`]?.url])
    .filter(([, url]) => url)
    .map(([seg, url]) => `segment ${seg} (${formatTime(seg * 60000)}-${formatTime((seg + 1) * 60000)}): ${url}`);

  return [
    'I drive with openpilot (github.com/commaai/openpilot) and want help understanding what happened in this drive.',
    '',
    `Car: ${route.platform || 'unknown'}`,
    `openpilot: ${route.version || 'unknown'}, branch ${route.git_branch || 'unknown'}, commit ${route.git_commit || 'unknown'} (${route.git_remote || 'github.com/commaai/openpilot'})`,
    `Route: ${route.fullname}, ${formatTime(route.duration)} long. I'm looking at ${formatTime(offset)} into the drive.`,
    '',
    `Timeline from ${formatTime(windowStart)} to ${formatTime(windowEnd)}:`,
    ...(timeline.length ? timeline : ['- nothing logged']),
    '',
    'openpilot logs (qlogs) for that window, one per minute of driving. The links expire in about an hour, so download them first:',
    ...(logs.length ? logs : ['- not uploaded yet']),
    '',
    'To read them in Python:',
    `git clone https://github.com/commaai/openpilot && cd openpilot && git checkout ${route.git_commit || 'master'} && git submodule update --init opendbc_repo`,
    'pip install pycapnp zstandard',
    'log = capnp.load(\'cereal/log.capnp\', imports=[os.path.abspath(\'opendbc_repo/opendbc/car\')])',
    'events = log.Event.read_multiple_bytes(zstandard.ZstdDecompressor().stream_reader(open(\'qlog.zst\', \'rb\')).read())',
    'Each event has logMonoTime (ns) and one message, event.which(). Useful ones: carState, carControl, controlsState, selfdriveState (alerts), onroadEvents, modelV2, longitudinalPlan, radarState, deviceState. qlogs are decimated; full rate logs can be uploaded from the Files menu in comma connect.',
    '',
    'My question: ',
  ].join('\n');
}
