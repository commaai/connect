import Raven from 'raven-js';

const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const geocodingClient = mbxGeocoding({
  accessToken: 'pk.eyJ1IjoiY29tbWFhaSIsImEiOiJjamlud2h2czAwNTN5M3dxZWg2Z3hmNnEwIn0.aam-7k03KBbMbtR7cUJslw'
})

export default function geocodeApi() {

  function getNeighborhood (context) {
    return (context.id.includes('neighborhood'));
  }

  function getLocality (context) {
    return (context.id.includes('place'));
  }

  function getRegion (context) {
    return (context.id.includes('region'));
  }

  return {
    reverseLookup: async function(coords) {
      const response = await geocodingClient.reverseGeocode({
        query: [ coords[0], coords[1] ],
        limit: 1,
      }).send();

      try {
        const features = response.body.features;
        if (features[0].context) {
          let region = features[0].context.filter(getRegion)[0].short_code;
          if (region.includes('US-')) { region = region.substr(3); }
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
