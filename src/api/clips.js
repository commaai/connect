import { clipsAthena } from './clipsAthena';
import { deviceVersionAtLeast } from '../utils';

export const clipsLocal = Boolean(import.meta.env.VITE_CLIPS_ATHENA_URL_ROOT);
export const deviceSupportsClips = device => clipsLocal || deviceVersionAtLeast(device, '0.11.3');
export const clipDevice = clipsAthena;
