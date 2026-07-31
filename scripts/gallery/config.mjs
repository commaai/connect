export const GALLERY_VERSION = 2;

export const GALLERY_STATES = [
  { name: 'signin', label: 'Sign in' },
  { name: 'pair', label: 'Pair a device' },
  { name: 'dashboard', label: 'Dashboard' },
  { name: 'drive', label: 'Drive' },
  { name: 'checkout', label: 'Prime checkout' },
  { name: 'management', label: 'Prime management' },
  { name: 'teleop', label: 'Teleop' },
  {
    name: 'pair-device-modal',
    label: 'Pair device modal',
    page: 'pair',
    actions: [{ text: 'add new device' }],
    modalText: 'Pair device',
  },
  {
    name: 'date-filter-modal',
    label: 'Date filter modal',
    page: 'dashboard',
    actions: [{ text: 'Filter' }],
    modalText: 'Start date:',
  },
  {
    name: 'device-settings-modal',
    label: 'Device settings modal',
    page: 'dashboard',
    actions: [
      { selector: '[aria-label="menu"]', optional: true },
      { selector: '[aria-label="device settings"]' },
    ],
    modalText: 'Device settings',
  },
  {
    name: 'unpair-device-modal',
    label: 'Unpair device modal',
    page: 'dashboard',
    actions: [
      { selector: '[aria-label="menu"]', optional: true },
      { selector: '[aria-label="device settings"]' },
      { text: 'Unpair' },
    ],
    modalText: 'Unpair device',
  },
  {
    name: 'upload-queue-modal',
    label: 'Upload queue modal',
    page: 'dashboard',
    actions: [
      { selector: '[aria-label="menu"]', optional: true },
      { selector: '[aria-label="device settings"]' },
      { text: 'Uploads' },
    ],
    modalText: 'Upload queue',
  },
  {
    name: 'switch-prime-plan-modal',
    label: 'Switch prime plan modal',
    page: 'management',
    actions: [{ text: 'Switch to Lite plan' }],
    modalText: 'Confirm switch',
  },
  {
    name: 'cancel-prime-modal',
    label: 'Cancel prime modal',
    page: 'management',
    actions: [{ text: 'Cancel subscription' }],
    modalText: 'Cancel prime subscription',
  },
  {
    name: 'pairing-status-modal',
    label: 'Pairing status modal',
    page: 'dashboard',
    pairToken: 'eyJhbGciOiJub25lIn0.eyJpZGVudGl0eSI6ImdhbGxlcnkifQ.',
    modalText: 'Pairing device',
  },
];

export const GALLERY_VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

export const FIXED_TIME = '2026-02-25T18:00:00-08:00';
export const LOCALE = 'en-US';
export const TIMEZONE = 'America/Los_Angeles';

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [name, inlineValue] = arg.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    values[name] = value;
  }
  return values;
}

export function requiredArg(args, name) {
  if (!args[name]) throw new Error(`Missing required --${name}`);
  return args[name];
}

export function captureFilename(state, viewport) {
  return `${state}-${viewport}.png`;
}
