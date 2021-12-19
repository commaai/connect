import { getDriveStats } from './index';

describe('drive stats', () => {
  it('no events', () => {
    expect(getDriveStats({ event: [] })).toEqual(0.0);
  });

  it('calculate percentage', () => {
    const startTimestamp = 1639888155 * 1000;
    expect(
      getDriveStats({
        duration: 600000,
        events: [
          { type: 'engage', timestamp: startTimestamp },
          { type: 'disengage', timestamp: startTimestamp + 1 * 60 * 1000 },
          { type: 'engage', timestamp: startTimestamp + 2 * 60 * 1000 },
          {
            type: 'disengage-steer',
            timestamp: startTimestamp + 3 * 60 * 1000,
          },
        ],
      })
    ).toEqual({ engagedPercentage: '0.20' });
  });
});
