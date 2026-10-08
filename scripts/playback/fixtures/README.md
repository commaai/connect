# Synthetic HLS fixture

`audio.m3u8` and `segment-*.ts` contain 24 seconds of generated test-pattern video
and a 660 Hz tone. There is no camera footage or recorded user audio. The stream
uses H.264 Constrained Baseline (160 × 90, 15 fps) and mono AAC-LC (48 kHz), with
two-second segments. The complete fixture is about 252 KiB.

Generated with FFmpeg. From the repository root, regenerate with:

```sh
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i 'testsrc2=size=160x90:rate=15' \
  -f lavfi -i 'sine=frequency=660:sample_rate=48000' \
  -t 24 -c:v libx264 -profile:v baseline -pix_fmt yuv420p \
  -crf 34 -preset veryslow -g 30 -keyint_min 30 -sc_threshold 0 \
  -c:a aac -ac 1 -b:a 24k \
  -f hls -hls_time 2 -hls_playlist_type vod \
  -hls_segment_filename 'scripts/playback/fixtures/segment-%03d.ts' \
  scripts/playback/fixtures/audio.m3u8
```

The committed assets let the tests run without FFmpeg or external media downloads.
The local test server injects failures and delays; fault-specific media copies
are unnecessary.
