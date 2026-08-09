import { loadDrive, zoomFromParams } from '$lib/state/drive';

/** The same drive, opened at the zoom the path carries. */
export async function load(event) {
  const data = await loadDrive(event);
  return { ...data, initialZoom: zoomFromParams(event.params, data.route) };
}
