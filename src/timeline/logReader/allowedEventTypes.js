import { Event_Which as EventWhich } from '@commaai/log_reader/capnp/log.capnp';

export default function filterEvent(which) {
  switch (which) {
    case EventWhich.MODEL:
    case EventWhich.MODEL_V2:
    case EventWhich.RADAR_STATE:
    case EventWhich.LIVE_MPC:
    case EventWhich.INIT_DATA:
    case EventWhich.CAR_STATE:
    case EventWhich.CONTROLS_STATE:
    case EventWhich.LIVE_CALIBRATION:
    case EventWhich.THUMBNAIL:
    case EventWhich.ROAD_CAMERA_STATE:
      return true;
    default:
      return false;
  }
}
