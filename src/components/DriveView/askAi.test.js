import { askAiPrompt, askAiSegments } from './askAi';

const route = {
  fullname: 'abc|0000010a--a51155e496',
  platform: 'FORD_BRONCO_SPORT_MK1',
  version: '0.10.4',
  git_branch: 'nightly',
  git_commit: '49a611df',
  duration: 15 * 60000,
  events: [
    { type: 'engage', route_offset_millis: 22000, data: { end_route_offset_millis: 200000 } },
    { type: 'bookmark', route_offset_millis: 190000, data: { end_route_offset_millis: 191000 } },
    { type: 'alert', route_offset_millis: 600000, data: { alertStatus: 2, end_route_offset_millis: 602000 } },
  ],
};

test('picks at most 5 segments around the current one inside the zoom', () => {
  expect(askAiSegments({ startTime: 0, duration: 15 * 60000 }, 3.5 * 60000)).toEqual([1, 2, 3, 4, 5]);
  expect(askAiSegments({ startTime: 0, duration: 15 * 60000 }, 0)).toEqual([0, 1, 2, 3, 4]);
  expect(askAiSegments({ startTime: 0, duration: 15 * 60000 }, 14.9 * 60000)).toEqual([10, 11, 12, 13, 14]);
  expect(askAiSegments({ startTime: 120000, duration: 90000 }, 150000)).toEqual([2, 3]);
});

test('prompt has the car, version, timeline and log links for the window', () => {
  const files = { 'abc|0000010a--a51155e496--3/qlogs': { url: 'https://example.com/3/qlog.zst' } };
  const prompt = askAiPrompt(route, files, [2, 3], 190000);
  expect(prompt).toContain('Car: FORD_BRONCO_SPORT_MK1');
  expect(prompt).toContain('openpilot: 0.10.4, branch nightly, commit 49a611df');
  expect(prompt).toContain('- 0:22-3:20 engaged');
  expect(prompt).toContain('- 3:10 driver bookmarked this moment');
  expect(prompt).not.toContain('critical alert');
  expect(prompt).toContain('segment 3 (3:00-4:00): https://example.com/3/qlog.zst');
  expect(prompt).not.toContain('segment 2');
});
