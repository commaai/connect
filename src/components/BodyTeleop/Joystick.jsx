import React, { useState, useEffect, useRef, useCallback } from 'react';

const ControllerOverlay = ({ classes, gamepadSteering, gamepadGas, gamepadBrake, gamepadLB, gamepadRB, activeCamera }) => {
  const thumbLeft = 50 + gamepadSteering * 34;

  return (
    <div className={classes.controllerOverlay}>
      <div className={classes.triggerContainer}>
        <span className={`${classes.bumperLabel} ${gamepadLB ? classes.bumperLabelActive : ''}`}>Driver Camera</span>
        <div
          className={`${classes.bumperShape} ${gamepadLB ? classes.bumperActive : ''}`}
          style={activeCamera === 'driver' ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined}
        >
          <span className={`${classes.bumperLabel} ${gamepadLB ? classes.bumperLabelActive : ''}`}>L1</span>
        </div>
        <div className={classes.triggerShape}>
          <div className={classes.triggerFill} style={{ height: `${gamepadBrake * 100}%`, background: 'rgba(239,68,68,0.45)' }} />
          <span className={classes.triggerInnerLabel}>LT</span>
        </div>
        <span className={classes.triggerLabel}>Backward</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span className={classes.controllerJoystickLabel}>L Stick — Steering</span>
        <div className={classes.controllerJoystick}>
          <div className={classes.controllerJoystickTrack} />
          <span className={classes.controllerJoystickArrows} style={{ left: 6 }}>{'\u25C0'}</span>
          <span className={classes.controllerJoystickArrows} style={{ right: 6 }}>{'\u25B6'}</span>
          <div className={classes.controllerJoystickThumb} style={{ left: `calc(${thumbLeft}% - 16px)` }} />
        </div>
      </div>

      <div className={classes.triggerContainer}>
        <span className={`${classes.bumperLabel} ${gamepadRB ? classes.bumperLabelActive : ''}`}>Road Camera</span>
        <div
          className={`${classes.bumperShape} ${gamepadRB ? classes.bumperActive : ''}`}
          style={activeCamera === 'wideRoad' ? { background: 'rgba(59,130,246,0.35)', borderColor: 'rgba(59,130,246,0.5)' } : undefined}
        >
          <span className={`${classes.bumperLabel} ${gamepadRB ? classes.bumperLabelActive : ''}`}>R1</span>
        </div>
        <div className={classes.triggerShape}>
          <div className={classes.triggerFill} style={{ height: `${gamepadGas * 100}%`, background: 'rgba(34,197,94,0.45)' }} />
          <span className={classes.triggerInnerLabel}>RT</span>
        </div>
        <span className={classes.triggerLabel}>Forward</span>
      </div>
    </div>
  );
};

const TouchJoystick = ({ classes, isLandscape, thumbPos, joystickAreaRef, onTouchStart, onTouchMove, onTouchEnd, onMouseDown }) => {
  const thumbRange = isLandscape ? 40 : 45;
  const thumbLeft = thumbPos ? `${50 + thumbPos.x * thumbRange}%` : '50%';
  const thumbTop = thumbPos ? `${50 + thumbPos.y * thumbRange}%` : '50%';
  const joystickClass = isLandscape ? classes.joystickArea : classes.joystickAreaMobile;

  return (
    <div
      ref={joystickAreaRef}
      className={`${joystickClass} ${classes.joystickAreaSquare}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={classes.joystickCrosshairV} />
      <div className={classes.joystickCrosshairH} />
      <div className={classes.joystickCenter} />
      <div
        className={`${classes.joystickThumb} ${thumbPos ? classes.joystickThumbActive : ''}`}
        style={{ left: thumbLeft, top: thumbTop }}
      />
    </div>
  );
};

const Joystick = ({
  classes, connection, activeCamera, isLandscape,
  onGamepadChange, onSwitchCamera, gamepadConnected,
}) => {
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
    const onKeyDown = (e) => {
      const arrowMap = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
      const k = arrowMap[e.key] || e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) {
        e.preventDefault();
        setKeys((prev) => {
          const next = { ...prev, [k]: true };
          const x = -(next.d ? 1 : 0) + (next.a ? 1 : 0);
          const y = -(next.w ? 1 : 0) + (next.s ? 1 : 0);
          setFlippedJoystick(y, x);
          const anyKey = next.w || next.a || next.s || next.d;
          setThumbPos(anyKey ? { x: -x, y } : null);
          return next;
        });
      }
      const cameraKeys = { 1: 'wideRoad', 2: 'driver' };
      if (cameraKeys[e.key]) {
        e.preventDefault();
        onSwitchCamera(cameraKeys[e.key]);
      }
    };

    const onKeyUp = (e) => {
      const arrowMap = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
      const k = arrowMap[e.key] || e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) {
        e.preventDefault();
        setKeys((prev) => {
          const next = { ...prev, [k]: false };
          const x = -(next.d ? 1 : 0) + (next.a ? 1 : 0);
          const y = -(next.w ? 1 : 0) + (next.s ? 1 : 0);
          setFlippedJoystick(y, x);
          const anyKey = next.w || next.a || next.s || next.d;
          setThumbPos(anyKey ? { x: -x, y } : null);
          return next;
        });
      }
    };

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

      const flip = (activeCamera === 'wideRoad') ? -1 : 1;
      connection?.setJoystick(flip * throttle, -lx);

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
  }, [connection, activeCamera, gamepadConnected, onGamepadChange, onSwitchCamera]);

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
        classes={classes}
        gamepadSteering={gamepadState.steering}
        gamepadGas={gamepadState.gas}
        gamepadBrake={gamepadState.brake}
        gamepadLB={gamepadState.lb}
        gamepadRB={gamepadState.rb}
        activeCamera={activeCamera}
      />
    );
  }

  if (!isLandscape) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 0, overflow: 'hidden' }}>
        <TouchJoystick
          classes={classes}
          isLandscape={false}
          thumbPos={thumbPos}
          joystickAreaRef={joystickAreaRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        />
      </div>
    );
  }

  return (
    <TouchJoystick
      classes={classes}
      isLandscape
      thumbPos={thumbPos}
      joystickAreaRef={joystickAreaRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    />
  );
};

export default Joystick;
