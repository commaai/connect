/* eslint-env jest */
import { priorityGetContext, reverseLookup, forwardLookup } from './geocode';

describe('priorityGetContext', () => {
  it('should return the first context with a priority', () => {
    const contexts = [
      { id: 'place.123' },
      { id: 'locality.123' },
      { id: 'district.123' },
    ];
    expect(priorityGetContext(contexts)).toEqual(contexts[0]);
  });
});

describe('reverseLookup', () => {
  jest.setTimeout(10000);

  it('should return null if coords are [0, 0]', async () => {
    const result = await reverseLookup([0, 0]);
    expect(result).toBeNull();
  });

  it('should return place names', async () => {
    expect(await reverseLookup([-117.12547, 32.71137], true)).toEqual({
      details: 'San Diego, CA 92102, United States',
      place: 'Market St',
    });
    expect(await reverseLookup([-117.166409, 32.731369], true)).toEqual({
      details: 'San Diego, CA 92101, United States',
      place: 'W Laurel St',
    });
    expect(await reverseLookup([-77.036551, 38.898104], true)).toEqual({
      details: 'Washington, DC 20500, United States',
      place: 'White House Lawn',
    });
    expect(await reverseLookup([-0.106640, 51.514209], true)).toEqual({
      details: 'London, EC4A 2BB, United Kingdom',
      place: 'Fleet St',
    });
    expect(await reverseLookup([-2.076843, 51.894799], true)).toEqual({
      details: 'Cheltenham, GL50 1TX, United Kingdom',
      place: 'Montpellier Dr',
    });
  });
});

describe('forwardLookup', () => {
  jest.setTimeout(10000);

  it('should return null if query is empty', async () => {
    const result = await forwardLookup('');
    expect(result).toHaveLength(0);
  });

  it('should return taco bell', async () => {
    const result = await forwardLookup('Taco Bell, 3195 Market St, San Diego, CA 92102');
    const { lat, lng } = result[0].position;
    expect(lat).toBeCloseTo(32.71137, 2);
    expect(lng).toBeCloseTo(-117.12541, 2);
  });
});
