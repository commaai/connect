import { vi } from 'vitest';
import * as Types from '../actions/types';
import { currentOffset } from '.';
import { bufferVideo, pause, play, playbackBounds, reducer, resetPlayback, seek, selectLoop, videoTime } from './playback';

const ROUTE = 'demo|2026-08-06--12-00-00';
const makeState = (overrides = {}) => ({
  desiredPlaySpeed: 1,
  offset: 5000,
  seekRequest: { id: 1, offset: 0 },
  playbackRoute: ROUTE,
  isBufferingVideo: false,
  currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 0 },
  zoom: { start: 0, end: 60000 },
  loop: { startTime: 0, duration: 60000 },
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('video-authoritative playback', () => {
  it('does not advance from elapsed wall time or unrelated actions', () => {
    const state = makeState();
    vi.spyOn(Date, 'now').mockReturnValue(10_000_000);
    expect(currentOffset(state)).toBe(5000);
    expect(reducer(state, { type: 'UNRELATED' })).toBe(state);
    expect(currentOffset(makeState({ offset: 60000 }))).toBe(60000);
  });

  it('updates observed time only from events for the active video route', () => {
    const state = makeState();
    expect(reducer(state, videoTime(ROUTE, 6123)).offset).toBe(6123);
    expect(reducer(state, videoTime('previous-route', 999)).offset).toBe(5000);
    expect(reducer(state, videoTime(ROUTE, NaN))).toBe(state);
    expect(reducer(state, videoTime(ROUTE, Infinity))).toBe(state);
    expect(reducer(state, videoTime(ROUTE, 5000))).toBe(state);
  });

  it('play, pause, and buffering commands preserve the observed clock', () => {
    let state = makeState();
    state = reducer(state, pause());
    expect(state).toMatchObject({ offset: 5000, desiredPlaySpeed: 0 });
    state = reducer(state, play(0.5));
    expect(state).toMatchObject({ offset: 5000, desiredPlaySpeed: 0.5 });
    state = reducer(state, bufferVideo(true));
    expect(state).toMatchObject({ offset: 5000, desiredPlaySpeed: 0.5, isBufferingVideo: true });
    state = reducer(state, bufferVideo(false));
    expect(state).toMatchObject({ offset: 5000, isBufferingVideo: false });
  });

  it('issues seek commands without claiming that the video has arrived', () => {
    let state = reducer(makeState(), seek(30000));
    expect(state.seekRequest).toEqual({ id: 2, offset: 30000 });
    expect(currentOffset(state)).toBe(5000);
    state = reducer(state, seek(30000));
    expect(state.seekRequest).toEqual({ id: 3, offset: 30000 });
    state = reducer(state, videoTime(ROUTE, 30000));
    expect(currentOffset(state)).toBe(30000);
  });

  it('does not overwrite an outstanding seek on buffering or pause', () => {
    let state = makeState({ offset: 5000, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
    state = reducer(state, seek(15000));
    state = reducer(state, bufferVideo(true));
    state = reducer(state, pause());
    expect(state.seekRequest).toEqual({ id: 2, offset: 15000 });
    expect(state.offset).toBe(5000);
  });

  it.each([
    [-1000, 0], [0, 0], [60001, 60000],
  ])('clamps whole-drive seek %s to %s with a zero-start loop', (requested, expected) => {
    const state = reducer(makeState(), seek(requested));
    expect(state.seekRequest.offset).toBe(expected);
    expect(state.offset).toBe(5000);
  });

  it.each([[0, 10000], [30000, 20000]])('clamps seek %s to selected range %s', (requested, expected) => {
    const state = makeState({ loop: { startTime: 10000, duration: 10000 } });
    expect(reducer(state, seek(requested)).seekRequest.offset).toBe(expected);
  });

  it('clamps seeks to available camera time and keeps the selected end', () => {
    const state = reducer(makeState({ currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 800 } }), seek(0));
    expect(state.loop).toEqual({ startTime: 800, duration: 59200 });
    expect(state.seekRequest.offset).toBe(800);
    expect(playbackBounds(state)).toEqual({ start: 800, end: 60000 });
  });

  it('corrects initial seeking when first-camera timing arrives late', () => {
    const state = makeState({ offset: null, currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 800 } });
    const next = reducer(state, { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: ROUTE });
    expect(next.seekRequest).toEqual({ id: 2, offset: 800 });
    expect(next.offset).toBeNull();
    expect(next.loop).toEqual({ startTime: 800, duration: 59200 });
  });

  it('does not rewind video already beyond late first-camera timing', () => {
    const state = makeState({ currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 800 } });
    expect(reducer(state, { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: ROUTE }).seekRequest.id).toBe(1);
  });

  it('preserves an outstanding seek when first-camera timing arrives before it settles', () => {
    let state = reducer(makeState({ offset: 100 }), seek(30000));
    state = { ...state, currentRoute: { ...state.currentRoute, videoStartOffset: 800 } };
    state = reducer(state, { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: ROUTE });
    expect(state.seekRequest).toEqual({ id: 2, offset: 30000 });
    expect(state.offset).toBe(100);
    expect(state.loop).toEqual({ startTime: 800, duration: 59200 });
    state = reducer(state, videoTime(ROUTE, 30000));
    expect(currentOffset(state)).toBe(30000);
  });

  it('clamps the latest seek command when late camera timing makes it unavailable', () => {
    let state = reducer(makeState({ offset: 100 }), seek(200));
    state = { ...state, currentRoute: { ...state.currentRoute, videoStartOffset: 800 } };
    state = reducer(state, { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: ROUTE });
    expect(state.seekRequest).toEqual({ id: 3, offset: 800 });
    expect(state.offset).toBe(100);
  });

  it('does not issue a seek in response to metadata for a previous route', () => {
    const state = makeState({
      offset: 100,
      currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 800 },
    });
    const next = reducer(state, { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: 'previous-route' });
    expect(next.seekRequest).toBe(state.seekRequest);
    expect(next.offset).toBe(100);
  });

  it('does not replay a valid old seek to compensate for an outdated observed origin', () => {
    const state = makeState({
      offset: 100,
      seekRequest: { id: 7, offset: 15000 },
      currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 800 },
    });
    const next = reducer(state, { type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: ROUTE });
    expect(next.seekRequest).toBe(state.seekRequest);
    expect(next.offset).toBe(100);
    expect(reducer(next, videoTime(ROUTE, 900)).offset).toBe(900);
  });

  it('collapses a range entirely before the first available camera frame', () => {
    const state = reducer(makeState({ currentRoute: { fullname: ROUTE, duration: 60000, videoStartOffset: 800 } }), selectLoop(0, 500));
    expect(state.loop).toEqual({ startTime: 800, duration: 0 });
    expect(playbackBounds(state)).toEqual({ start: 800, end: 800 });
    expect(state.desiredPlaySpeed).toBe(0);
    expect(reducer(state, play()).desiredPlaySpeed).toBe(0);
    expect(reducer(state, resetPlayback()).desiredPlaySpeed).toBe(0);
  });

  it('requests the selected start when resetting without changing observed time', () => {
    const state = reducer(makeState({ zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 }, desiredPlaySpeed: 0 }), resetPlayback());
    expect(state).toMatchObject({ offset: 5000, desiredPlaySpeed: 1, isBufferingVideo: true });
    expect(state.seekRequest.offset).toBe(10000);
  });

  it('invalidates old observed time and chooses the new route range', () => {
    const state = makeState({ currentRoute: { fullname: 'new-route', duration: 60000 }, zoom: { start: 10000, end: 20000 } });
    const next = reducer(state, { type: Types.TIMELINE_PUSH_SELECTION });
    expect(next).toMatchObject({ offset: null, playbackRoute: 'new-route', isBufferingVideo: true });
    expect(next.seekRequest).toEqual({ id: 2, offset: 10000 });
    expect(next.loop).toEqual({ startTime: 10000, duration: 10000 });
    expect(reducer(next, videoTime(ROUTE, 12000)).offset).toBeNull();
  });

  it('initializes a whole drive on a cold route load', () => {
    const state = makeState({ offset: null, playbackRoute: null });
    const next = reducer(state, { type: Types.ACTION_ROUTES_METADATA });
    expect(next.seekRequest.offset).toBe(0);
    expect(next.loop).toEqual({ startTime: 0, duration: 60000 });
  });

  it('clears observed route time when leaving the drive', () => {
    const next = reducer(makeState({ currentRoute: null, zoom: null }), { type: Types.TIMELINE_PUSH_SELECTION });
    expect(next).toMatchObject({ offset: null, playbackRoute: null, loop: null, isBufferingVideo: false });
  });

  it.each([NaN, Infinity, -1, 0])('ignores invalid playback speed %s', (speed) => {
    expect(reducer(makeState(), play(speed)).desiredPlaySpeed).toBe(1);
  });

  it.each([NaN, Infinity])('ignores invalid seek %s', (offset) => {
    const state = makeState();
    expect(reducer(state, seek(offset))).toBe(state);
  });

  it('clears an invalid loop rather than wrapping with zero or negative duration', () => {
    expect(reducer(makeState(), selectLoop(1000, 1000)).loop).toBeNull();
    expect(reducer(makeState(), selectLoop(2000, 1000)).loop).toBeNull();
  });
});
