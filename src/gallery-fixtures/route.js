import rawEvents from './5beb9b58bd12b691/0000010a--a51155e496/events.json';

const thumbnailModules = import.meta.glob(
  './5beb9b58bd12b691/0000010a--a51155e496/*/sprite.jpg',
  { eager: true, import: 'default', query: '?url' },
);

export const galleryDongleId = '5beb9b58bd12b691';
export const galleryLogId = '0000010a--a51155e496';
export const galleryRouteName = `${galleryDongleId}|${galleryLogId}`;
export const galleryRouteAssetRoot = `/gallery-data/${galleryDongleId}/${galleryLogId}`;

const routeDuration = 925000;
const alertStatuses = ['normal', 'userPrompt', 'critical'];

function parseEvents(events) {
  const normalized = events
    .map((event) => ({
      ...event,
      data: {
        ...event.data,
        alertStatus: typeof event.data?.alertStatus === 'number'
          ? alertStatuses[event.data.alertStatus]
          : event.data?.alertStatus,
      },
    }))
    .sort((a, b) => a.route_offset_millis - b.route_offset_millis);

  const parsed = [];
  let engaged = null;
  let alert = null;
  let overriding = null;

  for (const event of normalized) {
    if (event.type === 'state') {
      if (engaged && !event.data.enabled) {
        engaged.data.end_route_offset_millis = event.route_offset_millis;
        engaged = null;
      }
      if (!engaged && event.data.enabled) {
        engaged = { ...event, type: 'engage', data: { ...event.data } };
        parsed.push(engaged);
      }

      if (alert && event.data.alertStatus !== alert.data.alertStatus) {
        alert.data.end_route_offset_millis = event.route_offset_millis;
        alert = null;
      }
      if (!alert && event.data.alertStatus !== 'normal') {
        alert = { ...event, type: 'alert', data: { ...event.data } };
        parsed.push(alert);
      }

      if (overriding && event.data.state !== overriding.data.state) {
        overriding.data.end_route_offset_millis = event.route_offset_millis;
        overriding = null;
      }
      if (!overriding && ['overriding', 'preEnabled'].includes(event.data.state)) {
        overriding = { ...event, type: 'overriding', data: { ...event.data } };
        parsed.push(overriding);
      }
    } else if (event.type === 'event') {
      parsed.push(event);
    }
  }

  for (const openEvent of [engaged, alert, overriding]) {
    if (openEvent) openEvent.data.end_route_offset_millis = routeDuration;
  }

  return parsed;
}

const segmentNumbers = Array.from({ length: 16 }, (_, index) => index);
const thumbnailUrls = Object.fromEntries(Object.entries(thumbnailModules).map(([path, url]) => {
  const segment = Number(path.split('/').at(-2));
  return [segment, url];
}));
const segmentStartTimes = segmentNumbers.map((index) => 1772040630000 + (index * 60000));
const segmentEndTimes = segmentNumbers.map((index) => (
  index === 15 ? 1772041555000 : 1772040690000 + (index * 60000)
));

export const galleryRoute = {
  car_id: 1238,
  create_time: 1772040714,
  distance: 10.1977,
  dongle_id: galleryDongleId,
  duration: routeDuration,
  end_lat: 32.8751,
  end_lng: -117.21,
  endLocation: { place: 'La Jolla', details: 'San Diego, CA' },
  end_time: '2026-02-25T17:45:55',
  end_time_utc_millis: 1772041555000,
  events: parseEvents(rawEvents),
  fullname: galleryRouteName,
  is_preserved: true,
  is_public: true,
  log_id: galleryLogId,
  make: 'ford',
  maxqlog: 15,
  platform: 'FORD_BRONCO_SPORT_MK1',
  procqlog: 15,
  segment_durations: segmentNumbers.map((index) => (index === 15 ? 25000 : 60000)),
  segment_end_times: segmentEndTimes,
  segment_numbers: segmentNumbers,
  segment_start_times: segmentStartTimes,
  share_exp: '1785555165',
  share_sig: 'mtMB711rntvahC9rxBABoIKSx9bUYVr142x0qhvTCBo=',
  start_lat: 32.7498,
  start_lng: -117.195,
  startLocation: { place: 'San Diego', details: 'California' },
  start_time: '2026-02-25T17:30:30',
  start_time_utc_millis: 1772040630000,
  thumbnailUrls,
  url: galleryRouteAssetRoot,
  version: '0.10.4',
};

export const galleryDevice = {
  alias: 'Bronco Sport',
  commacare: true,
  device_type: 'tici',
  dongle_id: galleryDongleId,
  eligible_features: { prime_data: true },
  is_owner: true,
  last_athena_ping: Math.floor(Date.now() / 1000),
  prime: false,
  rpc: { not_car: false },
  serial: 'cb421c10',
  version: '0.10.4',
};

export const galleryBodyDevice = {
  ...galleryDevice,
  alias: 'comma body',
  device_type: 'tizi',
  rpc: { not_car: true },
};

export const galleryProfile = {
  email: 'driver@example.com',
  id: 'fake-user',
  superuser: false,
  user_id: 'fake-user',
};

export const gallerySubscribeInfo = {
  allow_data: true,
  amount: 2400,
  device_online: true,
  eligible: true,
  is_prime_sim: true,
  sim_id: '89014103211118510720',
  sim_type: 'blue',
  sim_usable: true,
  trial_claimable: true,
};

export const gallerySubscription = {
  amount: 2400,
  cancel_at_period_end: false,
  current_period_end: Math.floor(Date.now() / 1000) + (86400 * 25),
  next_charge_at: Math.floor(Date.now() / 1000) + (86400 * 25),
  plan: 'data',
  status: 'active',
  subscribed_at: Math.floor(Date.now() / 1000) - (86400 * 190),
  trial_end: null,
  user_id: galleryProfile.user_id,
};
