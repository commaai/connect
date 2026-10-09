# Remaining platform validation

Status: simulator validation in progress; physical-device validation unavailable. The user clarified that they cannot test on iPhone/iPad or Android. Xcode and iOS 26.5 simulators are installed locally. Initial clean iPhone 17 / iOS 26.5 Safari smoke check visibly decoded the local HLS fixture. Pause/seek, audio, standalone installation and broader platform cases are not yet verified in the simulator. Native UI clicks returned `noWindowsAvailable` despite successful screenshots; resolve that control issue before claiming interactive passes. Android SDK/adb is installed, but no emulator binary was found in the SDK or PATH. Use actual iOS Safari/standalone simulator checks and an Android emulator when available, label them accurately, and disclose the remaining hardware/audio limitations. Desktop WebKit with an iPhone user agent is separate evidence.

Test Safari on iPhone/iPad and its installed Home Screen app, then Chrome on Android and its installed app. Record device model, OS/browser version, browser vs standalone mode, route/fixture, connection, result and any failure. Listen to audio on the actual device.

1. Cold-open a route and a nonzero selected range. Check first image, loading feedback and initial map/time alignment.
2. Play, pause, mute/unmute and change speed. Listen for clicks, duplicate sound, loss of audio and incorrect rate. Pause must freeze followers.
3. Seek rapidly, while loading, while paused, near 60/120 seconds and near the end. The final request must win; the displayed image must match the time.
4. Switch to Map during playback, seek while paused there and return to Video. Check retained pause/play intent and the new image. Check geographic marker and thumbnails on a real demo route.
5. Select a range beginning at zero and one ending at the route end. Verify repeated loops continue correctly.
6. Use the missing-middle-minute fixture; seek to 85 seconds. It should show available footage at about 120 seconds, then correctly seek to 130/150 seconds. A range wholly inside missing footage should show an error.
7. Disconnect the network while seeking to unbuffered footage. Followers must freeze; reconnect/Retry must resume decoding and clear errors. Test unavailable media and ensure recovery controls remain usable in Map.
8. Background the browser/app, lock/unlock the phone, return and repeat audio/seeking. Test native media controls and autoplay requiring a tap.
9. Repeat a representative real public demo route over Wi-Fi and cellular. The synthetic 320×180 fixture does not establish high-resolution or poor-network performance.
10. Export local JSON from the test form; attach a short recording showing seeks, Map continuity, audible audio and recovery for each device/mode.

## Local HTTPS test kit

```sh
sh scripts/playback-bench/make-test-cert.sh YOUR_MAC_LAN_IP
node scripts/playback-bench/serve.mjs
```

The phone and Mac must share a reachable LAN. Open `https://YOUR_MAC_LAN_IP:8443/scripts/playback-bench/index.html?details=1&duration=180&media=/media/minute/stream.m3u8&manual=1` for the fixture, and `/demo` for the full local application. The fixture has a local result-export form. The server serves test manifests/icons for standalone installation; production manifests are unchanged. It binds LAN ports 8443 and 8080 and requires the current app and benchmark builds.

HTTPS is required for installability outside localhost. The optional script creates a seven-day local CA/server certificate and does not change system trust. If choosing to trust this test CA, download only its public certificate from `http://YOUR_MAC_LAN_IP:8080/connect-test-ca.cer`, verify its fingerprint from the script output, and follow the device's certificate settings. Remove the test profile/CA after QA. Never share private keys or include `test-results/playback/tls` in submission evidence.

Apple trust steps: https://support.apple.com/en-us/102390 . Android certificate settings vary by device; Google's instructions: https://support.google.com/pixelphone/answer/2844832 . Installability requirements: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable .
