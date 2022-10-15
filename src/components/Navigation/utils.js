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
  return formatDuration(route.duration_typical);
}

export function formatSearchName(item) {
  if (item.resultType === 'place' || item.resultType === 'car') {
    return item.title;
  }
  return item.title.split(',', 1)[0];
}

export function formatSearchAddress(item, full = true) {
  let res;

  if (['street', 'city'].some((key) => !item.address[key])) {
    res = item.address.label;
  } else {
    const { houseNumber, street, city } = item.address;
    res = houseNumber ? `${houseNumber} ${street}, ${city}`.trimStart() : `${street}, ${city}`;
    if (full) {
      const { stateCode, postalCode, countryName } = item.address;
      res += `, ${stateCode} ${postalCode}, ${countryName}`;
    }
  }

  if (!full) {
    const name = formatSearchName(item);
    if (res.startsWith(name)) {
      res = res.substring(name.length + 2);
    }
  }

  return res;
}

export function formatSearchDetails(item) {
  return formatSearchAddress(item, false);
}

export function formatSearchList(item) {
  const address = formatSearchAddress(item, false);
  return `, ${address} (${formatDistance(item.distance)})`;
}
