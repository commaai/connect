import fecha from 'fecha';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/react';

export const emptyDevice = {
  alias: 'Shared device',
  create_time: 1513041169,
  device_type: 'unknown',
  dongle_id: undefined,
  imei: '000000000000000',
  is_owner: false,
  shared: true,
  serial: '00000000',
};

export function filterEvent(event) {
  return (event.type === 'disengage' || event.type === 'disengage_steer');
}

export function formatDriveDuration(duration) {
  const milliseconds = Math.floor((duration % 1000) / 100);
  let seconds = Math.floor((duration / 1000) % 60);
  let minutes = Math.floor((duration / (1000 * 60)) % 60);
  let hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
  hours = (hours < 10) ? hours : hours;
  minutes = (minutes < 10) ? minutes : minutes;
  seconds = (seconds < 10) ? seconds : seconds;
  return {
    hours,
    minutes,
    seconds,
    milliseconds,
  };
}

export function timeFromNow(ts) {
  const dt = (Date.now() - ts) / 1000;
  if (dt > 3600 * 24 * 30) {
    return fecha.format(ts, 'MMM Do YYYY');
  }
  if (dt > 3600 * 24) {
    const days = Math.floor(dt / (3600 * 24));
    const plural = days === 1 ? 'day' : 'days';
    return `${days} ${plural} ago`;
  }
  if (dt > 3600) {
    const hours = Math.floor(dt / 3600);
    const plural = hours === 1 ? 'hour' : 'hours';
    return `${hours} ${plural} ago`;
  }
  if (dt > 60) {
    const mins = Math.floor(dt / 60);
    const plural = mins === 1 ? 'minute' : 'minutes';
    return `${mins} ${plural} ago`;
  }
  return 'just now';
}

export function getDrivePoints(duration) {
  const minutes = Math.floor(duration / (1000 * 60));
  const points = Math.floor(minutes * 1.5); // panda
  return points;
}

export function deviceTypePretty(deviceType) {
  if (deviceType === 'neo') {
    return 'EON';
  } else if (deviceType === 'freon') {
    return 'freon';
  } else if (deviceType === 'unknown') {
    return 'unknown';
  } else {
    return `comma ${deviceType}`;
  }
}

export function deviceIsOnline(device) {
  if (!device || !device.last_athena_ping) {
    return false;
  }
  return device.last_athena_ping >= (device.fetched_at - 120);
}

export function deviceOnCellular(device) {
  if (!device) {
    return null;
  }
  return device.network_metered;
}

export function isTouchDevice() {
  return (('ontouchstart' in window) ||
     (navigator.maxTouchPoints > 0) ||
     (navigator.msMaxTouchPoints > 0));
}

export function pairErrorToMessage(err, sentry_finterprint) {
  let msg;
  if (err.message.indexOf('400') === 0) {
    msg = 'invalid request';
  } else if (err.message.indexOf('401') === 0) {
    msg = 'could not decode token';
  } else if (err.message.indexOf('403') === 0) {
    msg = 'device paired with different owner';
  } else if (err.message.indexOf('404') === 0) {
    msg = 'tried to pair invalid device';
  } else if (err.message.indexOf('417') === 0) {
    msg = 'pair token not true';
  } else {
    msg = 'unable to pair';
    console.log(err);
    if (sentry_finterprint) {
      Sentry.captureException(err, { fingerprint: sentry_finterprint });
    }
  }
  return msg;
}

export function verifyPairToken(pairToken, from_url, sentry_finterprint) {
  let decoded;
  try {
    decoded = jwt.decode(pairToken, { complete: true });
  } catch (err) {
    // https://github.com/auth0/node-jsonwebtoken#errors--codes
    if (err instanceof jwt.JsonWebTokenError) {
      throw new Error('invalid QR code, could not decode pair token');
    } else {
      // unkown error, let server verify token
      Sentry.captureException(err, { fingerprint: sentry_finterprint });
      return;
    }
  }

  if (!decoded || !decoded.payload) {
    throw new Error('could not decode pair token');
  }

  if (!decoded.payload.identity) {
    let msg = 'could not get identity from payload';
    if (!from_url) {
      msg += ', make sure you are using openpilot 0.8.3 or newer';
    }
    throw new Error(msg);
  }
}

export function filterRegularClick(func) {
  return (ev) => {
    if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) {
      ev.preventDefault();
      func();
    }
  }
}

export function deviceVersionAtLeast(device, version_string) {
  if (!device || !device['openpilot_version']) {
    return false;
  }

  const dev_version_parts = device['openpilot_version'].split('.')
  const version_parts = version_string.split('.')
  for (const i in version_parts) {
    if (!Number.isInteger(parseInt(dev_version_parts[i]))) {
      return false;
    } else if (parseInt(dev_version_parts[i]) > parseInt(version_parts[i])) {
      return true;
    } else if (parseInt(dev_version_parts[i]) < parseInt(version_parts[i])) {
      return false;
    }
  }
  return true;
}

export function getDeviceFromState(state, dongleId) {
  if (state.device.dongle_id === dongleId) {
    return state.device;
  }
  return state.devices.find((d) => d.dongle_id === dongleId) || null;
}
