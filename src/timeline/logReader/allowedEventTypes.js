import { Event_Which as EventWhich } from '@commaai/log_reader/capnp/log.capnp';

export default function filterEvent(which) {
  switch (which) {
    case EventWhich.FRAME:
    case EventWhich.MODEL:
    case EventWhich.LIVE20:
    case EventWhich.LIVE100:
    case EventWhich.LIVE_MAP_DATA:
    case EventWhich.LIVE_MPC:
    case EventWhich.INIT_DATA:
    case EventWhich.CAR_STATE:
    case EventWhich.LIVE_CALIBRATION:
    case EventWhich.DRIVER_MONITORING:
    case EventWhich.THUMBNAIL:
      return true;
    default:
      return false;
  }
}
