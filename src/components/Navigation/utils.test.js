/* eslint-env jest */
import * as Utils from './utils';

class OldBehavior {
  static formatSearchName(item) {
    if (item.resultType === 'place' || item.resultType === 'car') {
      return item.title;
    }
    return item.title.split(',', 1)[0];
  }

  static formatSearchDetails(item, comma = false) {
    const name = OldBehavior.formatSearchName(item);
    const addrLabelName = item.address.label.split(',', 1)[0];
    let res;
    if (name.substr(0, addrLabelName.length) === addrLabelName) {
      res = item.address.label.split(', ').slice(1).join(', ');
    } else {
      res = item.address.label;
    }
    return res ? (comma ? ', ' : '') + res : '';
  }
}

describe('navigation formatting utils', () => {
  const testCases = [
    {
      item: {
        title: 'Taco Bell',
        distance: 1234,
        address: {
          label: 'Taco Bell, 2011 Camino del Rio N, San Diego, CA 92108, United States',
          countryCode: 'USA',
          countryName: 'United States',
          stateCode: 'CA',
          state: 'California',
          county: 'San Diego',
          city: 'San Diego',
          district: 'Mission Valley East',
          street: 'Camino del Rio N',
          postalCode: '92108',
          houseNumber: '2011',
        },
      },

      // expected
      name: 'Taco Bell',
      address: '2011 Camino del Rio N, San Diego, CA 92108, United States',
      shortAddress: ', 2011 Camino del Rio N, San Diego (0.8 mi)',
    },
    {
      item: {
        title: '1441 State St, San Diego, CA 92101-3421, United States',
        distance: 1234,
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
      address: '1441 State St, San Diego, CA 92101-3421, United States',
      shortAddress: ', San Diego (0.8 mi)',
    },
  ];

  it('formats search items correctly', () => {
    testCases.forEach((testCase) => {
      const {
        item,
        name,
        address,
        shortAddress,
      } = testCase;

      expect(Utils.formatSearchName(item)).toBe(name);
      expect(Utils.formatSearchAddress(item)).toBe(address);
      expect(Utils.formatSearchDetails(item)).toBe(shortAddress);
    });
  });
});
