// Actual /demo backing route fields retrieved 2026-10-08 from:
// https://api.comma.ai/v1/devices/5beb9b58bd12b691/routes_segments?route_str=5beb9b58bd12b691%7C0000010a--a51155e496
// log_id and duration are the same derivations used by checkRoutesData.
export const publicRoute = {
  fullname: '5beb9b58bd12b691|0000010a--a51155e496',
  log_id: '0000010a--a51155e496',
  start_time_utc_millis: 1772040630000,
  end_time_utc_millis: 1772041555000,
  duration: 1772041555000 - 1772040630000,
};

// Actual event retrieved from the same route's /0/events.json on 2026-10-08:
// https://chffrprivate.azureedge.net/chffrprivate3/v2/5beb9b58bd12b691/60a8a2e4054c707786282bb7324800ba_0000010a--a51155e496/0/events.json
export const firstFrame = {
  type: 'event', time: 429535234277855, offset_millis: 827,
  route_offset_millis: 849, data: { event_type: 'first_road_camera_frame' },
};

// Actual coordinates from the same route /0/coords.json, retrieved 2026-10-08.
// https://chffrprivate.azureedge.net/chffrprivate3/v2/5beb9b58bd12b691/60a8a2e4054c707786282bb7324800ba_0000010a--a51155e496/0/coords.json
// The [lng, lat] projection matches fetchDriveCoords.
export const publicCoords = {
  "3": [
    -117.19469469,
    32.74979423
  ],
  "20": [
    -117.1954074,
    32.74971494
  ],
  "21": [
    -117.1955146,
    32.74980555
  ]
};
