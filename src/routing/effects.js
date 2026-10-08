// Run post-navigation effects after their prerequisites resolve.
// Redirects and URL rewrites require current navigation ownership.

import { replace } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import localforage from 'localforage';

import { api } from '../api/backend';
import {
  checkLastRoutesData,
  checkRoutesData,
  fetchDeviceOnline,
  fetchSharedDevice,
  primeFetchSubscription,
} from '../actions';
import { ACTION_PAIR_REQUESTED, ACTION_PRIME_STRIPE_RESULT } from '../actions/types';
import { bootstrapSession } from '../actions/session';
import { webrtcConnectionManager } from '../utils/webrtc';
import { VIEWS, buildUrl, deviceBase, driveBase, isSafeReturnUrl, locationFor, withoutCommands } from './codec';

const CONSUMED_COMMANDS = ['pair', 'stripe_success', 'stripe_cancelled'];

function rememberedOrFirstDevice(devices) {
  const remembered = window.localStorage.getItem('selectedDongleId');
  return devices.find((d) => d.dongle_id === remembered) || devices[0] || null;
}

// A pair token from the URL is stored (it survives a login redirect) and
// handed to the explorer, once per token per store.
async function receivePairToken(token, ctx) {
  const { pairTokens } = ctx.services.commands;
  if (pairTokens.has(token)) return;
  pairTokens.add(token);
  try {
    await localforage.setItem('pairToken', token);
  } catch (err) {
    console.error(err);
    pairTokens.delete(token); // not stored: the same link may try again
    return;
  }
  ctx.dispatch({ type: ACTION_PAIR_REQUESTED });
}

// Consume query commands. Return true when a redirect replaces the current page.
async function consumeCommands(next, ctx) {
  const { commands, base } = next;
  const { dispatch } = ctx;
  const consumed = [];

  if (!ctx.isLatest()) return false;
  // Persist pairing before redirecting; recheck ownership after the await.
  if (commands.pair) await receivePairToken(commands.pair, ctx);
  if (!ctx.isCurrent() || !ctx.isLatest()) return true;

  // post-login return target; anonymous visitors keep it for the landing page
  if (commands.r != null && api.auth.isAuthenticated()) {
    if (isSafeReturnUrl(commands.r)) {
      dispatch(replace(commands.r));
      return true;
    }
    consumed.push('r');
  }

  if (commands.stripe_success != null || commands.stripe_cancelled != null) {
    dispatch({
      type: ACTION_PRIME_STRIPE_RESULT,
      dongleId: base.dongleId,
      success: commands.stripe_success ?? null,
      cancelled: commands.stripe_cancelled ?? null,
    });
  }

  consumed.push(...CONSUMED_COMMANDS.filter((key) => commands[key] != null));
  // Remove commands only from their original location.
  if (consumed.length && ctx.isLatest()) {
    dispatch(replace(buildUrl(withoutCommands(next, consumed))));
  }
  return false;
}

// Resolve root to the remembered or first device, preserving URL context.
async function resolveRoot(next, ctx) {
  if (!api.auth.isAuthenticated()) return;
  await ctx.session();
  if (!ctx.isCurrent()) return;
  const device = rememberedOrFirstDevice(ctx.getState().devices || []);
  if (device) {
    // from the latest location on this page, which may carry newer context
    const latest = ctx.latestLocation();
    const target = { ...locationFor(deviceBase(VIEWS.DASHBOARD, device.dongle_id), latest), hash: latest.hash };
    ctx.dispatch(replace(buildUrl(target)));
  }
}

// an old timestamp link names the same drive: keep everything else it carried
async function resolveLegacyRange(next, ctx) {
  const { base } = next;
  try {
    const routes = await api.routes.getRoutesSegments(base.dongleId, base.legacyRange.start, base.legacyRange.end);
    if (!ctx.isCurrent()) return;
    const logId = routes?.[0]?.fullname?.split('|')[1];
    if (logId) {
      // from the latest location on this page, which may carry newer context
      ctx.dispatch(replace(buildUrl({ ...ctx.latestLocation(), commands: {}, base: driveBase(base.dongleId, logId) })));
    }
  } catch (err) {
    console.error('Error fetching routes data for log ID conversion', err);
  }
}

async function selectedDeviceChanged(dongleId, ctx) {
  const { dispatch, getState } = ctx;
  window.localStorage.setItem('selectedDongleId', dongleId);

  const { profile } = await ctx.session();
  if (!ctx.isCurrent() || getState().dongleId !== dongleId) return;
  const device = (getState().devices || []).find((d) => d.dongle_id === dongleId);
  if ((device && !device.shared) || profile?.superuser) {
    dispatch(primeFetchSubscription(dongleId, device, profile));
    dispatch(fetchDeviceOnline(dongleId));
  }
  if (!device && api.auth.isAuthenticated()) {
    dispatch(fetchSharedDevice(dongleId));
  }
}

function ensureRoutes(ctx) {
  // limit 0 means nothing has been requested for this device yet
  ctx.dispatch(ctx.getState().limit === 0 ? checkLastRoutesData() : checkRoutesData());
}

// pages that show the device's drives
const ROUTE_VIEWS = [VIEWS.DASHBOARD, VIEWS.DRIVE];

export async function runNavigationEffects(previous, next, ctx) {
  const { base } = next;
  // Work from a superseded page cannot enter resources or release its successor.
  if (!ctx.isCurrent()) return;

  const run = (effect) =>
    Promise.resolve()
      .then(() => (ctx.isCurrent() ? effect() : undefined))
      .catch((err) => {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'navigation_effect' });
      });

  const { dongleId } = ctx.getState();
  const deviceChanged = Boolean(base.dongleId && dongleId === base.dongleId && dongleId !== ctx.previousDongleId);
  // another device's stream connection is torn down
  if (deviceChanged && ctx.previousDongleId) webrtcConnectionManager.disconnect();
  if (base.view === VIEWS.INVALID) return;
  if (Object.keys(next.commands).length && (await consumeCommands(next, ctx))) return;
  if (!ctx.isCurrent()) return;

  if (base.view === VIEWS.ROOT) run(() => resolveRoot(next, ctx));
  if (base.view === VIEWS.LEGACY_RANGE) run(() => resolveLegacyRange(next, ctx));

  if (deviceChanged) run(() => selectedDeviceChanged(dongleId, ctx));
  if (base.dongleId && dongleId === base.dongleId && ROUTE_VIEWS.includes(base.view)) {
    ensureRoutes(ctx);
  }
}

export function createEffectContext(store, services, generation, revision, previousDongleId) {
  return {
    dispatch: store.dispatch,
    getState: store.getState,
    services,
    previousDongleId,
    // still the same page (loads, redirects)
    isCurrent: () => services.navigation.generation === generation,
    // still exactly this location (rewriting the URL in place)
    isLatest: () => services.navigation.revision === revision,
    latestLocation: () => store.getState().nav.location,
    session: () => store.dispatch(bootstrapSession()),
  };
}
