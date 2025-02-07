import { describe, expect, test } from 'vitest'

import { getFullAddress, getPlaceDetails, reverseGeocode } from './geocode'

describe('reverseGeocode', () => {
  test('return null if coords are [0, 0]', async () => {
    expect(await reverseGeocode([0, 0])).toBeNull()
  })
})

describe('getFullAddress', () => {
  test('return null if coords are [0, 0]', async () => {
    expect(await getFullAddress([0, 0])).toBeNull()
  })

  test('normal usage', async () => {
    expect(await getFullAddress([-77.036551, 38.898104])).toBe('1450 Pennsylvania Avenue Northwest, Washington, District of Columbia 20037, United States')
    expect(await getFullAddress([-0.106640, 51.514209])).toBe('133 Fleet Street, City of London, London, EC4A 2BB, United Kingdom')
    expect(await getFullAddress([-2.076843, 51.894799])).toBe('4 Montpellier Drive, Cheltenham, GL50 1TX, United Kingdom')
  })
})

describe('getPlaceDetails', () => {
  test('return null if coords are [0, 0]', async () => {
    expect(await getPlaceDetails([0, 0])).toBeNull()
  })

  test('normal usage', async () => {
    expect(await getPlaceDetails([-117.168638, 32.723695])).toEqual({
      name: 'Little Italy',
      details: 'San Diego, CA',
    })
    expect(await getPlaceDetails([-118.192757, 33.763015])).toEqual({
      name: 'Downtown Long Beach',
      details: 'Long Beach, CA',
    })
    expect(await getPlaceDetails([-74.003225, 40.714057])).toEqual({
      name: 'Civic Center',
      details: 'New York, NY',
    })
    expect(await getPlaceDetails([-0.113643, 51.504546])).toEqual({
      name: 'Waterloo',
      details: 'London, ENG',
    })
    expect(await getPlaceDetails([5.572254, 50.644280])).toEqual({
      name: 'Liege',
      details: 'Liège, WLG',
    })
    expect(await getPlaceDetails([-2.236802, 53.480931])).toEqual({
      name: 'Northern Quarter',
      details: 'Manchester, ENG',
    })
  })
})
