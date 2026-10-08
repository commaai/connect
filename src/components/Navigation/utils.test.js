import * as Utils from './utils';

describe('navigation formatting utils', () => {
  test.each([
    [{ stateCode: 'CA' }, 'San Diego, CA'],
    [{ postalCode: '92104' }, 'San Diego, 92104'],
    [{ stateCode: 'CA', postalCode: '92104' }, 'San Diego, CA 92104'],
    [{}, 'San Diego'],
  ])('formats optional state and postal code: %j', (region, expected) => {
    expect(Utils.formatPlaceAddress({ title: 'Place', resultType: 'houseNumber',
      address: { city: 'San Diego', street: 'Main Street', ...region } })).toBe(expected);
  });

  test.each([
    ['York', 'Yorkshire Road', 'Yorkshire Road'],
    ['', 'Main Street', 'Main Street'],
    ['Cafe', 'Cafe, Main Street', 'Main Street'],
    ['York', 'York', 'York'],
  ])('only removes a complete name prefix from the label', (title, label, expected) => {
    expect(Utils.formatPlaceAddress({ title, resultType: 'car', address: { label } })).toBe(expected);
  });
  describe('location formatting', () => {
    const testCases = [
      {
        // from mapbox api
        item: {
          title: 'Taco Bell',
          resultType: 'place',
          address: {
            label: 'Taco Bell, 2626 El Cajon Blvd, San Diego, CA 92104, United States',
            countryCode: 'USA',
            countryName: 'United States',
            stateCode: 'CA',
            state: 'California',
            county: 'San Diego',
            city: 'San Diego',
            district: 'North Park',
            street: 'El Cajon Blvd',
            postalCode: '92104',
            houseNumber: '2626',
          },
        },

        // expected
        name: 'Taco Bell',
        address: '2626 El Cajon Blvd, San Diego, CA 92104',
      },
      {
        // from mapbox api
        item: {
          title: '1441 State St, San Diego, CA 92101-3421, United States',
          resultType: 'houseNumber',
          address: {
            label: '1441 State St, San Diego, CA 92101-3421, United States',
            countryCode: 'USA',
            countryName: 'United States',
            stateCode: 'CA',
            state: 'California',
            county: 'San Diego',
            city: 'San Diego',
            district: 'Little Italy',
            street: 'State St',
            postalCode: '92101-3421',
            houseNumber: '1441',
          },
        },

        // expected
        name: '1441 State St',
        address: 'San Diego, CA 92101-3421',
      },
      {
        // from mapbox api
        item: {
          title: 'Taco Bell',
          resultType: 'place',
          address: {
            label: 'Taco Bell, Irlam Drive, Liverpool, L32 8, United Kingdom',
            countryCode: 'GBR',
            countryName: 'United Kingdom',
            state: 'England',
            countyCode: 'MSY',
            county: 'Merseyside',
            city: 'Liverpool',
            district: 'Kirkby',
            street: 'Irlam Drive',
            postalCode: 'L32 8',
          },
        },

        // expected
        name: 'Taco Bell',
        address: 'Irlam Drive, Liverpool, L32 8',
      },
      {
        // from mapbox api
        item: {
          title: '123 Victoria Street, London, SW1E 6, United Kingdom',
          resultType: 'houseNumber',
          address: {
            label: '123 Victoria Street, London, SW1E 6, United Kingdom',
            countryCode: 'GBR',
            countryName: 'United Kingdom',
            state: 'England',
            countyCode: 'LDN',
            county: 'London',
            city: 'London',
            district: 'St James\'s Park',
            street: 'Victoria Street',
            postalCode: 'SW1E 6',
            houseNumber: '123',
          },
        },

        // expected
        name: '123 Victoria Street',
        address: 'London, SW1E 6',
      },
      {
        // from mapbox api
        item: {
          title: '1441 Rd & State Road 76, Chimayo, NM 87522, United States',
          resultType: 'intersection',
          address: {
            label: '1441 Rd & State Road 76, Chimayo, NM 87522, United States',
            countryCode: 'USA',
            countryName: 'United States',
            stateCode: 'NM',
            state: 'New Mexico',
            county: 'Rio Arriba',
            city: 'Chimayo',
            streets: [
              '1441 Rd',
              'State Road 76',
            ],
            postalCode: '87522',
          },
        },

        // expected
        name: '1441 Rd & State Road 76',
        address: 'Chimayo, NM 87522',
      },
    ];

    testCases.forEach((testCase) => {
      test(testCase.address, () => {
        const { item } = testCase;

        expect(Utils.formatPlaceName(item)).toBe(testCase.name);
        expect(Utils.formatPlaceAddress(item)).toBe(testCase.address);
      });
    });
  });
});
