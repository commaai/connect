<script>
  import * as Sentry from '@sentry/browser';
  import { page } from '$app/state';

  import { billing as Billing } from '$lib/api';
  import PrimeCheckout from '$lib/components/PrimeCheckout.svelte';
  import PrimeManage from '$lib/components/PrimeManage.svelte';

  let { data } = $props();

  let subscription = $state(null);

  // The load function owns the first read; a screen reporting a change updates
  // it below without re-running the load, so no device refetch can swap screens
  // out from under a cancel or plan switch.
  $effect(() => {
    subscription = data.subscription;
  });

  // Prime/index.jsx reads the stripe redirect params off window.location and
  // forwards them: PrimeManage keys its post-checkout verification off
  // stripeSuccess, PrimeCheckout shows "Checkout cancelled" off stripeCancelled.
  const stripeSuccess = $derived(page.url.searchParams.get('stripe_success'));
  const stripeCancelled = $derived(page.url.searchParams.get('stripe_cancelled'));
  const manage = $derived(Boolean(data.device?.prime || stripeSuccess));
  const hasAccess = $derived(Boolean(data.device?.is_owner || data.profile?.superuser));

  /**
   * fetchSubscription: billing may not have written the record yet, so React
   * kept the old subscription rather than rendering a user_id-less one, and
   * swallowed 404s during that window.
   */
  async function subscriptionChanged(next) {
    if (next) {
      subscription = next;
      return;
    }
    try {
      const fetched = await Billing.getSubscription(data.dongleId);
      if (fetched?.user_id) subscription = fetched;
    } catch (err) {
      if (err.message?.indexOf('404') === 0) return;
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_fetch_subscription' });
    }
  }
</script>

<div class="flex flex-col">
  {#if data.profile && data.device}
    {#if !hasAccess}
      <!-- MUI Typography, default variant body1 -->
      <p class="text-[0.875rem] text-white" style="line-height: 1.46429em">No access</p>
    {:else if manage}
      <PrimeManage
        dongleId={data.dongleId}
        device={data.device}
        {subscription}
        subscribeInfo={data.subscribeInfo}
        {stripeSuccess}
        oncancelled={subscriptionChanged}
        onplanchanged={subscriptionChanged}
      />
    {:else}
      <PrimeCheckout
        dongleId={data.dongleId}
        device={data.device}
        subscribeInfo={data.subscribeInfo}
        {stripeCancelled}
        onactivated={subscriptionChanged}
      />
    {/if}
  {/if}
</div>
