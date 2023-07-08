import dayjs from 'dayjs';

export function clipErrorToText(errorStatus) {
  switch (errorStatus) {
    case 'upload_failed_request':
      return 'Unable to request file upload from device.';
    case 'upload_failed':
      return 'Not all files needed for this clip could be found on the device.';
    case 'upload_failed_dcam':
      return 'Not all files needed for this clip could be found on the device, was the "Record and Upload Driver Camera" toggle active?';
    case 'upload_timed_out':
      return 'File upload timed out, the device must be on WiFi to upload the required files.';
    case 'export_failed':
      return 'An error occurred while creating this clip.';
    default:
      return 'Unable to create clip.';
  }
}

export function formatClipDuration(duration) {
  const minutes = Math.floor((duration / (1000 * 60))) % 60;
  const seconds = Math.floor((duration / 1000) % 60);
  return `${minutes > 0 ? `${minutes} min ` : ''}${seconds} sec`;
}

export function formatClipTimestamp(timestamp) {
  return dayjs(timestamp, 'MMM Do, HH:mm');
}
