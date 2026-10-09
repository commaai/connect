import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

import { cancelFetchUploadQueue, fetchUploadQueue } from '../../actions/files';
import UploadQueue from './UploadQueue';

vi.mock('../../actions/files', () => ({
  cancelUploads: vi.fn(),
  cancelFetchUploadQueue: vi.fn(),
  fetchUploadQueue: vi.fn(() => ({ type: 'FETCH_UPLOAD_QUEUE' })),
}));

const device = { dongle_id: '0000aaaa0000aaaa', last_athena_ping: 0 };
const store = createStore((state) => state, { filesUploading: {}, filesUploadingMeta: {} });
const queue = (update) => <UploadQueue open={ false } update={ update } device={ device } onClose={ () => {} } />;
const wrap = (children) => <Provider store={ store }>{ children }</Provider>;

it('keeps polling until no queue wants it', async () => {
  const menus = render(<Provider store={ store }>{ queue(true) }</Provider>);
  const idle = render(<Provider store={ store }>{ queue(false) }</Provider>);
  const dialog = render(<Provider store={ store }>{ queue(true) }</Provider>);
  expect(fetchUploadQueue).toHaveBeenCalledWith(device.dongle_id);
  idle.unmount();
  dialog.unmount();
  await Promise.resolve();
  expect(cancelFetchUploadQueue).not.toHaveBeenCalled();
  menus.unmount();
  await Promise.resolve();
  expect(cancelFetchUploadQueue).toHaveBeenCalledTimes(1);
});

it('hands polling from a menu to the dialog, and stops polling no queue owns', async () => {
  cancelFetchUploadQueue.mockClear();
  const view = render(wrap(queue(true)));
  view.rerender(wrap(<>{ queue(false) }{ queue(true) }</>)); // the menu closes as the dialog opens
  await Promise.resolve();
  expect(cancelFetchUploadQueue).not.toHaveBeenCalled();
  view.unmount();
  await Promise.resolve();
  expect(cancelFetchUploadQueue).toHaveBeenCalled();
  cancelFetchUploadQueue.mockClear();
  render(wrap(queue(false))).unmount(); // e.g. after an upload started polling directly
  await Promise.resolve();
  expect(cancelFetchUploadQueue).toHaveBeenCalled();
});
