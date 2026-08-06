import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect } from 'react-redux';

import { ArrowBackBold } from '../../icons';
import { deviceNamePretty } from '../../utils';
import { webrtcConnectionManager } from '../../utils/webrtc';
import { useIsLandscape } from '../../hooks/window';
import StatusBar from './StatusBar';
import ControlsBar from './ControlsBar';
import Video from './Video';
import Joystick from './Joystick';

function audioOnlyStream(stream) {
  return new MediaStream(stream?.getAudioTracks?.() || []);
}

const SPEAKER_VOLUME_STORAGE_KEY = 'bodyTeleopSpeakerVolume';
const DEFAULT_SPEAKER_VOLUME = 100;
const TUTU_AUDIO_URL = `${import.meta.env.BASE_URL}audio/Tutu.wav`;

const clampSpeakerVolume = (volume) => {
  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume)) return DEFAULT_SPEAKER_VOLUME;
  return Math.max(0, Math.min(100, Math.round(numericVolume)));
};

const readStoredSpeakerVolume = () => {
  try {
    const storedVolume = window.localStorage?.getItem(SPEAKER_VOLUME_STORAGE_KEY);
    return storedVolume == null ? DEFAULT_SPEAKER_VOLUME : clampSpeakerVolume(storedVolume);
  } catch {
    return DEFAULT_SPEAKER_VOLUME;
  }
};

const BodyTeleop = ({ dongleId, device, onClose }) => {
  const [connectionState, setConnectionState] = useState('none');
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState(null);
  const [activeCamera, setActiveCamera] = useState('wideRoad');
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [inputActive, setInputActive] = useState(false);
  const [connectionTotalMs, setConnectionTotalMs] = useState(null);
  const [speakerVolume, setSpeakerVolume] = useState(readStoredSpeakerVolume);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(null);
  const [playingAudioName, setPlayingAudioName] = useState(null);
  const [audioError, setAudioError] = useState(null);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const streamsRef = useRef({});
  const connectionRef = useRef(null);
  const latencyCallbackRef = useRef(null);
  const switchTimerRef = useRef(null);
  const connectStartedAtRef = useRef(null);
  const firstFrameMeasuredRef = useRef(false);
  const audioPlaybackIdRef = useRef(0);

  const isLandscape = useIsLandscape();
  const notCar = Boolean(device?.rpc?.not_car);

  const resetConnectionTiming = useCallback(() => {
    setConnectionTotalMs(null);
    connectStartedAtRef.current = performance.now();
    firstFrameMeasuredRef.current = false;
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const callbacks = {
      onConnectionState: (state, reason) => {
        connectionRef.current = webrtcConnectionManager.connection;
        setConnectionState(state);
        if (state !== 'connected') {
          audioPlaybackIdRef.current += 1;
          setPlayingAudioName(null);
        }
        if (state === 'connecting') {
          setError(null);
        } else if (state === 'failed') {
          setError((prev) => prev || reason || 'Could not reach device. Check its connection and retry.');
        } else if (state === 'disconnected' && reason) {
          setError(reason);
        }
      },
      onBatteryLevel: setBattery,
      onSoundDeviceState: (data) => {
        if (!data || !Array.isArray(data.devices)) return;
        setAudioOutputs(data.devices);
        setSelectedAudioOutput(Number.isInteger(data.selectedDeviceId) ? data.selectedDeviceId : null);
      },
      onVideoTrack: (streamName, stream) => {
        streamsRef.current[streamName] = stream;
        if (streamName !== 'road' && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      },
      onAudioTrack: (stream) => {
        const audioStream = audioOnlyStream(stream);
        streamsRef.current.audio = audioStream;
        if (audioRef.current) {
          audioRef.current.srcObject = audioStream;
          audioRef.current.play?.().catch(() => {});
        }
      },
      onLatencyUpdate: (latency) => {
        if (latencyCallbackRef.current) latencyCallbackRef.current(latency);
      },
    };

    resetConnectionTiming();
    connectionRef.current = webrtcConnectionManager.acquire(dongleId, callbacks, true);

    return () => {
      webrtcConnectionManager.release(callbacks);
    };
  }, [dongleId, resetConnectionTiming]);

  useEffect(() => {
    if (connectionState === 'connected') {
      webrtcConnectionManager.setSpeakerVolume(speakerVolume);
    }
  }, [connectionState, speakerVolume]);

  useEffect(() => {
    if (connectionState === 'connected') {
      connectionRef.current?.enableAudioCapture(!microphoneMuted);
    }
  }, [connectionState, microphoneMuted]);

  const handleConnect = useCallback(() => {
    setError(null);
    setActiveCamera('wideRoad');
    resetConnectionTiming();
    connectionRef.current = webrtcConnectionManager.reconnect(dongleId, true);
  }, [dongleId, resetConnectionTiming]);

  const handleClose = useCallback(() => {
    webrtcConnectionManager.disconnect();
    if (onClose) onClose();
  }, [onClose]);

  const switchCamera = useCallback((cameraName) => {
    setActiveCamera((prev) => {
      if (cameraName === prev) return prev;
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = null;
        connectionRef.current?.switchCamera(cameraName);
      }, 200);
      return cameraName;
    });
  }, []);

  const handleQualityChange = useCallback((nextQuality) => {
    connectionRef.current?.setQuality(nextQuality);
  }, []);

  const handleTestTone = useCallback((frequency, durationMs, opts) => {
    audioPlaybackIdRef.current += 1;
    setPlayingAudioName(null);
    setAudioError(null);
    if (opts?.pulsed) {
      connectionRef.current?.sendDelayTone(frequency, {
        durationMs,
        pulseMs: opts.pulseMs,
        periodMs: opts.periodMs,
        sweep: opts.sweep,
      });
    } else {
      connectionRef.current?.sendTestTone(frequency, durationMs);
    }
  }, []);

  const handleSpeakerVolumeChange = useCallback((volume) => {
    const nextVolume = clampSpeakerVolume(volume);
    setSpeakerVolume(nextVolume);
    try {
      window.localStorage?.setItem(SPEAKER_VOLUME_STORAGE_KEY, String(nextVolume));
    } catch {
      // Ignore storage failures; the live control still works for this session.
    }
    webrtcConnectionManager.setSpeakerVolume(nextVolume);
  }, []);

  const handleAudioOutputChange = useCallback((deviceId) => {
    connectionRef.current?.setSoundDevice(deviceId);
  }, []);

  const handleToggleMicrophone = useCallback(() => {
    setMicrophoneMuted((muted) => !muted);
  }, []);

  const playAudioBuffer = useCallback(async (name, arrayBuffer) => {
    const connectionForPlayback = connectionRef.current;
    if (!connectionForPlayback || connectionForPlayback.connectionState !== 'connected') {
      setAudioError('Connect to the body before playing audio.');
      return;
    }

    const playbackId = audioPlaybackIdRef.current + 1;
    audioPlaybackIdRef.current = playbackId;
    connectionForPlayback.stopAudioFile();
    setPlayingAudioName(null);
    setAudioError(null);

    try {
      const started = await connectionForPlayback.playAudioFile(arrayBuffer, () => {
        if (audioPlaybackIdRef.current === playbackId) setPlayingAudioName(null);
      });
      if (audioPlaybackIdRef.current !== playbackId) return;
      if (!started) throw new Error('Audio playback is not available on this connection.');
      setPlayingAudioName(name);
    } catch (playbackError) {
      if (audioPlaybackIdRef.current !== playbackId) return;
      setPlayingAudioName(null);
      setAudioError(playbackError?.message || 'Could not play the selected audio file.');
    }
  }, []);

  const handlePlayTutu = useCallback(async () => {
    try {
      setAudioError(null);
      const response = await fetch(TUTU_AUDIO_URL);
      if (!response.ok) throw new Error(`Could not load Tutu (${response.status}).`);
      await playAudioBuffer('Tutu', await response.arrayBuffer());
    } catch (loadError) {
      setAudioError(loadError?.message || 'Could not load Tutu.');
    }
  }, [playAudioBuffer]);

  const handlePlayAudioFile = useCallback(async (file) => {
    try {
      await playAudioBuffer(file.name, await file.arrayBuffer());
    } catch (loadError) {
      setAudioError(loadError?.message || 'Could not read the selected audio file.');
    }
  }, [playAudioBuffer]);

  const handleStopAudio = useCallback(() => {
    audioPlaybackIdRef.current += 1;
    connectionRef.current?.stopAudioFile();
    setPlayingAudioName(null);
    setAudioError(null);
  }, []);

  const handleFirstFrame = useCallback(() => {
    if (connectStartedAtRef.current == null || firstFrameMeasuredRef.current) return;
    firstFrameMeasuredRef.current = true;
    setConnectionTotalMs(performance.now() - connectStartedAtRef.current);
  }, []);

  const connection = connectionRef.current;
  const connected = connectionState === 'connected';
  const deviceName = device ? deviceNamePretty(device) : (isLandscape ? 'Body' : 'Body Teleop');

  const videoProps = {
    videoRef, connectionState, error, connectionTotalMs,
    onFirstFrame: handleFirstFrame,
    onConnect: handleConnect,
  };

  return (
    <div className="fixed top-0 left-0 w-screen h-full z-[1300] bg-[#030404]">
      <div className={`
        absolute inset-0 bg-[#030404] flex flex-col touch-none
        overflow-hidden select-none [-webkit-touch-callout:none] [-webkit-text-size-adjust:none]
        mt-safe-top mb-safe-bottom ml-safe-left mr-safe-right
      `}>
        <div
          className={isLandscape
            ? 'absolute left-2 top-2 z-20 flex items-center gap-1'
            : 'flex items-center px-3 py-2 bg-[#1D2225] border-b border-white/10 min-h-[64px] z-10'}
        >
          <button
            className={isLandscape ? 'flex items-center rounded-full hover:text-white/90 text-white/60 p-2 w-10 h-10 bg-glass cursor-pointer' : 'text-white p-2 cursor-pointer'}
            onClick={handleClose}
          >
            <ArrowBackBold style={{ fontSize: 20 }} />
          </button>
          <div
            className={isLandscape
              ? 'rounded-[20px] px-3.5 h-10 flex items-center text-base font-medium text-white bg-glass border-0'
              : 'text-base font-medium ml-2 flex-1'}
          >
            {deviceName}
          </div>
        </div>
        {connected && (
          <div className='relative'>
            <StatusBar
              battery={battery}
              className={isLandscape
                ? 'absolute top-3 right-3 z-30 flex items-center gap-2'
                : 'relative z-30 flex items-center justify-end p-2 gap-2'}
              isLandscape={isLandscape}
              connection={connection}
              connectionState={connectionState}
              latencyCallbackRef={latencyCallbackRef}
              videoRef={videoRef}
              onQualityChange={handleQualityChange}
              onTestTone={notCar ? handleTestTone : undefined}
              audioOutputs={audioOutputs}
              selectedAudioOutput={selectedAudioOutput}
              onAudioOutputChange={handleAudioOutputChange}
              speakerVolume={speakerVolume}
              onSpeakerVolumeChange={handleSpeakerVolumeChange}
              playingAudioName={playingAudioName}
              onPlayTutu={handlePlayTutu}
              onPlayAudioFile={handlePlayAudioFile}
              onStopAudio={handleStopAudio}
              audioError={audioError}
              microphoneMuted={microphoneMuted}
              onToggleMicrophone={handleToggleMicrophone}
            />
          </div>
        )}
        <audio ref={audioRef} autoPlay className="hidden" />
        <Video key="teleop-video" {...videoProps} className={isLandscape ? "h-full" : "aspect-[16/9]"} />
        {connected && (
          <>
            <ControlsBar
              activeCamera={activeCamera}
              onSwitchCamera={switchCamera}
              gamepadConnected={gamepadConnected}
              videoRef={videoRef}
              isLandscape={isLandscape}
              controlsDisabled={inputActive}
            />
            <div
              className={isLandscape
                ? 'absolute bottom-4 right-4 z-10 w-[160px] h-[160px]'
                : 'flex-1 flex items-center justify-center px-4 pb-12 pt-2 min-h-0 overflow-hidden'}
            >
              <Joystick
                connection={connection}
                activeCamera={activeCamera}
                className={isLandscape
                  ? 'relative w-full h-full'
                  : 'relative w-auto h-full aspect-square max-w-full'}
                onGamepadChange={setGamepadConnected}
                onSwitchCamera={switchCamera}
                gamepadConnected={gamepadConnected}
                onInputActiveChange={setInputActive}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  device: state.device,
});

export default connect(stateToProps)(BodyTeleop);
