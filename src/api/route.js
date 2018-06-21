import ConfigRequestPromise from './config-request-promise';

export default function routeApi(routeSigUrl) {
  const request = ConfigRequestPromise();
  request.configure({
    baseUrl: routeSigUrl + '/'
  })

  return {
    getCoords: async function() {
      const coordsJson = await request.get("route.coords");

      return JSON.parse(coordsJson);
    }
  }
}


