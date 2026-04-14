import React, { useState, useEffect, useRef, useCallback } from 'react';

const glassSurface = {
  background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), rgba(255,255,255,0.05))',
  backdropFilter: 'blur(12px)',
  border: '1.5px solid rgba(255,255,255,0.2)',
  boxShadow: 'inset 0 0 20px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)',
};

const glassThumb = {
  ...glassSurface,
};

const glassThumbActive = {
  background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.6), rgba(255,255,255,0.15))',
  backdropFilter: 'blur(12px)',
  boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.4), 0 2px 12px rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.35)',
};

const controllerThumbStyle = {
  background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
  boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.25)',
};

function TriggerGroup({ bumperActive, bumperLabel, bumperKey, cameraActive, triggerValue, triggerColor, triggerKey, directionLabel }) {
  const activeStyle = cameraActive ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-[9px] font-bold tracking-[0.5px] uppercase transition-colors duration-100 ${bumperActive ? 'text-white/90' : 'text-white/50'}`}>
        {bumperLabel}
      </span>
      <div
        className={`w-12 h-6 rounded-[12px_12px_4px_4px] border-2 flex items-center justify-center transition-[background,border-color] duration-100 ${bumperActive ? 'bg-white/25 border-white/50' : 'border-white/25 bg-white/5 backdrop-blur-lg'}`}
        style={activeStyle}
      >
        <span className={`text-[9px] font-bold tracking-[0.5px] uppercase transition-colors duration-100 ${bumperActive ? 'text-white/90' : 'text-white/50'}`}>
          {bumperKey}
        </span>
      </div>
      <div className="w-12 h-20 rounded-[8px_8px_24px_24px] relative overflow-hidden" style={glassSurface}>
        <div className="absolute bottom-0 left-0 right-0 transition-[height] duration-[50ms] linear" style={{ height: `${triggerValue * 100}%`, background: triggerColor }} />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold tracking-[0.5px] text-white/40 z-[1] pointer-events-none">
          {triggerKey}
        </span>
      </div>
      <span className="text-[10px] font-bold tracking-[0.5px] text-white/50 uppercase whitespace-nowrap">
        {directionLabel}
      </span>
    </div>
  );
}

function ControllerOverlay({ gamepadSteering, gamepadGas, gamepadBrake, gamepadLB, gamepadRB, activeCamera }) {
  const thumbLeft = 50 + gamepadSteering * 34;

  return (
    <div className="absolute bottom-4 right-4 z-10 flex items-center justify-center gap-6 pointer-events-none">
      <TriggerGroup
        bumperActive={gamepadLB} bumperLabel="Driver Camera" bumperKey="L1"
        cameraActive={activeCamera === 'driver'} triggerValue={gamepadBrake}
        triggerColor="rgba(239,68,68,0.45)" triggerKey="LT" directionLabel="Backward"
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span className="text-[10px] font-bold tracking-[0.5px] text-white/50 uppercase whitespace-nowrap">L Stick — Steering</span>
        <div className="w-[100px] h-[100px] rounded-full relative flex items-center justify-center" style={glassSurface}>
          <div className="absolute top-1/2 left-3 right-3 h-0.5 -translate-y-1/2 bg-white/10 rounded-[1px]" />
          <span className="absolute top-1/2 -translate-y-[55%] text-sm text-white/20 select-none" style={{ left: 6 }}>{'\u25C0'}</span>
          <span className="absolute top-1/2 -translate-y-[55%] text-sm text-white/20 select-none" style={{ right: 6 }}>{'\u25B6'}</span>
          <div
            className="w-8 h-8 rounded-full absolute transition-[left] duration-[50ms] linear"
            style={{ ...controllerThumbStyle, left: `calc(${thumbLeft}% - 16px)` }}
          />
        </div>
      </div>

      <TriggerGroup
        bumperActive={gamepadRB} bumperLabel="Road Camera" bumperKey="R1"
        cameraActive={activeCamera === 'wideRoad'} triggerValue={gamepadGas}
        triggerColor="rgba(34,197,94,0.45)" triggerKey="RT" directionLabel="Forward"
      />
    </div>
  );
}

function TouchJoystick({ isLandscape, thumbPos, joystickAreaRef, onTouchStart, onTouchMove, onTouchEnd, onMouseDown }) {
  const thumbRange = isLandscape ? 40 : 45;
  const thumbLeft = thumbPos ? `${50 + thumbPos.x * thumbRange}%` : '50%';
  const thumbTop = thumbPos ? `${50 + thumbPos.y * thumbRange}%` : '50%';

  const joystickClass = isLandscape
    ? 'absolute bottom-4 right-4 z-10 w-[160px] h-[160px] rounded-2xl touch-none md:w-[160px] md:h-[160px]'
    : 'relative w-auto h-full aspect-square max-w-full touch-none rounded-2xl';

  return (
    <div
      ref={joystickAreaRef}
      className={joystickClass}
      style={glassSurface}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-white/10" />
      <div className="absolute top-1/2 left-2 right-2 h-px -translate-y-1/2 bg-white/10" />
      <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
      <div
        className="absolute w-[52px] h-[52px] rounded-full -translate-x-1/2 -translate-y-1/2 will-change-[left,top] md:w-[56px] md:h-[56px]"
        style={{ ...(thumbPos ? glassThumbActive : glassThumb), left: thumbLeft, top: thumbTop }}
      />
    </div>
  );
}

export default function Joystick({
  connection, activeCamera, isLandscape,
  onGamepadChange, onSwitchCamera, gamepadConnected,
}) {
  const [thumbPos, setThumbPos] = useState(null);
  const [, setKeys] = useState({ w: false, a: false, s: false, d: false });
  const [gamepadState, setGamepadState] = useState({
    steering: 0, gas: 0, brake: 0, lb: false, rb: false,
  });

  const joystickAreaRef = useRef(null);
  const touchIdRef = useRef(null);
  const mouseDraggingRef = useRef(false);
  const prevBumpersRef = useRef({ lb: false, rb: false });
  const gamepadFrameRef = useRef(null);
  const triggerActivatedRef = useRef({ lt: false, rt: false });

  const isRearCamera = activeCamera === 'wideRoad';

  const setFlippedJoystick = useCallback((x, y) => {
    const flip = isRearCamera ? -1 : 1;
    connection?.setJoystick(flip * x, y);
  }, [connection, isRearCamera]);

  // Touch joystick
  const applyJoystick = useCallback((clientX, clientY) => {
    const area = joystickAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    let dx = (clientX - rect.left - halfW) / halfW;
    let dy = (clientY - rect.top - halfH) / halfH;
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    setThumbPos({ x: dx, y: dy });
    const cx = Math.sign(dx) * Math.max(Math.abs(dx), 0.20);
    const cy = Math.sign(dy) * Math.max(Math.abs(dy), 0.20);
    setFlippedJoystick(cy, -cx);
  }, [setFlippedJoystick]);

  const resetJoystick = useCallback(() => {
    setThumbPos(null);
    connection?.setJoystick(0, 0);
  }, [connection]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    if (touchIdRef.current !== null) return;
    const t = e.changedTouches[0];
    touchIdRef.current = t.identifier;
    applyJoystick(t.clientX, t.clientY);
  }, [applyJoystick]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchIdRef.current) applyJoystick(t.clientX, t.clientY);
    }
  }, [applyJoystick]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        resetJoystick();
      }
    }
  }, [resetJoystick]);

  const handleMouseMove = useCallback((e) => {
    if (mouseDraggingRef.current) applyJoystick(e.clientX, e.clientY);
  }, [applyJoystick]);

  const handleMouseUp = useCallback(() => {
    mouseDraggingRef.current = false;
    resetJoystick();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [resetJoystick, handleMouseMove]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    mouseDraggingRef.current = true;
    applyJoystick(e.clientX, e.clientY);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [applyJoystick, handleMouseMove, handleMouseUp]);

  // Keyboard input
  useEffect(() => {
    const arrowMap = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };

    const handleKey = (e, pressed) => {
      const k = arrowMap[e.key] || e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) {
        e.preventDefault();
        setKeys((prev) => {
          const next = { ...prev, [k]: pressed };
          const x = -(next.d ? 1 : 0) + (next.a ? 1 : 0);
          const y = -(next.w ? 1 : 0) + (next.s ? 1 : 0);
          setFlippedJoystick(y, x);
          const anyKey = next.w || next.a || next.s || next.d;
          setThumbPos(anyKey ? { x: -x, y } : null);
          return next;
        });
      }
      if (pressed) {
        const cameraKeys = { 1: 'wideRoad', 2: 'driver' };
        if (cameraKeys[e.key]) {
          e.preventDefault();
          onSwitchCamera(cameraKeys[e.key]);
        }
      }
    };

    const onKeyDown = (e) => handleKey(e, true);
    const onKeyUp = (e) => handleKey(e, false);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [setFlippedJoystick, onSwitchCamera]);

  // Gamepad polling
  useEffect(() => {
    const activated = triggerActivatedRef.current;

    const pollGamepad = () => {
      gamepadFrameRef.current = requestAnimationFrame(pollGamepad);
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

      if (!gp) {
        if (gamepadConnected) onGamepadChange(false);
        return;
      }

      if (!gamepadConnected) onGamepadChange(true);

      const DEADZONE = 0.15;
      let lx = gp.axes[0] || 0;
      if (Math.abs(lx) < DEADZONE) lx = 0;

      const rawRt = gp.axes[5] !== undefined ? gp.axes[5] : undefined;
      const rawLt = gp.axes[4] !== undefined ? gp.axes[4] : undefined;
      if (rawRt !== undefined && rawRt !== 0) activated.rt = true;
      if (rawLt !== undefined && rawLt !== 0) activated.lt = true;
      const rt = rawRt !== undefined ? ((activated.rt ? rawRt : -1) + 1) / 2
        : gp.buttons[7] ? gp.buttons[7].value : 0;
      const lt = rawLt !== undefined ? ((activated.lt ? rawLt : -1) + 1) / 2
        : gp.buttons[6] ? gp.buttons[6].value : 0;

      const throttle = lt - rt;
      const lb = gp.buttons[4] && gp.buttons[4].pressed;
      const rb = gp.buttons[5] && gp.buttons[5].pressed;

      setGamepadState({ steering: lx, gas: rt, brake: lt, lb: !!lb, rb: !!rb });

      setFlippedJoystick(throttle, -lx);

      if (lx !== 0 || rt > 0 || lt > 0) {
        setThumbPos({ x: lx, y: throttle });
      } else if (touchIdRef.current === null && !mouseDraggingRef.current) {
        setThumbPos(null);
      }

      const prev = prevBumpersRef.current;
      if (lb && !prev.lb) onSwitchCamera('driver');
      if (rb && !prev.rb) onSwitchCamera('wideRoad');
      prevBumpersRef.current = { lb, rb };
    };

    gamepadFrameRef.current = requestAnimationFrame(pollGamepad);
    return () => {
      if (gamepadFrameRef.current) cancelAnimationFrame(gamepadFrameRef.current);
    };
  }, [setFlippedJoystick, gamepadConnected, onGamepadChange, onSwitchCamera]);

  // Cleanup mouse listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  if (gamepadConnected) {
    return (
      <ControllerOverlay
        gamepadSteering={gamepadState.steering}
        gamepadGas={gamepadState.gas}
        gamepadBrake={gamepadState.brake}
        gamepadLB={gamepadState.lb}
        gamepadRB={gamepadState.rb}
        activeCamera={activeCamera}
      />
    );
  }

  const joystick = (
    <TouchJoystick
      isLandscape={isLandscape}
      thumbPos={thumbPos}
      joystickAreaRef={joystickAreaRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    />
  );

  if (!isLandscape) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 0, overflow: 'hidden' }}>
        {joystick}
      </div>
    );
  }

  return joystick;
}
