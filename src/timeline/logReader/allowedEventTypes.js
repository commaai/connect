import { Event_Which } from '@commaai/log_reader/capnp/log.capnp';

export default function filterEvent (which) {
  switch (which) {
    case Event_Which.MODEL:
    case Event_Which.LIVE20:
    case Event_Which.LIVE100:
    case Event_Which.LIVE_MAP_DATA:
    case Event_Which.LIVE_MPC:
    case Event_Which.INIT_DATA:
    case Event_Which.CAR_STATE:
    case Event_Which.LIVE_CALIBRATION:
    case Event_Which.DRIVER_MONITORING:
    case Event_Which.THUMBNAIL:
      return true;
    default:
      return false;
  }
}
