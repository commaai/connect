<script>
  import { onMount } from 'svelte';

  import { AuthConfig, PROVIDER_APPLE } from '$lib/auth';
  import { stringifyQuery } from '$lib/utils/query';
  import appleIcon from '$lib/assets/auth_apple.png';
  import githubIcon from '$lib/assets/auth_github.png';
  import googleIcon from '$lib/assets/auth_google.png';

  const APPLE_SDK = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

  let appleReady = $state(false);

  function onAppleSuccess(event) {
    const { code, state } = event.detail.authorization;
    // The React version used AuthConfig.APPLE_REDIRECT_PATH, which the auth
    // package does not export, so this navigated to "/undefined?code=...".
    window.location = `${AuthConfig.AUTH_PATH}?${stringifyQuery({ code, state, provider: PROVIDER_APPLE })}`;
  }

  onMount(() => {
    const script = document.createElement('script');
    script.src = APPLE_SDK;
    script.async = true;
    script.onload = () => {
      window.AppleID?.auth.init({
        clientId: AuthConfig.APPLE_CLIENT_ID,
        scope: AuthConfig.APPLE_SCOPES,
        redirectURI: AuthConfig.APPLE_REDIRECT_URI,
        state: AuthConfig.APPLE_STATE,
      });
      appleReady = true;
    };
    document.body.appendChild(script);

    document.addEventListener('AppleIDSignInOnSuccess', onAppleSuccess);
    document.addEventListener('AppleIDSignInOnFailure', console.warn);

    return () => {
      document.removeEventListener('AppleIDSignInOnSuccess', onAppleSuccess);
      document.removeEventListener('AppleIDSignInOnFailure', console.warn);
      script.remove();
    };
  });

  const buttonClass = 'flex h-20 w-[400px] max-w-[90%] mb-[10px] cursor-pointer items-center '
    + 'justify-center rounded-[80px] bg-white no-underline hover:bg-[#eee]';
  const labelClass = 'w-[190px] text-center text-[18px] font-semibold text-black';
</script>

<div class="flex h-screen w-full flex-col items-center justify-center">
  <div class="flex w-full flex-col items-center overflow-y-auto p-5">
    <div class="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[17px] bg-[#1e2224]">
      <img alt="comma" src="/images/comma-white.png" class="h-[45px] w-auto" />
    </div>

    <div class="h-[60px] shrink-[2]">&nbsp;</div>

    <p class="text-center text-[36px] font-extrabold">comma connect</p>
    <p class="mt-[10px] mb-[30px] w-[380px] max-w-[90%] text-center text-[18px]">
      Manage your comma device, view your drives, and use comma prime features
    </p>

    <a href={AuthConfig.GOOGLE_REDIRECT_LINK} class={buttonClass}>
      <img class="h-10" src={googleIcon} alt="" />
      <span class={labelClass}>Sign in with Google</span>
    </a>

    <button type="button" class={buttonClass} disabled={!appleReady} onclick={() => window.AppleID?.auth.signIn()}>
      <img class="h-10" src={appleIcon} alt="" />
      <span class={labelClass}>Sign in with Apple</span>
    </button>

    <a href={AuthConfig.GITHUB_REDIRECT_LINK} class="{buttonClass} githubAuth">
      <img class="h-10" src={githubIcon} alt="" />
      <span class={labelClass}>Sign in with GitHub</span>
    </a>

    <span class="mt-2 mb-8 max-w-sm text-center text-sm">
      Make sure to sign in with the same account if you have previously
      paired your comma device.
    </span>
  </div>
</div>
