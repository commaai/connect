import Raven from 'raven-js';

export const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mbxDirections = require('@mapbox/mapbox-sdk/services/directions');

let geocodingClient = null;
let directionsClient = null;
if (MAPBOX_TOKEN) {
  geocodingClient = mbxGeocoding({ accessToken: MAPBOX_TOKEN });
  directionsClient = mbxDirections({ accessToken: MAPBOX_TOKEN });
} else {
  console.warn('Missing mapbox token');
}

export default function geocodeApi() {
  function getNeighborhood(context) {
    return (context.id.indexOf('neighborhood') !== -1);
  }

  function getLocality(context) {
    return (context.id.indexOf('place') !== -1);
  }

  function getRegion(context) {
    return (context.id.indexOf('region') !== -1);
  }

  return {
    async reverseLookup(coords) {
      if (geocodingClient === null) {
        return null;
      }

      const response = await geocodingClient.reverseGeocode({
        query: [coords[0], coords[1]],
        limit: 1,
      }).send();

      try {
        const { features } = response.body;
        if (features.length && features[0].context) {
          let region = features[0].context.filter(getRegion)[0].short_code;
          if (region.indexOf('US-') !== -1) { region = region.substr(3); }
          const locality = features[0].context.filter(getLocality)[0].text;
          const _neighborhood = features[0].context.filter(getNeighborhood)[0];
          const neighborhood = _neighborhood ? _neighborhood.text : locality;

          return {
            region,
            locality,
            neighborhood,
          };
        }
      } catch (err) {
        Raven.captureException(err);
      }
    },

    async forwardLookup(query, proximity) {
      if (!geocodingClient) {
        return null;
      }

      const resp = await geocodingClient.forwardGeocode({
        query: query,
        mode: "mapbox.places",
        proximity: proximity,
        limit: 8,
        types: ['postcode', 'place', 'locality', 'address', 'poi'],
      }).send();

      return resp.body.features;
    },

    async getDirections(points) {
      if (!directionsClient) {
        return null;
      }

      const resp = await directionsClient.getDirections({
        profile: 'driving-traffic',
        waypoints: points.map((p) => { return { coordinates: p }; }),
        annotations: ['distance', 'duration'],
        geometries: 'geojson',
        overview: 'full',
      }).send();

      return resp.body.routes;
    },
  };
}
