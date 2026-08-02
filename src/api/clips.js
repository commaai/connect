import { clipsAthena } from './clipsAthena';
import { clipsStub } from './clipsStub';

// Swap this one dependency for the Athena transport once the device API ships.
// Both implementations expose the same Athena-shaped request and response fields.
export const clipsLocal = Boolean(import.meta.env.VITE_CLIPS_ATHENA_URL_ROOT);
export const clipDevice = clipsLocal ? clipsAthena : clipsStub;
