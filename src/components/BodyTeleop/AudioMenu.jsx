import React, {
  useCallback, useLayoutEffect, useRef, useState,
} from 'react';
import Check from '@material-ui/icons/Check';
import ChevronRight from '@material-ui/icons/ChevronRight';
import VolumeOff from '@material-ui/icons/VolumeOff';
import VolumeUp from '@material-ui/icons/VolumeUp';
import { ArrowBackBold } from '../../icons';
import { useClickOutside } from '../../hooks/useClickOutside';

const TONE_OPTIONS = [
  { key: 'low', label: '440 hz', frequency: 440 },
  { key: 'mid', label: '1 khz', frequency: 1000 },
  { key: 'high', label: '2 khz', frequency: 2000 },
];
const PULSE_OPTIONS = [
  { key: 'tone', label: 'delay tone', frequency: 1000, sweep: false },
  { key: 'chirp', label: 'delay chirp', frequency: 1000, sweep: true },
];
const PULSE_CONFIG = { pulsed: true, pulseMs: 150, periodMs: 1000, durationMs: 20000 };
const rowClass = 'flex items-center h-9 px-3.5 gap-3 cursor-pointer select-none text-[13px] text-white/85 hover:bg-white/10 transition-colors whitespace-nowrap';
const pageClass = 'absolute top-0 left-0 w-full min-w-[250px] py-1.5 transition-all duration-200 ease-out';

const AudioMenu = ({
  speakerVolume, onSpeakerVolumeChange,
  audioOutputs = [], selectedAudioOutput, onAudioOutputChange,
  playingAudioName, onPlayTutu, onPlayFile, onStopAudio, audioError,
  onTestTone,
}) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main');
  const wrapperRef = useRef(null);
  const mainRef = useRef(null);
  const outputRef = useRef(null);
  const testRef = useRef(null);
  const fileRef = useRef(null);
  const [dims, setDims] = useState(null);

  useLayoutEffect(() => {
    const el = { main: mainRef, output: outputRef, test: testRef }[view]?.current;
    if (el) setDims({ width: el.offsetWidth, height: el.offsetHeight });
  }, [view, open, audioOutputs, playingAudioName, audioError]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setView('main');
  }, []);
  useClickOutside(wrapperRef, open, closeMenu);

  const toggleOpen = useCallback((event) => {
    event.stopPropagation();
    setOpen((previous) => {
      if (previous) setView('main');
      return !previous;
    });
  }, []);

  const handleFile = useCallback((event) => {
    const [file] = event.target.files || [];
    if (file) onPlayFile?.(file);
    event.target.value = '';
  }, [onPlayFile]);

  const sendTone = useCallback((tone) => {
    onTestTone?.(tone.frequency, 1000);
  }, [onTestTone]);

  const sendPulses = useCallback((tone) => {
    onTestTone?.(tone.frequency, PULSE_CONFIG.durationMs, { ...PULSE_CONFIG, sweep: tone.sweep });
  }, [onTestTone]);

  const selectedOutput = audioOutputs.find((device) => device.id === selectedAudioOutput);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className={`group flex items-center justify-center h-9 px-3.5 rounded-[18px] cursor-pointer select-none bg-glass hover:!bg-black/60 ${playingAudioName ? 'text-white' : 'text-white/60'}`}
        onClick={toggleOpen}
        title="Audio controls"
      >
        <span className="text-[13px] font-semibold tracking-[0.5px] uppercase leading-none">audio</span>
      </button>
      <div
        className={`absolute right-0 top-full mt-2 z-50 origin-top-right overflow-hidden rounded-[12px] bg-glass-dark transition-all duration-200 ease-out ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={dims ? { width: dims.width, height: dims.height } : undefined}
      >
        <div
          ref={mainRef}
          className={pageClass}
          style={{ transform: view === 'main' ? 'translateX(0)' : 'translateX(-100%)', opacity: view === 'main' ? 1 : 0, pointerEvents: open && view === 'main' ? 'auto' : 'none' }}
        >
          <div className="flex items-center h-11 px-3.5 gap-2 text-white/85">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white"
              aria-label={speakerVolume > 0 ? 'Mute speaker' : 'Unmute speaker'}
              onClick={() => onSpeakerVolumeChange(speakerVolume > 0 ? 0 : 100)}
            >
              {speakerVolume > 0 ? <VolumeUp style={{ fontSize: 22 }} /> : <VolumeOff style={{ fontSize: 22 }} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={speakerVolume}
              onChange={(event) => onSpeakerVolumeChange(Number(event.target.value))}
              aria-label="Speaker volume"
              className="flex-1 cursor-pointer accent-white"
              style={{ touchAction: 'pan-x', accentColor: 'rgba(255, 255, 255, 0.85)' }}
            />
            <span className="w-7 text-right text-[11px] text-white/45">{speakerVolume}</span>
          </div>
          <div className="h-px bg-white/10 mx-2 my-1" />
          <button type="button" className={`${rowClass} w-full border-0 bg-transparent text-left`} onClick={playingAudioName ? onStopAudio : onPlayTutu}>
            <span className="flex-1">{playingAudioName ? `Stop ${playingAudioName}` : 'Play Tutu'}</span>
            <span className="text-[10px] text-white/40">{playingAudioName ? 'playing' : 'wav'}</span>
          </button>
          <button type="button" className={`${rowClass} w-full border-0 bg-transparent text-left`} onClick={() => fileRef.current?.click()}>
            <span className="flex-1">Choose audio file</span>
            <span className="text-[10px] text-white/40">wav · mp3</span>
          </button>
          <input ref={fileRef} type="file" accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" className="hidden" onChange={handleFile} />
          {audioOutputs.length > 0 && (
            <div className={rowClass} onClick={() => setView('output')}>
              <span className="flex-1">Audio Output</span>
              <span className="flex max-w-[130px] items-center gap-1 text-white/45">
                <span className="truncate">{selectedOutput?.name || 'unknown'}</span>
                <ChevronRight style={{ fontSize: 18 }} />
              </span>
            </div>
          )}
          {onTestTone && (
            <div className={rowClass} onClick={() => setView('test')}>
              <span className="flex-1">Audio Test</span>
              <ChevronRight style={{ fontSize: 18 }} className="text-white/45" />
            </div>
          )}
          {audioError && <div className="px-3.5 py-2 text-[11px] text-red-300 max-w-[280px] whitespace-normal">{audioError}</div>}
        </div>

        <div
          ref={outputRef}
          className={pageClass}
          style={{ transform: view === 'output' ? 'translateX(0)' : 'translateX(100%)', opacity: view === 'output' ? 1 : 0, pointerEvents: open && view === 'output' ? 'auto' : 'none' }}
        >
          <div className={`${rowClass} font-medium text-white/90`} onClick={() => setView('main')}>
            <ArrowBackBold className="w-4 h-4 -ml-1 text-white/70" />
            <span>Audio Output</span>
          </div>
          <div className="h-px bg-white/10 mx-2 my-1" />
          {audioOutputs.map((device) => (
            <button type="button" key={device.id} className={`${rowClass} w-full border-0 bg-transparent text-left`} onClick={() => onAudioOutputChange(device.id)}>
              <span className="flex w-4 items-center justify-center">{device.id === selectedAudioOutput && <Check style={{ fontSize: 16 }} />}</span>
              <span className="flex-1 normal-case">{device.name}{device.isDefault ? ' (default)' : ''}</span>
            </button>
          ))}
        </div>

        <div
          ref={testRef}
          className={pageClass}
          style={{ transform: view === 'test' ? 'translateX(0)' : 'translateX(100%)', opacity: view === 'test' ? 1 : 0, pointerEvents: open && view === 'test' ? 'auto' : 'none' }}
        >
          <div className={`${rowClass} font-medium text-white/90`} onClick={() => setView('main')}>
            <ArrowBackBold className="w-4 h-4 -ml-1 text-white/70" />
            <span>Audio Test</span>
          </div>
          <div className="h-px bg-white/10 mx-2 my-1" />
          {TONE_OPTIONS.map((tone) => <div key={tone.key} className={rowClass} onClick={() => sendTone(tone)}><span className="flex-1">{tone.label}</span><span className="text-[10px] text-white/40">1 sec</span></div>)}
          <div className="h-px bg-white/10 mx-2 my-1" />
          {PULSE_OPTIONS.map((tone) => <div key={tone.key} className={rowClass} onClick={() => sendPulses(tone)}><span className="flex-1">{tone.label}</span><span className="text-[10px] text-white/40">1 hz · 20 s</span></div>)}
        </div>
      </div>
    </div>
  );
};

export default AudioMenu;
