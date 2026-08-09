import { redirect } from '@sveltejs/kit';

/**
 * actions/startup.js init(): with no dongle in the path, the app picks one and
 * navigates rather than sitting on a deviceless root. The last device selected
 * wins if it is still in the list, otherwise the first.
 *
 * Signed out, or signed in with nothing paired, stays here — the page renders
 * the landing or the pair-a-device screen.
 */
export async function load({ parent }) {
  const { authenticated, devices } = await parent();
  if (!authenticated || !devices?.length) return {};

  let remembered = null;
  try {
    remembered = localStorage.getItem('selectedDongleId');
  } catch {
    remembered = null;
  }

  const selected = (remembered && devices.some((d) => d.dongle_id === remembered))
    ? remembered
    : devices[0].dongle_id;

  redirect(307, `/${selected}`);
}
