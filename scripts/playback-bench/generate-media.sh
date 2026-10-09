#!/bin/sh
# Usage: FFMPEG=/path/to/ffmpeg sh scripts/playback-bench/generate-media.sh
set -eu
mkdir -p test-results/playback/media
"${FFMPEG:-ffmpeg}" -hide_banner -loglevel error -y \
  -f lavfi -i testsrc2=size=320x180:rate=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 60 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 \
  -c:a aac -b:a 64k -hls_time 2 -hls_playlist_type vod \
  -hls_segment_filename test-results/playback/media/segment-%02d.ts \
  test-results/playback/media/stream.m3u8
# Optional production-shaped fixtures: three one-minute chunks and an actual
# timestamp hole. Nothing is downloaded from user accounts or public videos.
if [ "${EXTENDED:-0}" = 1 ]; then
  mkdir -p test-results/playback/media/minute test-results/playback/media/0 test-results/playback/media/1 test-results/playback/media/2
  "${FFMPEG:-ffmpeg}" -hide_banner -loglevel error -y \
    -f lavfi -i testsrc2=size=320x180:rate=30 \
    -f lavfi -i sine=frequency=440:sample_rate=48000 -t 180 \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -c:a aac -b:a 64k -hls_time 60 -hls_playlist_type vod \
    -hls_segment_filename test-results/playback/media/minute/segment-%02d.ts \
    test-results/playback/media/minute/stream.m3u8
  sed 's/#EXTINF:60.000000,/#EXTINF:60.000000,0/' test-results/playback/media/minute/stream.m3u8 > test-results/playback/media/minute/tmp.m3u8
  awk '/^#EXTINF:/{sub(/,0$/, "," n++);} {print}' test-results/playback/media/minute/tmp.m3u8 > test-results/playback/media/minute/stream.m3u8
  rm test-results/playback/media/minute/tmp.m3u8
  # Keep the timestamp discontinuity instead of pretending missing footage exists.
  sed '/#EXTINF:60.000000,1/{N;/segment-01.ts/d;}' test-results/playback/media/minute/stream.m3u8 > test-results/playback/media/minute/gap.m3u8
  "${FFMPEG:-ffmpeg}" -hide_banner -loglevel error -y \
    -f lavfi -i testsrc2=size=128x80:rate=1/5 -frames:v 1 \
    -vf tile=12x1 -update 1 test-results/playback/media/0/sprite.jpg
  cp test-results/playback/media/0/sprite.jpg test-results/playback/media/1/sprite.jpg
  cp test-results/playback/media/0/sprite.jpg test-results/playback/media/2/sprite.jpg
  mkdir -p test-results/playback/media/golden
  for target in 0 45 59.8 60.1 119.8 120 120.1 130 150 179.5; do
    "${FFMPEG:-ffmpeg}" -hide_banner -loglevel error -y -i test-results/playback/media/minute/stream.m3u8 -ss "$target" -frames:v 1 \
      -pix_fmt rgb24 -f rawvideo "test-results/playback/media/golden/$target.rgb"
  done
fi
