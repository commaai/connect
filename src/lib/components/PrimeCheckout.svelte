<script>
  import * as Sentry from '@sentry/browser';
  import dayjs from 'dayjs';
  import { untrack } from 'svelte';
  import { innerHeight, innerWidth } from 'svelte/reactivity/window';

  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  import { billing as Billing } from '$lib/api';
  import commacareIcon from '$lib/assets/commacare.png';
  import { COMMACARE_URL } from '$lib/components/CommacareBadge.svelte';
  import { deviceNamePretty } from '$lib/utils';

  let {
    dongleId,
    device,
    subscribeInfo,
    stripeCancelled = null,
    onactivated,
    onprimenav,
    onanalytics,
  } = $props();

  const PRIME_SIM_TYPES = ['blue', 'magenta_new', 'webbing'];

  let error = $state(null);
  let loadingCheckout = $state(false);
  let selectedPlan = $state(null);
  let fetchedSubscribeInfo = $state(null);

  const windowWidth = $derived(innerWidth.current ?? 1280);
  const windowHeight = $derived(innerHeight.current ?? 800);

  const info = $derived(subscribeInfo ?? fetchedSubscribeInfo);

  $effect(() => {
    if (!dongleId || subscribeInfo) return;
    const id = dongleId;
    Billing.getSubscribeInfo(id)
      .then((resp) => {
        if (id === untrack(() => dongleId)) fetchedSubscribeInfo = resp;
      })
      .catch((err) => {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'actions_fetch_subscribe_info' });
      });
  });

  $effect(() => {
    if (device?.prime) untrack(() => onactivated?.());
  });

  let wasCancelled = false;
  $effect(() => {
    const cancelled = Boolean(stripeCancelled);
    if (cancelled && !wasCancelled) error = 'Checkout cancelled';
    wasCancelled = cancelled;
  });

  const dataPlanAvailable = $derived.by(() => {
    if (!device || !info) return null;
    return Boolean(
      device.eligible_features?.prime_data
      && info.sim_id
      && info.is_prime_sim
      && info.sim_usable !== false
      && PRIME_SIM_TYPES.includes(info.sim_type),
    );
  });

  $effect(() => {
    if (info && untrack(() => selectedPlan) === null) {
      selectedPlan = dataPlanAvailable ? 'data' : 'nodata';
    }
  });

  const trialClaimable = $derived.by(() => {
    if (!info) return null;
    if (selectedPlan === 'data') return Boolean(info.trial_end_data);
    if (selectedPlan === 'nodata') return Boolean(info.trial_end_nodata);
    return Boolean(info.trial_end_data && info.trial_end_nodata);
  });

  const chargeText = $derived.by(() => {
    if (!selectedPlan || !trialClaimable) return null;
    let trialEndDate = null;
    if (selectedPlan === 'data') {
      trialEndDate = dayjs(info.trial_end_data * 1000).format('MMMM D');
    } else if (selectedPlan === 'nodata') {
      trialEndDate = dayjs(info.trial_end_nodata * 1000).format('MMMM D');
    }
    return `Your first charge will be on ${trialEndDate}, then monthly thereafter.`;
  });

  const disabledDataPlan = $derived(Boolean(!info || !dataPlanAvailable));

  const disabledDataPlanText = $derived.by(() => {
    if (!info || !disabledDataPlan) return null;
    if (!device.eligible_features?.prime_data) {
      return { text: 'Standard plan is not available for your device.' };
    }
    if (!info.sim_id && info.device_online) {
      return { text: 'Standard plan not available, no SIM was detected. Ensure SIM is securely inserted and try again.' };
    }
    if (!info.sim_id) {
      return { text: 'Standard plan not available, device could not be reached. Connect device to the internet and try again.' };
    }
    if (!info.is_prime_sim) {
      return { text: 'Standard plan not available, detected a third-party SIM.' };
    }
    if (!PRIME_SIM_TYPES.includes(info.sim_type)) {
      return { text: 'Standard plan not available, old SIM type detected, new SIM cards are available in the ', shop: true };
    }
    if (info.sim_usable === false && info.sim_type === 'blue') {
      return { text: 'Standard plan not available, SIM has been canceled and is therefore no longer usable, new SIM cards are available in the ', shop: true };
    }
    if (info.sim_usable === false) {
      return { text: 'Standard plan not available, SIM is no longer usable, new SIM cards are available in the ', shop: true };
    }
    return null;
  });

  const checkoutDisabled = $derived(Boolean(!info || loadingCheckout || !selectedPlan));

  function goBack() {
    if (onprimenav) onprimenav(false);
    else goto(`/${dongleId}`);
  }

  function selectPlan(plan) {
    if (plan === 'nodata' && !info) return;
    if (plan === 'data' && disabledDataPlan) return;
    selectedPlan = plan;
  }

  function planKeydown(event, plan) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectPlan(plan);
    }
  }

  async function gotoCheckout() {
    loadingCheckout = true;
    error = null;
    try {
      const plan = selectedPlan;
      const simId = plan === 'data' ? info.sim_id : undefined;
      const resp = await Billing.getStripeCheckout(dongleId, simId, plan);
      onanalytics?.('prime_checkout', { plan });
      window.location = resp.url;
    } catch (err) {
      // The success path navigates away, so it never clears this; the failure
      // path has to, or the button spins behind a disabled state for good.
      loadingCheckout = false;
      error = 'Could not reach checkout. Please try again.';
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  }

  // styles.primeBlock/blockMargin, styles.checkListItem padding
  const blockMargin = $derived(windowWidth > 520 ? 24 : 16);
  const listPadding = $derived(windowWidth > 520 ? 7 : 8);
  const planBoxHeight = $derived(windowHeight > 600 ? 140 : 110);

  // styles.linkHighlight — Colors.green300, hover Colors.green400
  const linkHighlight = 'hover:text-[#178645]';
  const linkHighlightStyle = 'color: #1a974e; text-decoration: underline';

  // The global body shim only supplies body1's line-height, so each of these
  // states its own size and line-height. They declare colour too, because a
  // class beats inheritance — which is what keeps them full white inside a
  // panel that sets a dimmer colour.
  const body1 = 'margin: 0; font-size: 0.875rem; font-weight: 400; line-height: 1.46429em; color: #fff';
  const body2 = 'margin: 0; font-size: 0.875rem; font-weight: 500; line-height: 1.71429em; color: #fff';

  // styles.plan
  const planBase = 'width: 160px; padding: 8px 0; border-radius: 18px; font-weight: 600;';

  function planStyle(plan) {
    let background = 'rgba(255, 255, 255, 0.1)';
    let color = '';
    let cursor = 'pointer';
    // styles.planDisabled, then styles.planInfoLoading which is declared later
    // in the stylesheet and therefore wins when both apply.
    if (plan === 'data' && disabledDataPlan) {
      background = 'rgba(255, 255, 255, 0.05)';
      color = ' color: rgba(255, 255, 255, 0.4);';
      cursor = 'default';
    }
    if (!info) {
      background = 'rgba(255, 255, 255, 0.03)';
      color = ' color: rgba(255, 255, 255, 0.2);';
      cursor = 'default';
    }
    const border = selectedPlan === plan ? '2px solid white' : '2px solid transparent';
    const margin = plan === 'nodata' ? 'margin-right: 2px;' : 'margin-left: 2px;';
    return `${planBase} ${margin} background-color: ${background}; cursor: ${cursor}; border: ${border};${color}`;
  }
</script>

{#snippet svgIcon(path, viewBox, size, extraStyle)}
  <svg
    {viewBox}
    fill="currentColor"
    width="1em"
    height="1em"
    style="font-size:{size}px;{extraStyle}"
    class="inline-block shrink-0 select-none"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
{/snippet}

{#snippet circularProgress(size, color)}
  <div
    role="progressbar"
    class="progress"
    style="display: inline-block; line-height: 1; width: {size}px; height: {size}px; color: {color}"
  >
    <svg viewBox="22 22 44 44">
      <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
    </svg>
  </div>
{/snippet}

<div
  class="flex max-w-[430px] flex-col text-white"
  style="margin: {windowWidth > 520 ? '18px 24px' : '6px 12px'}; line-height: 1.5"
>
  <!-- styles.primeHeader -->
  <div class="flex max-w-[410px] flex-row items-center justify-between">
    <button
      type="button"
      aria-label="Go Back"
      class="relative inline-flex h-12 w-12 flex-[0_0_auto] items-center justify-center rounded-full text-center align-middle text-white select-none hover:bg-white/10"
      style="margin: 0; padding: 0; background-color: transparent; cursor: pointer; font-size: 1.5rem"
      onclick={goBack}
    >
      <span class="flex w-full items-center justify-center">
        {@render svgIcon('M21 11H6.83l3.58-3.59L9 6l-6 6 6 6 1.41-1.41L6.83 13H21z', '0 0 24 24', 24, '')}
      </span>
    </button>

    <!-- styles.headerDevice: the first child takes the 8px gap -->
    <div class="flex items-center">
      <!-- Typography variant="body2" -->
      <aside style="{body2}; margin-right: 8px">{deviceNamePretty(device)}</aside>
      <!-- Typography variant="caption", styles.deviceId -->
      <span style="display: block; margin: 0; font-size: 0.75rem; line-height: 1.375em; color: #525E66">({device?.dongle_id})</span>
    </div>
  </div>

  <!-- styles.primeTitle. Preflight leaves h2 at the inherited 16px/400. -->
  <h2 style="margin: 0 12px; font-size: 16px; font-weight: 400; line-height: 1.5">comma prime</h2>

  <div style="margin-top: {blockMargin}px">
    <!-- styles.checkList -->
    <div class="ml-3">
      {#snippet checkListItem(label)}
        <!-- styles.checkListItem -->
        <div class="mb-1 flex items-center" style="padding-left: {listPadding}px; padding-right: {listPadding}px">
          {@render svgIcon('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z', '0 0 24 24', 21, ' align-self: flex-start')}
          <p style="margin: 0 0 0 14px; font-size: 14px">{label}</p>
        </div>
      {/snippet}
      {@render checkListItem('24/7 connectivity')}
      {@render checkListItem('Take pictures remotely')}
      {@render checkListItem('1 year storage of drive videos')}
      {@render checkListItem('Simple SSH for developers')}
      {#if device?.eligible_features?.commacare}
        {@render checkListItem('commacare extended warranty')}
      {/if}
    </div>
  </div>

  {#if device?.eligible_features?.commacare}
    <!-- styles.commacareBanner -->
    <div style="margin-top: {blockMargin}px; padding: 10px 14px 10px 12px; border-radius: 12px; border: 1px solid #1a974e; color: #fff">
      <div class="flex items-center">
        <img src={commacareIcon} alt="" class="mr-3 w-6" />
        <p style={body1}>
          <strong style="color: #1a974e; letter-spacing: 0.04em">INCLUDES COMMACARE</strong>
        </p>
      </div>
      <aside style={body2}>
        comma four includes a standard 1-year limited warranty. Subscribe within 30 days of delivery to extend your
        coverage to 2 years for the duration of your prime subscription.
        <a href={COMMACARE_URL} target="_blank" rel="noreferrer" style="color: #1a974e; text-decoration: underline">Learn more</a>
      </aside>
    </div>
  {/if}

  {#if device?.device_type === 'four' && !device?.eligible_features?.commacare}
    <!-- styles.commacareIneligible -->
    <div style="margin-top: {blockMargin}px; padding: 10px 14px; border-radius: 12px; background-color: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.7); font-size: 0.9em">
      <aside style={body2}>
        This device is past the delivery window. commacare extended warranty won&apos;t be included with this
        subscription.
        <a href={COMMACARE_URL} target="_blank" rel="noreferrer" style="color: rgba(255, 255, 255, 0.7)">What is commacare?</a>
      </aside>
    </div>
  {/if}

  <!-- styles.planBoxContainer -->
  <div class="relative" style="margin-top: {blockMargin}px; margin-left: -6px; margin-right: -6px">
    <!-- styles.planBox -->
    <div class="flex flex-row justify-around" style="height: {planBoxHeight}px">
      <div
        class="relative flex flex-col items-center justify-around text-center"
        style={planStyle('nodata')}
        role="button"
        tabindex="0"
        onclick={() => selectPlan('nodata')}
        onkeydown={(event) => planKeydown(event, 'nodata')}
      >
        <p style="margin: 0; font-size: 1.2rem">lite</p>
        <p style="margin: 0; font-size: 1.5rem">$14/month</p>
        <p style="margin: 0; font-weight: normal; font-size: 0.8rem">bring your own<br />sim card</p>
      </div>
      <div
        class="relative flex flex-col items-center justify-around text-center"
        style={planStyle('data')}
        role="button"
        tabindex="0"
        onclick={() => selectPlan('data')}
        onkeydown={(event) => planKeydown(event, 'data')}
      >
        <p style="margin: 0; font-size: 1.2rem">standard</p>
        <p style="margin: 0; font-size: 1.5rem">$24/month</p>
        <p style="margin: 0; font-weight: normal; font-size: 0.8rem">including data plan<br />only offered in the U.S.</p>
      </div>
    </div>
    {#if !info}
      <!-- styles.planLoading, fixed at 140 regardless of the plan box height -->
      <div class="absolute top-0 flex w-full flex-col items-center justify-center" style="height: 140px">
        {@render circularProgress(38, '#fff')}
        <p style="margin: 0; margin-top: 10px; font-size: 0.9rem; line-height: 1.46429em">Fetching SIM data</p>
      </div>
    {/if}
  </div>

  {#if disabledDataPlanText}
    <!-- styles.overviewBlockDisabled -->
    <div class="flex items-center" style="margin-top: {blockMargin}px; border-radius: 12px; padding: 8px 12px; background-color: rgba(255, 255, 255, 0.08)">
      <!-- icons/InfoOutline -->
      {@render svgIcon('M453-280h60v-240h-60v240Zm27-314q14 0 23-9t10-23q0-14-9-24-10-10-24-10t-23 10-10 24q0 14 9 23 10 9 24 9Zm0 514q-82 0-155-31t-128-86q-54-55-86-128-31-73-31-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm0-60q142 0 241-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm0-340Z', '0 -960 960 960', 24, '')}
      <p style="display: inline-block; margin: 0; margin-left: 10px; font-size: 0.875rem; line-height: 1.46429em">{disabledDataPlanText.text}{#if disabledDataPlanText.shop}<a class={linkHighlight} style={linkHighlightStyle} href="https://comma.ai/shop/comma-prime-sim">shop</a>{/if}</p>
    </div>
  {/if}

  <div style="margin-top: {blockMargin}px">
    <!-- styles.learnMore -->
    <p style={body1}>
      Learn more about comma prime from our <a class={linkHighlight} style={linkHighlightStyle} target="_blank" href="https://comma.ai/connect#faq" rel="noreferrer">FAQ</a>
    </p>
  </div>

  {#if error}
    <!-- styles.overviewBlockError -->
    <div class="flex items-center" style="border-radius: 12px; margin-top: 8px; padding: 8px 12px; background-color: rgba(255, 0, 0, 0.2)">
      <!-- icons/ErrorOutline -->
      {@render svgIcon('M480-280q14 0 24-9 9-10 9-24t-9-23q-10-10-24-10t-23 9q-10 10-10 24t9 23q10 10 24 10Zm-27-153h60v-253h-60v253Zm27 353q-82 0-155-31t-127-86q-55-55-86-128-32-73-32-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm1-60q141 0 240-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm-1-340Z', '0 -960 960 960', 24, '')}
      <p style="display: inline-block; margin: 0; margin-left: 10px; font-size: 0.875rem; line-height: 1.46429em">{error}</p>
    </div>
  {/if}

  <div style="margin-top: {blockMargin}px">
    <button
      type="button"
      class="gotoCheckout relative inline-flex w-full items-center justify-center align-middle select-none hover:bg-[rgba(255,255,255,0.7)]"
      style="box-sizing: border-box; margin: 0; min-width: 64px; min-height: 36px; height: 42px; padding: 8px 16px;
             border: 0; border-radius: 21px; color: #1e2224; font-size: 0.875rem; font-weight: 500;
             line-height: 1.4em; text-transform: none;
             background: {checkoutDisabled ? 'rgba(255, 255, 255, 0.7)' : '#fff'};
             cursor: {checkoutDisabled ? 'default' : 'pointer'};
             pointer-events: {checkoutDisabled ? 'none' : 'auto'}"
      onclick={gotoCheckout}
      disabled={checkoutDisabled}
    >
      <span style="width: 100%; display: inherit; align-items: inherit; justify-content: inherit">
        {#if loadingCheckout}
          {@render circularProgress(19, '#57a9e3')}
        {:else}
          {trialClaimable ? 'Claim trial' : 'Go to checkout'}
        {/if}
      </span>
    </button>
  </div>

  {#if chargeText}
    <div style="margin-top: {blockMargin}px">
      <!-- styles.chargeText overrides body1's size only -->
      <p style="margin: 0; font-size: 13px; line-height: 1.46429em">{chargeText}</p>
    </div>
  {/if}
</div>

<style>
  .progress {
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
</style>
