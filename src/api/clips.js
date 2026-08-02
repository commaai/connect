import { clipsAthena } from './clipsAthena';
import { deviceVersionAtLeast } from '../utils';

export const deviceSupportsClips = device => deviceVersionAtLeast(device, '0.11.2');
export const clipDevice = clipsAthena;
