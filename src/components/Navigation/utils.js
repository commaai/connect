export function formatPlaceName(item) {
  if (item.resultType === 'place' || item.resultType === 'car') {
    return item.title;
  }
  return item.title.split(',', 1)[0];
}

/**
 * @param {*} item
 * @returns {string}
 */
export function formatPlaceAddress(item) {
  const { address, resultType } = item;
  let res;

  if (!address.city || ['street', 'streets'].every((key) => !address[key])) {
    res = address.label;
  } else {
    if (!resultType) console.warn('formatSearchAddress: missing resultType', item);

    res = '';

    if (['car', 'place'].includes(resultType)) {
      const { houseNumber, street, streets } = address;
      if (houseNumber) res += `${houseNumber} `;
      if (streets) {
        res += streets.join(' & ');
      } else {
        res += street;
      }
      res += ', ';
    }

    const { city } = address;
    res += `${city}`;

    const { stateCode, postalCode } = address;
    if (stateCode || postalCode) {
      res += ',';
      if (stateCode) res += ` ${stateCode}`;
      res += ` ${postalCode}`;
    }
  }

  // NOTE: this is a hack to remove the name from the address. it's necessary
  //       for cases where we only have the address label, without individual
  //       address components (search results and favorites).
  const name = formatPlaceName(item);
  if (res.startsWith(name)) res = res.substring(name.length + 2);

  return res;
}
