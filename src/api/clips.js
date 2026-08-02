import { clipsAthena } from './clipsAthena';

export const clipsLocal = Boolean(import.meta.env.VITE_CLIPS_ATHENA_URL_ROOT);
export const clipDevice = clipsAthena;
