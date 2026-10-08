import { createMemoryHistory } from 'history';
import { onTestFinished } from 'vitest';

import { pushTimelineRange } from '../actions';
import { ACTION_ROUTES_METADATA } from '../actions/types';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { attach, currentOffset } from '.';
import { pause, play, seek, setRate } from './playback';

const route = { fullname: 'dongle|log', log_id: 'log', duration: 150000, videoStartOffset: 2000, segment_numbers: [0, 1, 2] };
const other = { ...route, fullname: 'dongle|other', log_id: 'other' };
// 140 s of video that starts 2 s into the drive
const segments = [
  { number: 0, start: 0, duration: 60 },
  { number: 1, start: 60, duration: 60 },
  { number: 2, start: 120, duration: 20 },
];

class FakeVideo extends EventTarget {
  currentTime = 0;
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  playbackRate = 1;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });

  emit(type, fields = {}) {
    Object.assign(this, fields);
    this.dispatchEvent(new Event(type));
  }
}

function openDrive(start = null, end = null) {
  const store = createAppStore(createMemoryHistory(), { ...createInitialState('/dongle'), dongleId: 'dongle', routes: [route, other] });
  store.dispatch(pushTimelineRange(route.log_id, start, end, false));
  return store;
}

function attachVideo({ loaded = true } = {}) {
  const video = new FakeVideo();
  video.detach = attach(video, segments);
  onTestFinished(video.detach);
  if (loaded) video.emit('loadedmetadata', { readyState: 1 });
  return video;
}

describe('player', () => {
  it('parks seeks until the video has metadata, then plays from there', () => {
    const store = openDrive();
    const video = attachVideo({ loaded: false });
    store.dispatch(seek(60000));
    expect([currentOffset(), video.currentTime]).toEqual([60000, 0]);
    video.emit('loadedmetadata', { readyState: 1 });
    expect([currentOffset(), video.currentTime]).toEqual([60000, 58]);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it.each([
    [5000, 10000, 20000, 10000],
    [25000, 10000, 20000, 20000],
    [500000, null, null, 142000],
  ])('clamps a seek to %i inside [%s, %s] to %i', (offset, start, end, clamped) => {
    const store = openDrive(start, end);
    attachVideo();
    store.dispatch(seek(offset));
    expect(currentOffset()).toBe(clamped);
  });

  it('resumes a reloaded video where the last one stopped, paused if it was', () => {
    const store = openDrive();
    const first = attachVideo();
    first.currentTime = 30;
    store.dispatch(pause());
    first.detach();
    expect(currentOffset()).toBe(32000);
    const second = attachVideo();
    expect([second.currentTime, second.play.mock.calls.length]).toEqual([30, 0]);
    second.currentTime = 40;
    first.detach();
    expect(currentOffset()).toBe(42000);
  });

  it('plays a new drive from the start of its selection', () => {
    const store = openDrive();
    const video = attachVideo();
    video.currentTime = 30;
    store.dispatch(pause());
    store.dispatch(pushTimelineRange(other.log_id, 10000, 40000, false));
    video.detach();
    const next = attachVideo();
    expect([currentOffset(), next.currentTime, next.play.mock.calls.length]).toEqual([10000, 8, 1]);
  });

  it('keeps following the video of a drive that closes and reopens before it renders', () => {
    const store = openDrive();
    const video = attachVideo();
    video.currentTime = 30;
    store.dispatch(pushTimelineRange(null, null, null, false));
    store.dispatch(pushTimelineRange(route.log_id, null, null, false));
    expect(currentOffset()).toBe(32000);
  });

  it('runs commands on the video and reports what it does', () => {
    const store = openDrive();
    store.dispatch(setRate(0.5));
    const video = attachVideo();
    video.emit('playing', { readyState: 4 });
    expect([video.playbackRate, store.getState().playback]).toEqual([0.5, { status: 'playing', rate: 0.5, error: null }]);
    store.dispatch(pause());
    video.emit('pause');
    store.dispatch(setRate(2));
    expect([video.playbackRate, video.defaultPlaybackRate, store.getState().playback.status]).toEqual([2, 2, 'paused']);
    store.dispatch(play());
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['plays on inside a selection', [10000, 20000], { currentTime: 17.5 }, 17.5, 0],
    ['loops a selection at its end', [10000, 20000], { currentTime: 18.1 }, 8, 0],
    ['waits for a pending seek before looping', [10000, 20000], { currentTime: 18.5, seeking: true }, 18.5, 0],
    ['plays the whole drive to its end', [0, 150000], { currentTime: 140, ended: true }, 140, 0],
    ['holds a zero length selection on its frame', [30000, 30000], {}, 28, 1],
    ['stops a selection that ends before its first frame', [0, 1500], {}, 0, 1],
    ['stops a selection after the last frame', [143000, 145000], { currentTime: 140, ended: true }, 140, 1],
  ])('%s', (_name, [start, end], fields, time, pauses) => {
    openDrive(start, end);
    const video = attachVideo();
    video.emit(fields.ended ? 'ended' : 'timeupdate', fields);
    expect([video.currentTime, video.pause.mock.calls.length]).toEqual([time, pauses]);
  });

  it('restarts a selection the video ended in only while it plays', () => {
    const store = openDrive(130000, 150000);
    const video = attachVideo();
    video.emit('ended', { currentTime: 140, ended: true, paused: true });
    expect([video.currentTime, video.play.mock.calls.length]).toEqual([128, 2]);
    store.dispatch(pause());
    video.emit('ended', { currentTime: 140, ended: true, paused: true });
    expect([video.currentTime, video.play.mock.calls.length]).toEqual([128, 2]);
  });

  it('logs entering a selection once its drive loads, and changing the speed as plays', () => {
    vi.stubGlobal('gtag', vi.fn());
    const logId = '0000002d--0123456789';
    const drive = { ...route, fullname: `0123456789abcdef|${logId}`, log_id: logId };
    const store = createAppStore(createMemoryHistory(), createInitialState(`/0123456789abcdef/${logId}/30/40`));
    const loaded = { type: ACTION_ROUTES_METADATA, dongleId: '0123456789abcdef', start: 0, end: 1, routes: [drive] };
    store.dispatch(loaded);
    store.dispatch(loaded);
    store.dispatch(setRate(2));
    expect(gtag.mock.calls.filter(([, name]) => name.startsWith('video_'))).toEqual([
      ['event', 'video_loop', { debug_mode: true, loop_duration: 10000, loop_duration_percentage: 1 / 15, loop_duration_percentage_round: 0.1 }],
      ['event', 'video_play', { debug_mode: true, play_speed: 1, play_percentage: 0, play_percentage_round: 0 }],
      ['event', 'video_play', { debug_mode: true, play_speed: 2, play_percentage: 0, play_percentage_round: 0 }],
    ]);
  });
});
