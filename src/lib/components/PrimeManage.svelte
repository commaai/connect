<script module>
  import { otherPrimePlan, primePlanName } from '$lib/prime/plans';

  export function primeSwitchErrorMessage(error, plan = 'data') {
    const status = error?.resp?.status;
    const planName = primePlanName(plan);

    if (error?.code === 'unexpected_response') {
      return `Billing returned an unexpected response. Your plan may not have changed. Please try switching to ${planName} again.`;
    }
    if (status === 400) {
      if (plan === 'data') {
        return 'Standard could not be activated. Make sure this device is eligible and has a usable, supported comma SIM, then try again.';
      }
      return `This subscription could not be switched to ${planName}. Please refresh the page and try again.`;
    }
    if (status === 401) {
      return 'Your session has expired. Sign in again, then try switching plans.';
    }
    if (status === 403) {
      return "You don't have permission to change this device's subscription.";
    }
    if (status >= 500) {
      return 'The billing service is having trouble right now. Your plan was not changed. Please try again later.';
    }
    return 'Could not reach the billing service. Check your internet connection and try again.';
  }
  function autofocusPanel(node) {
    const id = requestAnimationFrame(() => node.focus());
    return { destroy: () => cancelAnimationFrame(id) };
  }

</script>

<script>
  import * as Sentry from '@sentry/browser';
  import dayjs from 'dayjs';
  import { innerWidth } from 'svelte/reactivity/window';

  import { billing as Billing } from '$lib/api';
  import { deviceNamePretty, deviceTypePretty } from '$lib/utils';
  import CommacareBadge, { COMMACARE_URL } from './CommacareBadge.svelte';
  import { lockBodyScroll } from '$lib/utils/scroll-lock';

  let {
    dongleId,
    device,
    subscription,
    subscribeInfo = null,
    stripeSuccess = null,
    onback,
    oncancelled,
    onplanchanged,
    onanalytics,
  } = $props();

  let error = $state(null);
  let cancelError = $state(null);
  let cancelSuccess = $state(null);
  let cancelModal = $state(false);
  let canceling = $state(false);
  let planSwitchModal = $state(false);
  let planSwitchStatus = $state('confirm');
  let planSwitchMessage = $state(null);
  let planSwitchTarget = $state(null);
  let switchingPlan = $state(false);
  let stripeStatus = $state(null);

  /** Polls of the stripe session to tolerate before telling the user. */
  const STRIPE_SESSION_RETRIES = 5;

  let mounted = false;
  let stripeStarted = false;
  let paidReported = false;
  let stripeSessionFailures = 0;

  $effect(() => {
    mounted = true;
    return () => {
      mounted = false;
    };
  });

  const windowWidth = $derived(innerWidth.current ?? 1280);
  const commacare = $derived(device?.commacare);
  const hasPrimeSub = $derived(Boolean(subscription && subscription.user_id));
  const alias = $derived(deviceNamePretty(device));
  const containerPadding = $derived(windowWidth > 520 ? 36 : 16);
  const buttonSmallStyle = $derived(windowWidth < 514 ? 'width: 100%' : '');

  const joinDate = $derived(
    dayjs(subscription?.subscribed_at ? subscription.subscribed_at * 1000 : 0).format('MMMM D, YYYY'),
  );
  const nextPaymentDate = $derived(
    dayjs(subscription?.next_charge_at ? subscription.next_charge_at * 1000 : 0).format('MMMM D, YYYY'),
  );
  const cancelAtDate = $derived(
    dayjs(subscription?.cancel_at ? subscription.cancel_at * 1000 : 0).format('MMMM D, YYYY'),
  );
  const planName = $derived(primePlanName(subscription?.plan));
  const planSubtext = $derived(subscription?.plan === 'nodata' ? '(without data plan)' : '(with data plan)');
  const hasCancelAt = $derived(
    Boolean(hasPrimeSub && subscription.cancel_at && subscription.cancel_at <= subscription.next_charge_at),
  );

  async function fetchSubscription(notify, repeat = false) {
    if (!mounted) {
      return;
    }
    try {
      const sub = await Billing.getSubscription(dongleId);
      if (sub?.user_id) {
        notify?.(sub);
      } else {
        setTimeout(() => fetchSubscription(notify, true), 2000);
      }
    } catch (err) {
      if (err.message && err.message.indexOf('404') === 0) {
        if (repeat) {
          setTimeout(() => fetchSubscription(notify, true), 2000);
        }
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'prime_fetch_subscription' });
      }
    }
  }

  async function fetchStripeSession() {
    if (!stripeStatus || !mounted) {
      return;
    }

    try {
      const resp = await Billing.getStripeSession(dongleId, stripeStatus.sessionId);
      const status = resp.payment_status;
      stripeSessionFailures = 0;
      stripeStatus = { ...stripeStatus, paid: status, loading: status !== 'paid', error: null };
      if (status === 'paid') {
        fetchSubscription(onplanchanged, true);
      } else {
        setTimeout(fetchStripeSession, 2000);
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_fetch_stripe_session' });

      // Dropping the poll on the first failure left "Waiting for confirmed
      // payment" spinning for good. Retry a few times, backing off, before
      // saying anything — a blip in one poll is not news.
      stripeSessionFailures += 1;
      if (stripeSessionFailures < STRIPE_SESSION_RETRIES) {
        setTimeout(fetchStripeSession, 2000 * stripeSessionFailures);
        return;
      }
      // Only the confirmation is lost here. Checkout happened on Stripe's side,
      // so this must not read as a failed payment.
      stripeStatus = {
        ...stripeStatus,
        loading: false,
        error: 'Could not confirm your payment. If you completed checkout it will still activate — reload this page in a moment.',
      };
    }
  }

  $effect(() => {
    if (!stripeSuccess || stripeStarted) return;
    stripeStarted = true;
    stripeStatus = { sessionId: stripeSuccess, loading: true, paid: null };
    fetchStripeSession();
  });

  $effect(() => {
    if (paidReported || stripeStatus?.paid !== 'paid' || !subscription?.user_id) return;
    paidReported = true;
    onanalytics?.('prime_paid', { plan: subscription.plan });
  });

  function cancelPrime() {
    canceling = true;
    onanalytics?.('prime_cancel', { plan: subscription.plan });
    Billing.cancelPrime(dongleId).then((resp) => {
      if (resp.success) {
        canceling = false;
        cancelError = null;
        cancelSuccess = 'Cancelled subscription.';
        fetchSubscription(oncancelled);
      } else if (resp.error) {
        canceling = false;
        cancelError = resp.description;
      } else {
        canceling = false;
        cancelError = 'Could not cancel due to unknown error. Please try again.';
      }
    }).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'primemanage_cancel_prime' });
      canceling = false;
      cancelError = 'Could not cancel due to unknown error. Please try again.';
    });
  }

  async function gotoUpdate() {
    onanalytics?.('prime_stripe_update', { plan: subscription.plan });
    error = null;
    try {
      const resp = await Billing.getStripePortal(dongleId);
      window.location = resp.url;
    } catch (err) {
      error = 'Could not open the billing portal. Please try again.';
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_update' });
    }
  }

  async function switchPlan() {
    const plan = planSwitchTarget || otherPrimePlan(subscription.plan);
    const targetName = primePlanName(plan);
    switchingPlan = true;
    error = null;
    planSwitchStatus = 'loading';
    planSwitchMessage = null;
    try {
      let info = null;
      if (plan === 'data') {
        info = (await Billing.getSubscribeInfo(dongleId)) ?? subscribeInfo;
      }
      const response = await Billing.switchPrimePlan(dongleId, plan, info?.sim_id);
      if (!response?.success) {
        const unexpected = new Error('Unexpected billing response');
        unexpected.code = 'unexpected_response';
        throw unexpected;
      }
      onanalytics?.('prime_switch_plan', { from: subscription.plan, to: plan });
      await fetchSubscription(onplanchanged);
      if (mounted) {
        planSwitchStatus = 'success';
        planSwitchMessage = `Your subscription has been switched to ${targetName} successfully.`;
      }
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'primemanage_switch_plan' });
      const message = primeSwitchErrorMessage(err, plan);
      if (mounted) {
        planSwitchStatus = 'error';
        planSwitchMessage = message;
      }
    } finally {
      if (mounted) {
        switchingPlan = false;
      }
    }
  }

  function openPlanSwitch() {
    planSwitchModal = true;
    planSwitchStatus = 'confirm';
    planSwitchMessage = null;
    planSwitchTarget = otherPrimePlan(subscription.plan);
    error = null;
  }

  function resetPlanSwitch() {
    planSwitchModal = false;
    planSwitchStatus = 'confirm';
    planSwitchMessage = null;
    planSwitchTarget = null;
  }

  function closePlanSwitch() {
    if (!switchingPlan) resetPlanSwitch();
  }

  function onEscape() {
    if (planSwitchModal) closePlanSwitch();
    if (cancelModal) cancelModal = false;
  }

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  $effect(() => {
    if (!cancelModal && !planSwitchModal) return;
    return lockBodyScroll();
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onEscape(); }} />

{#snippet progress()}
  <div class="progress" role="progressbar" style="width: 19px; height: 19px; color: #fff">
    <svg viewBox="22 22 44 44">
      <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
    </svg>
  </div>
{/snippet}

{#if hasPrimeSub || stripeStatus}
  <div class="primeBox" style="line-height: 1.5">
    <div class="primeContainer" style="padding: 8px {containerPadding}px">
      <button type="button" aria-label="Go Back" class="iconButton" onclick={() => onback?.()}>
        <span class="label">
          <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true">
            <path d="M21 11H6.83l3.58-3.59L9 6l-6 6 6 6 1.41-1.41L6.83 13H21z" />
          </svg>
        </span>
      </button>
    </div>
    <div class="primeContainer" style="padding: 16px {containerPadding}px">
      <h2 class="typography title">comma prime</h2>
      {#if stripeStatus}
        {#if stripeStatus.error}
          <div class="overviewBlockError">
            <!-- icons/ErrorOutline -->
            <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0" aria-hidden="true">
              <path d="M480-280q14 0 24-9 9-10 9-24t-9-23q-10-10-24-10t-23 9q-10 10-10 24t9 23q10 10 24 10Zm-27-153h60v-253h-60v253Zm27 353q-82 0-155-31t-127-86q-55-55-86-128-32-73-32-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm1-60q141 0 240-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm-1-340Z" />
            </svg>
            <p class="typography body1">{stripeStatus.error}</p>
          </div>
        {:else if stripeStatus.paid !== 'paid'}
          <div class="overviewBlockLoading">
            {@render progress()}
            <p class="typography body1">Waiting for confirmed payment</p>
          </div>
        {/if}
        {#if stripeStatus.paid === 'paid' && !hasPrimeSub}
          <div class="overviewBlockLoading">
            {@render progress()}
            <p class="typography body1">Processing subscription</p>
          </div>
        {/if}
        {#if stripeStatus.paid === 'paid' && hasPrimeSub}
          <div class="overviewBlockSuccess">
            <p class="typography body1">comma prime activated</p>
            {#if subscription.is_prime_sim}
              <p class="typography body1">Connectivity will be enabled as soon as activation propagates to your local cell tower. Rebooting your device may help.</p>
            {/if}
          </div>
        {/if}
      {/if}
      <div class="overviewBlock">
        <h3 class="typography subheading">Device</h3>
        <div class="manageItem">
          <aside class="typography body2">{alias}</aside>
          <!-- variant="caption", but `.manageItem span` outranks it: 0.9em, white70 -->
          <span class="typography caption">{`(${device.dongle_id})`}</span>
        </div>
      </div>
      {#if hasPrimeSub}
        <div class="overviewBlock">
          <h3 class="typography subheading">Plan</h3>
          <p class="typography body1 manageItem">{planName}<span>{` ${planSubtext}`}</span></p>
        </div>
        <div class="overviewBlock">
          <h3 class="typography subheading">Joined</h3>
          <p class="typography body1 manageItem">{joinDate}</p>
        </div>
        {#if !hasCancelAt}
          <div class="overviewBlock">
            <h3 class="typography subheading">Next payment</h3>
            <p class="typography body1 manageItem">{nextPaymentDate}</p>
          </div>
        {/if}
        {#if hasCancelAt}
          <div class="overviewBlock">
            <h3 class="typography subheading">Subscription end</h3>
            <p class="typography body1 manageItem">{cancelAtDate}</p>
          </div>
        {/if}
        <div class="overviewBlock">
          <h3 class="typography subheading">Amount</h3>
          <p class="typography body1 manageItem">{`$${(subscription.amount / 100).toFixed(2)}`}</p>
        </div>
        {#if commacare}
          <CommacareBadge variant="pill" style="margin-top: 14px" />
        {/if}
        {#if error}
          <div class="overviewBlockError">
            <!-- icons/ErrorOutline -->
            <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0" aria-hidden="true">
              <path d="M480-280q14 0 24-9 9-10 9-24t-9-23q-10-10-24-10t-23 9q-10 10-10 24t9 23q10 10 24 10Zm-27-153h60v-253h-60v253Zm27 353q-82 0-155-31t-127-86q-55-55-86-128-32-73-32-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm1-60q141 0 240-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm-1-340Z" />
            </svg>
            <p class="typography body1">{error}</p>
          </div>
        {/if}
        <div class="overviewBlock paymentElement">
          <button
            type="button"
            class="button buttons"
            style={buttonSmallStyle}
            onclick={gotoUpdate}
            disabled={!hasPrimeSub || (hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data')}
          >
            <span class="label">{hasCancelAt ? 'Renew subscription' : 'Update payment method'}</span>
          </button>
          {#if !hasCancelAt}
            <button
              type="button"
              class="button buttons"
              style={buttonSmallStyle}
              onclick={openPlanSwitch}
              disabled={switchingPlan}
            >
              <span class="label">{#if switchingPlan}{@render progress()}{:else}{`Switch to ${primePlanName(otherPrimePlan(subscription.plan))} plan`}{/if}</span>
            </button>
            <button
              type="button"
              class="button buttons cancelButton primeCancel"
              style={buttonSmallStyle}
              onclick={() => { cancelModal = true; }}
              disabled={!hasPrimeSub}
            >
              <span class="label">Cancel subscription</span>
            </button>
          {/if}
        </div>
        {#if subscription.requires_migration}
          <div class="overviewBlockDisabled">
            <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0" aria-hidden="true">
              <circle cx="12" cy="19" r="2" />
              <path d="M10 3h4v12h-4z" />
            </svg>
            <!-- JSX dropped the newline before <a>, so "the" and "shop" run together -->
            <p class="typography body1">Your prime subscription will be canceled on May 15th unless you replace the SIM card in your device. A new SIM card can be ordered from the<a class="linkHighlight" href="https://comma.ai/shop/comma-prime-sim">shop</a>. Use discount code SIMSWAP at checkout to receive a free SIM card.</p>
          </div>
        {/if}
        {#if hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data'}
          <div class="overviewBlockDisabled">
            <!-- icons/InfoOutline -->
            <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0" aria-hidden="true">
              <path d="M453-280h60v-240h-60v240Zm27-314q14 0 23-9t10-23q0-14-9-24-10-10-24-10t-23 10-10 24q0 14 9 23 10 9 24 9Zm0 514q-82 0-155-31t-128-86q-54-55-86-128-31-73-31-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm0-60q142 0 241-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm0-340Z" />
            </svg>
            <p class="typography body1">Standard comma prime discontinued for{deviceTypePretty(device.device_type)}</p>
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#if planSwitchModal}
    <div use:portal class="fixed inset-0 z-[1300]" role="dialog" aria-modal="true" aria-labelledby="prime-plan-switch-modal">
      <div
        class="fixed inset-0 z-[-1] bg-black/50"
        role="presentation"
        onclick={closePlanSwitch}
        onkeydown={(e) => e.key === 'Escape' && closePlanSwitch()}
      ></div>

      <div
        role="document"
        tabindex="-1"
        style="line-height: 1.5"
        class="paper absolute top-[40%] left-1/2 w-[400px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 p-4"
        use:autofocusPanel
      >
        {#if planSwitchStatus === 'success'}
          <h2 class="typography title">{`Welcome to ${primePlanName(planSwitchTarget)}`}</h2>
          <div class="mt-4 rounded-lg bg-green-500/20 p-3 text-green-100">
            <!-- body1's own color beats the wrapper's text-green-100 -->
            <p class="typography body1">{planSwitchMessage}</p>
          </div>
          <p class="typography body1 body1Muted mt-3">
            {planSwitchTarget === 'data'
              ? 'Your plan now includes data for $24/month.'
              : 'Your plan no longer includes data and costs $14/month.'}
          </p>
          <div class="mt-4">
            <button type="button" class="button contained closeButton" onclick={resetPlanSwitch}>
              <span class="label">Done</span>
            </button>
          </div>
        {:else}
          <h2 class="typography title">{`Switch to ${primePlanName(planSwitchTarget)} plan`}</h2>
          <p class="typography body1 body1Muted mt-3">
            {#if planSwitchTarget === 'data'}The Standard plan costs $24/month, includes a data plan, and is <strong class="font-bold text-white">only available in the U.S.</strong>{:else}The Lite plan costs $14/month and does not include a data plan.{/if}
          </p>
        {/if}
        {#if planSwitchStatus === 'loading'}
          <div class="mt-4 flex flex-col items-center justify-center rounded-lg bg-black/20 p-5 text-center">
            {@render progress()}
            <p class="typography body1 body1Muted mt-2">Switching your plan…</p>
          </div>
        {/if}
        {#if planSwitchStatus === 'error'}
          <div class="mt-4 rounded-lg bg-red-500/20 p-3 text-red-100">
            <p class="typography body1 text-inherit">{planSwitchMessage}</p>
          </div>
        {/if}
        {#if planSwitchStatus !== 'success'}
          <div class="mt-4">
            <button
              type="button"
              class="button contained cancelModalButton"
              onclick={switchPlan}
              disabled={switchingPlan}
            >
              <span class="label">{planSwitchStatus === 'error' ? 'Try again' : 'Confirm switch'}</span>
            </button>
            <button
              type="button"
              class="button contained closeButton"
              onclick={resetPlanSwitch}
              disabled={switchingPlan}
            >
              <span class="label">Cancel</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if cancelModal}
    <div use:portal class="fixed inset-0 z-[1300]" role="dialog" aria-modal="true" aria-labelledby="prime-cancel-modal">
      <div
        class="fixed inset-0 z-[-1] bg-black/50"
        role="presentation"
        onclick={() => { cancelModal = false; }}
        onkeydown={(e) => e.key === 'Escape' && (cancelModal = false)}
      ></div>

      <!-- Modal autofocuses its child. PrimeManage's modal style omits
           outline:none (TimeSelect's and DeviceSettingsModal's set it), so the
           focused paper carries chrome's focus ring. -->
      <div
        role="document"
        tabindex="-1"
        style="line-height: 1.5"
        class="paper modal"
        use:autofocusPanel
      >
        <h2 class="typography title">Cancel prime subscription</h2>
        {#if cancelError}
          <div class="cancelError">
            <p class="typography body1">{cancelError}</p>
          </div>
        {/if}
        {#if cancelSuccess}
          <div class="cancelSuccess">
            <p class="typography body1">{cancelSuccess}</p>
          </div>
        {/if}
        <p class="typography body1">{`Device: ${alias} (${dongleId})`}</p>
        <p class="typography body1">We&apos;re sorry to see you go.</p>
        <p class="typography body1">Your subscription will be cancelled immediately and can be resumed at any time.</p>
        {#if commacare}
          <div class="commacareWarning">
            <p class="typography body1">
              Cancelling will <strong>permanently end your extended warranty coverage.</strong> Your standard 1-year warranty still applies for any remaining time. <a href={COMMACARE_URL} target="_blank" rel="noreferrer">What is commacare?</a>
            </p>
          </div>
        {/if}
        <button
          type="button"
          class="button contained cancelModalButton primeModalCancel"
          onclick={cancelPrime}
          disabled={Boolean(cancelSuccess || canceling)}
        >
          <span class="label">{#if canceling}{@render progress()}{:else}Cancel subscription{/if}</span>
        </button>
        <button
          type="button"
          class="button contained closeButton primeModalClose"
          onclick={() => { cancelModal = false; }}
        >
          <span class="label">Close</span>
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>

  .typography {
    /* Margin is left to preflight, which zeroes p and h2/h3 at element
       specificity, so an mt-* utility on the same element still wins —
       declaring the shorthand here would silently outrank it. */
    display: block;
  }

  .title {
    font-size: 1.3125rem;
    font-weight: 500;
    line-height: 1.16667em;
    color: #fff;
  }

  .subheading {
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.5em;
    color: #fff;
  }

  .body2 {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.71429em;
    color: #fff;
  }

  .body1 {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.46429em;
    color: #fff;
  }

  /* body1 with the muted colour the plan-switch copy uses */
  .body1Muted {
    color: rgba(255, 255, 255, 0.8);
  }

  .caption {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.375em;
    color: rgba(255, 255, 255, 0.7);
  }

  .paper {
    background-color: #30373b;
    border-radius: 4px;
    box-shadow:
      0px 1px 5px 0px rgba(0, 0, 0, 0.2),
      0px 2px 2px 0px rgba(0, 0, 0, 0.14),
      0px 3px 1px -2px rgba(0, 0, 0, 0.12);
  }

  .button {
    position: relative;
    box-sizing: border-box;
    display: inline-flex;
    min-width: 64px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border: 0;
    margin: 0;
    border-radius: 4px;
    background-color: transparent;
    color: #fff;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4em;
    text-transform: none;
    text-decoration: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
      border 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .button:hover {
    text-decoration: none;
    background-color: rgba(255, 255, 255, 0.1);
  }

  .button:disabled {
    pointer-events: none;
    cursor: default;
    color: rgba(255, 255, 255, 0.3);
  }

  .button:disabled:hover {
    background-color: transparent;
  }

  .contained {
    color: rgba(0, 0, 0, 0.87);
    background-color: #535f64;
    box-shadow:
      0px 1px 5px 0px rgba(0, 0, 0, 0.2),
      0px 2px 2px 0px rgba(0, 0, 0, 0.14),
      0px 3px 1px -2px rgba(0, 0, 0, 0.12);
  }

  .contained:active {
    box-shadow:
      0px 5px 5px -3px rgba(0, 0, 0, 0.2),
      0px 8px 10px 1px rgba(0, 0, 0, 0.14),
      0px 3px 14px 2px rgba(0, 0, 0, 0.12);
  }

  .contained:disabled {
    color: rgba(255, 255, 255, 0.3);
    box-shadow: none;
    background-color: rgba(255, 255, 255, 0.12);
  }

  .label {
    width: 100%;
    display: inherit;
    align-items: inherit;
    justify-content: inherit;
  }

  .iconButton {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    margin: 0;
    border-radius: 50%;
    background-color: transparent;
    color: #fff;
    font-size: 1.5rem;
    text-align: center;
    text-decoration: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    -moz-appearance: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
  }

  .iconButton:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .iconButton .label {
    display: flex;
  }

  .progress {
    display: inline-block;
    line-height: 1;
    animation: circular-rotate 1.4s linear infinite;
  }

  .progressCircle {
    stroke: currentColor;
    stroke-dasharray: 80px, 200px;
    stroke-dashoffset: 0px;
    animation: circular-dash 1.4s ease-in-out infinite;
  }

  @keyframes circular-rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes circular-dash {
    0% {
      stroke-dasharray: 1px, 200px;
      stroke-dashoffset: 0px;
    }
    50% {
      stroke-dasharray: 100px, 200px;
      stroke-dashoffset: -15px;
    }
    100% {
      stroke-dasharray: 100px, 200px;
      stroke-dashoffset: -120px;
    }
  }

  /* styles.linkHighlight: the pseudo-classes outrank `.overviewBlockDisabled a` */
  .linkHighlight:link,
  .linkHighlight:visited,
  .linkHighlight:active {
    text-decoration: underline;
    color: #1a974e;
  }

  .linkHighlight:hover {
    text-decoration: underline;
    color: #178645;
  }

  .primeBox {
    display: flex;
    flex-direction: column;
  }

  .primeContainer {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .overviewBlock {
    margin-top: 20px;
  }

  .overviewBlockError {
    margin-top: 15px;
    padding: 10px;
    display: flex;
    align-items: center;
    background-color: rgba(255, 0, 0, 0.2);
  }

  .overviewBlockError p {
    display: inline-block;
    margin-left: 10px;
  }

  .overviewBlockSuccess {
    margin-top: 15px;
    padding: 10px;
    align-items: center;
    background-color: rgba(0, 255, 0, 0.2);
  }

  .overviewBlockSuccess p {
    display: inline-block;
    margin-left: 10px;
  }

  .overviewBlockSuccess p:first-child {
    font-weight: 600;
  }

  .overviewBlockLoading {
    margin-top: 15px;
    padding: 10px;
    display: flex;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .overviewBlockLoading p {
    display: inline-block;
    margin-left: 10px;
  }

  .overviewBlockDisabled {
    margin-top: 12px;
    border-radius: 12px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.08);
  }

  .overviewBlockDisabled p {
    display: inline-block;
    margin-left: 10px;
  }

  .overviewBlockDisabled a {
    color: white;
  }

  .manageItem {
    margin-left: 10px;
  }

  .manageItem span {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9em;
  }

  .buttons {
    margin-top: 10px;
    background: #fff;
    border-radius: 18px;
    color: #1e2224;
    text-transform: none;
    width: 220px;
  }

  .buttons:hover,
  .buttons:disabled,
  .buttons:disabled:hover {
    background-color: rgba(255, 255, 255, 0.7);
    color: #1e2224;
  }

  .cancelButton {
    color: #fff;
    background: transparent;
    border: 1px solid #424a4f;
  }

  .cancelButton:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .cancelButton:disabled,
  .cancelButton:disabled:hover {
    background-color: transparent;
    color: #424a4f;
  }

  /* styles.modal: theme.spacing.unit * 2 and * 50 */
  .modal {
    position: absolute;
    padding: 16px;
    width: 400px;
    max-width: 90%;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%);
  }

  .modal p {
    margin-top: 10px;
  }

  .closeButton {
    margin-top: 10px;
    float: right;
    background-color: #5c696f;
    color: #fff;
  }

  .closeButton:hover {
    background-color: #4b5559;
  }

  .cancelModalButton {
    width: 170px;
    margin-top: 10px;
    background-color: #5c696f;
    color: #fff;
  }

  .cancelModalButton:hover,
  .cancelModalButton:disabled,
  .cancelModalButton:disabled:hover {
    background-color: #4b5559;
  }

  .cancelError {
    background-color: rgba(255, 0, 0, 0.3);
    margin-top: 10px;
    padding: 10px;
  }

  .cancelError p {
    margin: 0;
  }

  .cancelSuccess {
    background-color: rgba(0, 255, 0, 0.3);
    margin-top: 10px;
    padding: 10px;
  }

  .cancelSuccess p {
    margin: 0;
  }

  .paymentElement {
    display: flex;
    flex-direction: column;
    max-width: 450px;
  }

  .commacareWarning {
    margin-top: 12px;
    padding: 10px;
    background-color: #b85e1f;
    color: #fff;
  }

  .commacareWarning a {
    color: #fff;
    text-decoration: underline;
  }

  .commacareWarning p {
    margin-top: 0;
  }
</style>
