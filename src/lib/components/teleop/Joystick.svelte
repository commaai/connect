<script>
  import { isIos } from '$lib/utils/browser';

  let {
    connection,
    activeCamera,
    gamepadConnected = false,
    class: className = '',
    ongamepadchange,
    onswitchcamera,
    oninputactivechange,
  } = $props();

  let thumbPos = $state(null);
  let gamepadState = $state({ steering: 0, gas: 0, brake: 0, lb: false, rb: false });
  let joystickArea = $state(null);

  // Refs in React: written from handlers and the rAF loop, never rendered.
  let keys = { w: false, a: false, s: false, d: false };
  let touchId = null;
  let mouseDragging = false;
  let prevBumpers = { lb: false, rb: false };
  let prevGamepad = { steering: 0, gas: 0, brake: 0, lb: false, rb: false };
  let prevThumb = null;
  let gamepadFrame = null;
  const triggerActivated = { lt: false, rt: false };

  const THUMB_RANGE = 45;

  const isRearCamera = $derived(activeCamera === 'wideRoad');
  const thumbLeft = $derived(thumbPos ? `${50 + thumbPos.x * THUMB_RANGE}%` : '50%');
  const thumbTop = $derived(thumbPos ? `${50 + thumbPos.y * THUMB_RANGE}%` : '50%');
  const stickThumbLeft = $derived(50 + gamepadState.steering * 34);
  const inputActive = $derived(thumbPos !== null);

  // src/hooks/window.js getOrientationSource: the Screen Orientation API on iOS,
  // a media query everywhere else. Both are EventTargets emitting 'change'.
  function getOrientationSource() {
    return isIos() && window.screen?.orientation
      ? window.screen.orientation
      : window.matchMedia('(orientation: landscape)');
  }

  function setFlippedJoystick(x, y) {
    const flip = isRearCamera ? -1 : 1;
    connection?.setJoystick(flip * x, y);
  }

  // Touch joystick
  function applyJoystick(clientX, clientY) {
    const area = joystickArea;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const x = clientX;
    const y = clientY;
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    let dx = (x - rect.left - halfW) / halfW;
    let dy = (y - rect.top - halfH) / halfH;
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    thumbPos = { x: dx, y: dy };
    const cx = Math.sign(dx) * Math.max(Math.abs(dx), 0.20);
    const cy = Math.sign(dy) * Math.max(Math.abs(dy), 0.20);
    setFlippedJoystick(cy, -cx);
  }

  function resetJoystick() {
    thumbPos = null;
    connection?.setJoystick(0, 0);
  }

  function handleTouchStart(e) {
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    applyJoystick(t.clientX, t.clientY);
  }

  function handleTouchMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId) applyJoystick(t.clientX, t.clientY);
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touchId = null;
        resetJoystick();
      }
    }
  }

  function handleMouseMove(e) {
    if (mouseDragging) applyJoystick(e.clientX, e.clientY);
  }

  function handleMouseUp() {
    mouseDragging = false;
    resetJoystick();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function handleMouseDown(e) {
    e.preventDefault();
    mouseDragging = true;
    applyJoystick(e.clientX, e.clientY);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // Drop all active input and send a neutral command on blocking
  function releaseInputs() {
    handleMouseUp(); // clears mouse drag state, sends neutral, drops mousemove/up
    touchId = null;
    prevThumb = null;
    keys = { w: false, a: false, s: false, d: false };
  }

  $effect(() => {
    const onVisibility = () => { if (document.hidden) releaseInputs(); };
    const orientation = getOrientationSource();
    window.addEventListener('blur', releaseInputs);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('contextmenu', releaseInputs);
    orientation.addEventListener('change', releaseInputs);
    return () => {
      window.removeEventListener('blur', releaseInputs);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', releaseInputs);
      orientation.removeEventListener('change', releaseInputs);
    };
  });

  // Keyboard input
  const ARROW_MAP = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };

  function handleKey(e, pressed) {
    const k = ARROW_MAP[e.key] || e.key.toLowerCase();
    if ('wasd'.includes(k) && k.length === 1) {
      e.preventDefault();
      const next = { ...keys, [k]: pressed };
      keys = next;
      const x = -(next.d ? 1 : 0) + (next.a ? 1 : 0);
      const y = -(next.w ? 1 : 0) + (next.s ? 1 : 0);
      setFlippedJoystick(y, x);
      const anyKey = next.w || next.a || next.s || next.d;
      thumbPos = anyKey ? { x: -x, y } : null;
    }
  }

  $effect(() => {
    const onKeyDown = (e) => handleKey(e, true);
    const onKeyUp = (e) => handleKey(e, false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  });

  // Gamepad polling. React kept `gamepadConnected` in a ref so the loop was not
  // torn down on every change; a prop is already live here.
  function pollGamepad() {
    gamepadFrame = requestAnimationFrame(pollGamepad);
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

    if (!gp) {
      if (gamepadConnected) ongamepadchange?.(false);
      return;
    }

    if (!gamepadConnected) ongamepadchange?.(true);

    const DEADZONE = 0.15;
    let lx = gp.axes[0] || 0;
    if (Math.abs(lx) < DEADZONE) lx = 0;

    const rawRt = gp.axes[5] !== undefined ? gp.axes[5] : undefined;
    const rawLt = gp.axes[4] !== undefined ? gp.axes[4] : undefined;
    if (rawRt !== undefined && rawRt !== 0) triggerActivated.rt = true;
    if (rawLt !== undefined && rawLt !== 0) triggerActivated.lt = true;
    const rt = rawRt !== undefined ? ((triggerActivated.rt ? rawRt : -1) + 1) / 2
      : gp.buttons[7] ? gp.buttons[7].value : 0;
    const lt = rawLt !== undefined ? ((triggerActivated.lt ? rawLt : -1) + 1) / 2
      : gp.buttons[6] ? gp.buttons[6].value : 0;

    const throttle = lt - rt;
    const lb = gp.buttons[4] && gp.buttons[4].pressed;
    const rb = gp.buttons[5] && gp.buttons[5].pressed;

    const pg = prevGamepad;
    if (lx !== pg.steering || rt !== pg.gas || lt !== pg.brake || !!lb !== pg.lb || !!rb !== pg.rb) {
      const next = { steering: lx, gas: rt, brake: lt, lb: !!lb, rb: !!rb };
      prevGamepad = next;
      gamepadState = next;
    }

    setFlippedJoystick(throttle, -lx);

    if (lx !== 0 || rt > 0 || lt > 0) {
      const pt = prevThumb;
      if (!pt || pt.x !== lx || pt.y !== throttle) {
        const next = { x: lx, y: throttle };
        prevThumb = next;
        thumbPos = next;
      }
    } else if (touchId === null && !mouseDragging) {
      if (prevThumb !== null) {
        prevThumb = null;
        thumbPos = null;
      }
    }

    const prev = prevBumpers;
    if (lb && !prev.lb) onswitchcamera?.('driver');
    if (rb && !prev.rb) onswitchcamera?.('wideRoad');
    prevBumpers = { lb, rb };
  }

  $effect(() => {
    gamepadFrame = requestAnimationFrame(pollGamepad);
    return () => {
      if (gamepadFrame) cancelAnimationFrame(gamepadFrame);
    };
  });

  // Cleanup mouse listeners on unmount
  $effect(() => () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  });

  $effect(() => {
    oninputactivechange?.(inputActive);
  });
</script>

{#snippet triggerGroup({ bumperActive, bumperLabel, bumperKey, cameraActive, triggerValue, triggerColor, triggerKey, directionLabel })}
  <div class="flex flex-col items-center gap-1">
    <span class="text-[9px] font-bold tracking-[0.5px] uppercase transition-colors duration-100 {bumperActive ? 'text-white/90' : 'text-white/50'}">{bumperLabel}</span>
    <div
      class="w-12 h-6 rounded-[12px_12px_4px_4px] border-2 flex items-center justify-center transition-[background,border-color] duration-100 {bumperActive ? 'bg-white/25 border-white/50' : 'border-white/25 bg-white/5 backdrop-blur-lg'}"
      style={cameraActive ? 'background: rgba(59,130,246,0.35); border-color: rgba(59,130,246,0.5);' : undefined}
    >
      <span class="text-[9px] font-bold tracking-[0.5px] uppercase transition-colors duration-100 {bumperActive ? 'text-white/90' : 'text-white/50'}">{bumperKey}</span>
    </div>
    <div class="w-12 h-20 rounded-[8px_8px_24px_24px] relative overflow-hidden bg-glass bg-radial-white">
      <div class="absolute bottom-0 left-0 right-0 transition-[height] duration-[50ms] linear" style="height: {triggerValue * 100}%; background: {triggerColor};"></div>
      <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold tracking-[0.5px] text-white/40 z-[1] pointer-events-none">{triggerKey}</span>
    </div>
    <span class="text-[10px] font-bold tracking-[0.5px] text-white/50 uppercase whitespace-nowrap">{directionLabel}</span>
  </div>
{/snippet}

{#if gamepadConnected}
  <div class="absolute bottom-4 right-4 z-10 flex items-center justify-center gap-6 pointer-events-none" style="line-height: 1.5">
    {@render triggerGroup({
      bumperActive: gamepadState.lb, bumperLabel: 'Driver Camera', bumperKey: 'L1',
      cameraActive: activeCamera === 'driver', triggerValue: gamepadState.brake,
      triggerColor: 'rgba(239,68,68,0.45)', triggerKey: 'LT', directionLabel: 'Backward',
    })}

    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <span class="text-[10px] font-bold tracking-[0.5px] text-white/50 uppercase whitespace-nowrap">L Stick — Steering</span>
      <div class="w-[100px] h-[100px] rounded-full relative flex items-center justify-center bg-glass bg-radial-white">
        <div class="absolute top-1/2 left-3 right-3 h-0.5 -translate-y-1/2 bg-white/10 rounded-[1px]"></div>
        <span class="absolute top-1/2 -translate-y-[55%] text-sm text-white/20 select-none" style="left: 6px;">◀</span>
        <span class="absolute top-1/2 -translate-y-[55%] text-sm text-white/20 select-none" style="right: 6px;">▶</span>
        <div
          class="w-8 h-8 rounded-full absolute transition-[left] duration-[50ms] linear bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.4),rgba(255,255,255,0.1))] bg-glass"
          style="left: calc({stickThumbLeft}% - 16px);"
        ></div>
      </div>
    </div>

    {@render triggerGroup({
      bumperActive: gamepadState.rb, bumperLabel: 'Road Camera', bumperKey: 'R1',
      cameraActive: activeCamera === 'wideRoad', triggerValue: gamepadState.gas,
      triggerColor: 'rgba(34,197,94,0.45)', triggerKey: 'RT', directionLabel: 'Forward',
    })}
  </div>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={joystickArea}
    class="touch-none rounded-2xl bg-glass bg-radial-white {className || ''}"
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    onmousedown={handleMouseDown}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <div class="absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-white/10"></div>
    <div class="absolute top-1/2 left-2 right-2 h-px -translate-y-1/2 bg-white/10"></div>
    <div class="absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"></div>
    <div
      class="absolute w-[52px] h-[52px] rounded-full -translate-x-1/2 -translate-y-1/2 will-change-[left,top] md:w-[56px] md:h-[56px] bg-glass bg-radial-white
        {thumbPos ? 'bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.6),rgba(255,255,255,0.15))]' : 'bg-radial-white'}"
      style="left: {thumbLeft}; top: {thumbTop};"
    ></div>
  </div>
{/if}
