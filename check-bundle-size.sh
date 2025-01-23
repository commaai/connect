#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
cd $DIR

gzip -r -9 dist

# Calculate bundle size excluding PWA assets
BUNDLE_SIZE=$(find dist -type f \
    ! -name "apple-splash-*" \
    ! -name "apple-icon-*" \
    -print0 | xargs -0 du -ck | grep total$ | cut -f1)

echo "Bundle size (excluding specified assets) is $BUNDLE_SIZE K"

if [ $BUNDLE_SIZE -lt 200 ]; then
  echo "Bundle size lower than expected, let's lower the limit!"
  exit 1
fi

if [ $BUNDLE_SIZE -gt 325 ]; then
  echo "Exceeded bundle size limit!"
  exit 1
fi
