// HLS concatenates uploaded segments; route time includes the missing intervals.
export function videoMapping(route, playlist) {
  const rows = playlist.trim().split(/\r?\n/);
  if (rows[0] !== '#EXTM3U') throw new Error('Invalid video playlist');
  const origin = route.segment_start_times?.[0];
  const parts = [];
  let media = 0;
  for (const row of rows) {
    if (!row.startsWith('#EXTINF:')) continue;
    const match = /^#EXTINF:(\d+(?:\.\d+)?),(\d+)$/.exec(row.trim());
    if (!match) throw new Error('Video segment timing is unavailable');
    const duration = Number(match[1]);
    const index = route.segment_numbers.indexOf(Number(match[2]));
    let start = route.segment_start_times[index];
    let end = route.segment_end_times[index];
    if (start >= 0 && end < origin && origin - start > 86400000) {
      start += origin;
      end += origin;
    }
    start = Math.max(start - origin, route.videoStartOffset || 0);
    end = Math.min(end - origin, start + duration * 1000);
    if (!Number.isFinite(start) || start < 0 || end <= start || !duration
      || (parts.length && start < parts[parts.length - 1].end)) throw new Error('Invalid video segment timing');
    parts.push({ start, end, media, duration });
    media += duration;
  }
  if (!parts.length) throw new Error('No video is available for this drive');
  return {
    toMedia(offset) {
      const part = parts.find((p) => offset < p.end) || parts[parts.length - 1];
      return part.media + Math.max(0, Math.min(part.duration, (offset - part.start) / 1000));
    },
    toRoute(seconds) {
      const part = parts.find((p) => seconds < p.media + p.duration) || parts[parts.length - 1];
      return Math.min(part.end, part.start + Math.max(0, seconds - part.media) * 1000);
    },
  };
}
