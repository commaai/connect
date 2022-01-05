import { getDriveStats, EVENT_TYPES } from './index';

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
          { type: EVENT_TYPES.ENGAGE, timestamp: startTimestamp },
          { type: EVENT_TYPES.DISENGAGE, timestamp: startTimestamp + 1 * 60 * 1000 },
          { type: EVENT_TYPES.ENGAGE, timestamp: startTimestamp + 2 * 60 * 1000 },
          {
            type: EVENT_TYPES.DISENGAGE_STEER,
            timestamp: startTimestamp + 3 * 60 * 1000,
          },
        ],
      })
    ).toEqual({ engagedPercentage: '0.20' });
  });
});
