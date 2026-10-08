import { getDashboardMapHeight } from './mapSize';

describe('dashboard map height', () => {
  it('starts expanded, eases to the compact height, and stays compact', () => {
    expect(getDashboardMapHeight(800, 0)).toBe(400);
    expect(getDashboardMapHeight(800, 120)).toBe(280);
    expect(getDashboardMapHeight(800, 240)).toBe(160);
    expect(getDashboardMapHeight(800, 500)).toBe(160);
  });
});
