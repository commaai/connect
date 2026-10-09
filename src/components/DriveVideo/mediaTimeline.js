// qcamera EXTINF titles contain route segment numbers. Uploaded chunks can be
// concatenated despite missing minutes; media time and route time then differ.
export function mediaTimeline(fragments) {
  if (!fragments.length || fragments.some((f, i) => f.title === null || String(f.title).trim() === ''
    || !Number.isInteger(Number(f.title)) || Number(f.title) < 0
    || !Number.isFinite(f.start) || !(f.duration > 0)
    || (i && Number(f.title) <= Number(fragments[i - 1].title)))) return null;
  // HLS may expand duration to include padded timestamps while demuxing. Keep
  // the manifest's actual footage duration, and read later video PTS updates.
  const chunks = fragments.map(fragment => ({ fragment, duration: fragment.duration }));
  const mediaStart = ({ fragment, duration }) => {
    const video = fragment.elementaryStreams?.video;
    const start = video?.startPTS ?? fragment.startPTS ?? fragment.start;
    return Number.isFinite(video?.endPTS) ? Math.max(start, video.endPTS - duration) : start;
  };
  return {
    toRoute(seconds, origin) {
      let index = chunks.length - 1;
      while (index > 0 && seconds + .000001 < mediaStart(chunks[index])) index -= 1;
      const chunk = chunks[index];
      return origin + (Number(chunk.fragment.title) * 60 + Math.max(0, seconds - mediaStart(chunk))) * 1000;
    },
    toMedia(offset, origin) {
      const seconds = (offset - origin) / 1000;
      const chunk = chunks.find(c => seconds < Number(c.fragment.title) * 60 + c.duration) ?? chunks.at(-1);
      return mediaStart(chunk) + Math.max(0, Math.min(chunk.duration, seconds - Number(chunk.fragment.title) * 60));
    },
  };
}

export function playlistTimeline(text) {
  const fragments = [];
  let start = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('#EXTINF:')) continue;
    const [duration, title = ''] = line.slice(8).split(',');
    fragments.push({ start, duration: Number(duration), title });
    start += Number(duration);
  }
  return mediaTimeline(fragments);
}
