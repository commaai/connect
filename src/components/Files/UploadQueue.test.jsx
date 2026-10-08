import React from 'react';
import { render, screen } from '@testing-library/react';
import { UploadQueue } from './UploadQueue';

vi.mock('../../actions/files', () => ({
  fetchUploadQueue: vi.fn(), cancelUploads: vi.fn(), cancelFetchUploadQueue: vi.fn(),
  FILE_NAMES: { logs: ['rlog.bz2'] },
}));

function queue(paused, cellular = true, online = true) {
  const device = { dongle_id: 'device', network_metered: cellular,
    fetched_at: 1000, last_athena_ping: online ? 1000 : 1 };
  const filesUploading = Object.fromEntries(paused.map((value, i) => [String(i), {
    fileName: `device|2026-10-08--12-00-00--${i}/logs`, paused: value, progress: 0,
  }]));
  return <UploadQueue open update={false} classes={{}} dispatch={vi.fn()} device={device}
    filesUploading={filesUploading} filesUploadingMeta={{ dongleId: 'device' }} />;
}

test('explains why an entirely paused cellular queue needs WiFi', () => {
  render(queue([true, true]));
  expect(screen.getByText('Connect to WiFi')).toBeVisible();
  expect(screen.getByText('uploading paused on cellular connection')).toBeVisible();
  expect(screen.getAllByText('paused')).toHaveLength(2);
});

test.each([
  [[true, false], true, true],
  [[false, false], true, true],
  [[true, true], false, true],
  [[], true, true],
  [[true], true, false],
])('does not mislabel other queue states: %j, cellular=%s, online=%s', (paused, cellular, online) => {
  render(queue(paused, cellular, online));
  expect(screen.queryByText('Connect to WiFi')).toBeNull();
});

test('does not warn using a previous device’s queue', () => {
  const view = queue([true, true]);
  render(React.cloneElement(view, { filesUploadingMeta: { dongleId: 'other-device' } }));
  expect(screen.queryByText('Connect to WiFi')).toBeNull();
});
