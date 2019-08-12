import Raven from 'raven-js';

export const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
let geocodingClient = null;
if (MAPBOX_TOKEN) {
  geocodingClient = mbxGeocoding({
    accessToken: MAPBOX_TOKEN
  });
} else {
  console.warn("Missing mapbox token");
}

export default function geocodeApi() {

  function getNeighborhood (context) {
    return (context.id.indexOf('neighborhood') !== -1);
  }

  function getLocality (context) {
    return (context.id.indexOf('place') !== -1);
  }

  function getRegion (context) {
    return (context.id.indexOf('region') !== -1);
  }

  return {
    reverseLookup: async function(coords) {
      if (geocodingClient === null) {
        return null;
      }

      const response = await geocodingClient.reverseGeocode({
        query: [ coords[0], coords[1] ],
        limit: 1,
      }).send();

      try {
        const features = response.body.features;
        if (features[0].context) {
          let region = features[0].context.filter(getRegion)[0].short_code;
          if (region.indexOf('US-') !== -1) { region = region.substr(3); }
          const locality = features[0].context.filter(getLocality)[0].text;
          const _neighborhood = features[0].context.filter(getNeighborhood)[0];
          const neighborhood = _neighborhood ? _neighborhood.text : locality

          return {
            region,
            locality,
            neighborhood,
          };
        }
      } catch(err) {
        Raven.captureException(err);
      }
    }
  }

}
