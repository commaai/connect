import React, { useEffect, useRef, useState } from 'react';
import { Mic, PlayArrow, VolumeOff, VolumeUp } from '../../icons';

export default function AudioControls({ connection, buttonClass, activeButtonClass, groupClass, labelClass }) {
  const audioRef = useRef(null);
  const talkRef = useRef(null);
  const [listening, setListening] = useState(true);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const playRef = useRef(() => {});

  useEffect(() => {
    const audio = audioRef.current;
    const initial = audio.volume;
    const target = speaking ? 0.25 : 1;
    const duration = speaking ? 80 : 240;
    const started = performance.now();
    let frame;
    const fade = (now) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      audio.volume = initial + (target - initial) * progress;
      if (progress < 1) frame = requestAnimationFrame(fade);
    };
    frame = requestAnimationFrame(fade);
    return () => cancelAnimationFrame(frame);
  }, [speaking]);

  useEffect(() => {
    if (!connection) return undefined;
    let active = true;
    let held = false;
    const stop = () => {
      held = false;
      connection.setSpeaking(false);
      setSpeaking(false);
    };
    const start = async () => {
      if (held) return;
      held = true;
      setError(null);
      playRef.current();
      try {
        await connection.prepareMicrophone();
        if (!active || !held) return;
        connection.setSpeaking(true);
        setSpeaking(true);
      } catch (err) {
        if (active) { stop(); setError(`Microphone: ${err.message}`); }
      }
    };
    const onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
        || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const control = event.target?.closest?.('button, a[href], summary, audio[controls], video[controls], [tabindex], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="treeitem"]');
      if (control && control !== talkRef.current) return;
      event.preventDefault();
      start();
    };
    const onKeyUp = (event) => { if (event.code === 'Space') stop(); };
    const onVisibility = () => { if (document.hidden) stop(); };
    const button = talkRef.current;
    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      start();
    };
    const onButtonKeyDown = (event) => {
      if (event.code === 'Enter' && !event.repeat) { event.preventDefault(); start(); }
    };
    const onButtonKeyUp = (event) => { if (event.code === 'Enter') { event.preventDefault(); stop(); } };
    const onError = (event) => { stop(); setError(event.detail); };
    connection.addEventListener('audioerror', onError);
    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    button.addEventListener('keydown', onButtonKeyDown);
    button.addEventListener('keyup', onButtonKeyUp);
    button.addEventListener('blur', stop);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      stop();
      connection.removeEventListener('audioerror', onError);
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointerup', stop);
      button.removeEventListener('pointercancel', stop);
      button.removeEventListener('lostpointercapture', stop);
      button.removeEventListener('keydown', onButtonKeyDown);
      button.removeEventListener('keyup', onButtonKeyUp);
      button.removeEventListener('blur', stop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
      connection.releaseMicrophone();
      connection.setListening(false);
    };
  }, [connection]);

  useEffect(() => {
    const audio = audioRef.current;
    let active = true;
    const play = () => {
      if (!listening || !audio.srcObject) return;
      Promise.resolve(audio.play()).then(() => {
        if (active) setPlaybackBlocked(false);
      }).catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setPlaybackBlocked(true);
      });
    };
    const update = () => {
      if (audio.srcObject !== connection?.remoteAudioStream) audio.srcObject = connection?.remoteAudioStream || null;
      play();
    };
    audio.muted = !listening;
    connection?.setListening(listening);
    if (!listening) setPlaybackBlocked(false);
    update();
    playRef.current = play;
    connection?.addEventListener('audiochange', update);
    audio.addEventListener('loadedmetadata', play);
    // Retry autoplay within a user gesture if the browser initially blocked it.
    const onGesture = () => { if (audio.paused) play(); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      active = false;
      connection?.removeEventListener('audiochange', update);
      audio.removeEventListener('loadedmetadata', play);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      audio.pause();
      audio.srcObject = null;
    };
  }, [connection, listening]);

  const toggleListening = () => {
    setError(null);
    if (playbackBlocked && listening) {
      playRef.current();
      return;
    }
    const enabled = !listening;
    audioRef.current.muted = !enabled;
    connection?.setListening(enabled);
    setListening(enabled);
  };
  const audioLabel = playbackBlocked ? 'Play device audio' : listening ? 'Mute device microphone' : 'Unmute device microphone';
  const AudioIcon = playbackBlocked ? PlayArrow : listening ? VolumeUp : VolumeOff;

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline muted={!listening} />
      <div className={groupClass}>
        <button className={buttonClass} aria-label={audioLabel} title={audioLabel} aria-pressed={!listening} onClick={toggleListening}>
          <AudioIcon className="text-[25px]" />
        </button>
        <span className={labelClass}>{playbackBlocked ? 'Play audio' : listening ? 'Sound' : 'Muted'}</span>
      </div>
      <div className={groupClass}>
        <button ref={talkRef} className={`${speaking ? activeButtonClass : buttonClass} touch-none`}
          title="Hold to speak (Space)" aria-label="Hold to speak" aria-pressed={speaking} aria-keyshortcuts="Space"
          onContextMenu={(event) => event.preventDefault()}>
          <Mic className="text-[25px]" />
        </button>
        <span className={`${labelClass} grid`}>
          <span className={`col-start-1 row-start-1 ${speaking ? 'invisible' : ''}`} aria-hidden={speaking}>Hold Space</span>
          <span className={`col-start-1 row-start-1 ${speaking ? '' : 'invisible'}`} aria-hidden={!speaking}>Speaking</span>
        </span>
      </div>
      {error && <span role="alert" className="basis-full text-sm text-red-300">{error}</span>}
    </>
  );
}
