import { redirect } from '@sveltejs/kit';

import { takeRedirectUrl } from '$lib/auth';

/**
 * The root layout has already exchanged the oauth code by the time this runs,
 * so all that is left is to send the user where they were originally headed.
 */
export function load() {
  redirect(307, takeRedirectUrl());
}
