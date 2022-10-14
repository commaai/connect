export function formatDistance(meters, metric) {
  if (metric) {
    return `${(meters / 1000.0).toFixed(1)} km`;
  }
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

export function formatRouteDistance(route) {
  let metric = true;
  try {
    route.legs[0].admins.forEach((adm) => {
      if (['US', 'GB'].includes(adm.iso_3166_1)) {
        metric = false;
      }
    });
  } catch (err) {
    metric = false;
  }

  return formatDistance(route.distance, metric);
}

export function formatDuration(seconds) {
  let mins = Math.round(seconds / 60.0);
  let res = '';
  if (mins >= 60) {
    const hours = Math.floor(mins / 60.0);
    mins -= hours * 60;
    res += `${hours} hr `;
  }
  return `${res}${mins} min`;
}

export function formatRouteDuration(route) {
  return formatDuration(route.seconds);
}

export function formatSearchName(item) {
  if (item.resultType === 'place' || item.resultType === 'car') {
    return item.title;
  }
  return item.title.split(',', 1)[0];
}

export function formatSearchAddress(item, full = true) {
  const { houseNumber, street, city } = item.address;
  let res = houseNumber ? `${houseNumber} ${street}, ${city}`.trimStart() : `${street}, ${city}`;
  if (full) {
    const { stateCode, postalCode, countryName } = item.address;
    res += `, ${stateCode} ${postalCode}, ${countryName}`;
  }
  return res;
}

export function formatSearchDetails(item) {
  const name = formatSearchName(item);
  let address = formatSearchAddress(item, false);
  if (address.startsWith(name)) {
    address = address.substring(name.length + 2);
  }
  return `, ${address} (${formatDistance(item.distance)})`;
}
