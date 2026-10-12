import React from 'react';
import { Provider } from 'react-redux';
import { fireEvent, render, screen } from '@testing-library/react';

import TimeDisplay from '.';

vi.mock('../../timeline/playback', async (importOriginal) => ({
  ...(await importOriginal()),
  play: (speed) => ({ type: 'play', speed }),
}));

const route = { duration: 60000, start_time_utc_millis: 0, segment_numbers: [0] };

describe('TimeDisplay speed control', () => {
  it('lists every speed and plays at the one picked', () => {
    const store = {
      getState: () => ({ currentRoute: route, loop: null, zoom: { start: 0, end: 60000 }, desiredPlaySpeed: 1 }),
      subscribe: () => () => {},
      dispatch: vi.fn(),
    };
    render(<Provider store={store}><TimeDisplay isMuted hasAudio={false} onMuteToggle={() => {}} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Playback speed' }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent))
      .toEqual(['0.1×', '0.25×', '0.5×', '1×', '2×', '4×', '8×']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '8×' }));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'play', speed: 8 });
  });
});
