import { forwardLookup } from "./geocode";

export async function coordinatesFromMapsUrl(urlString) {
  let url = new URL(urlString);
  if (url.hostname === 'maps.apple.com') {
    if (!url.searchParams.has('ll')) {
      return null;
    }

    let ll = url.searchParams.get('ll');
    let coords = ll.split(',').map((x) => parseFloat(x));
    return coords;
  } else if (['maps.google.com', 'google.com'].includes(url.hostname)) {
    if (!url.searchParams.has('q')) {
      return null;
    }

    let query = url.searchParams.get('q');
    let places = await forwardLookup(query, null, null);
    if (places.length === 0) {
      return null;
    }

    let position = places[0].position;
    return [position.lat, position.lng];
  }

  return null;
}