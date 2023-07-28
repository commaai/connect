import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import decodeJwt, { InvalidTokenError } from 'jwt-decode';

import { currentOffset } from '../timeline';

dayjs.extend(relativeTime);

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

export function asyncSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function toBool(item) {
  switch (typeof item) {
    case 'boolean':
      return item;
    case 'number':
      return item < 0 || item > 0;
    case 'object':
      return !!item;
    case 'string':
      return ['true', '1'].indexOf(item.toLowerCase()) >= 0;
    case 'undefined':
      return false;
    default:
      return true;
  }
}

export function formatDriveDuration(duration) {
  const hours = Math.floor((duration / (1000 * 60 * 60))) % 24;
  const minutes = Math.floor((duration / (1000 * 60))) % 60;
  return `${hours > 0 ? `${hours} hr ` : ''}${minutes} min`;
}

export function timeFromNow(ts) {
  const dt = (Date.now() - ts) / 1000;
  if (dt > 3600 * 24 * 30) {
    return dayjs(ts).format('MMM D YYYY');
  } else if (dt > 60) {
    return dayjs(ts).fromNow();
  } else {
    return 'just now';
  }
}

export function deviceTypePretty(deviceType) {
  switch (deviceType) {
    case 'neo':
      return 'EON';
    case 'freon':
      return 'freon';
    case 'unknown':
      return 'unknown';
    default:
      return `comma ${deviceType}`;
  }
}

export function deviceNamePretty(device) {
  return device.alias || deviceTypePretty(device.device_type);
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

export function pairErrorToMessage(err, sentryFingerprint) {
  let msg;
  if (err.message.indexOf('400') === 0) {
    msg = 'invalid request';
  } else if (err.message.indexOf('401') === 0) {
    msg = 'could not decode token - make sure your comma device is connected to the internet';
  } else if (err.message.indexOf('403') === 0) {
    msg = 'device paired with different owner - make sure you logged in with the correct account';
  } else if (err.message.indexOf('404') === 0) {
    msg = 'tried to pair invalid device';
  } else if (err.message.indexOf('417') === 0) {
    msg = 'pair token not true';
  } else {
    msg = 'unable to pair';
    console.error(err);
    if (sentryFingerprint) {
      Sentry.captureException(err, { fingerprint: sentryFingerprint });
    }
  }
  return msg;
}

export function verifyPairToken(pairToken, fromUrl, sentryFingerprint) {
  let decoded;
  try {
    decoded = decodeJwt(pairToken);
  } catch (err) {
    // https://github.com/auth0/jwt-decode#getting-started
    if (err instanceof InvalidTokenError) {
      throw new Error('invalid QR code, could not decode pair token');
    } else {
      // unkown error, let server verify token
      Sentry.captureException(err, { fingerprint: sentryFingerprint });
      return;
    }
  }

  if (!decoded) {
    throw new Error('could not decode pair token');
  }

  if (!decoded.identity) {
    let msg = 'could not get identity from payload';
    if (!fromUrl) {
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
  };
}

export function deviceVersionAtLeast(device, version) {
  if (!device || !device.openpilot_version) {
    return false;
  }

  const deviceParts = device.openpilot_version.split('.');
  const versionParts = version.split('.');
  try {
    for (let i = 0; i < versionParts.length; i++) {
      const devicePart = deviceParts[i] ? parseInt(deviceParts[i], 10) : 0;
      const versionPart = parseInt(versionParts[i], 10);
      if (!Number.isInteger(devicePart) || devicePart < versionPart) {
        return false;
      }
      if (devicePart > versionPart) {
        return true;
      }
    }
    return true;
  } catch (err) {
    Sentry.captureException(err);
    return false;
  }
}

export function getDeviceFromState(state, dongleId) {
  if (state.device.dongle_id === dongleId) {
    return state.device;
  }
  return state.devices.find((d) => d.dongle_id === dongleId) || null;
}

export function getSegmentNumber(route, offset) {
  if (!route) {
    return null;
  }
  if (offset === undefined) {
    offset = currentOffset();
  }
  for (let i = 0; i < route.segment_offsets.length; i++) {
    if (offset >= route.segment_offsets[i]
      && (i === route.segment_offsets.length - 1 || offset < route.segment_offsets[i + 1])) {
      return route.segment_numbers[i];
    }
  }
  return null;
}
