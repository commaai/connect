#!/bin/sh

file = /usr/share/nginx/html/config.js

rm $file
echo "window.COMMA_URL_ROOT = '${COMMA_URL_ROOT}';" >> $file
echo "window.ATHENA_URL_ROOT = '${ATHENA_URL_ROOT}';" >> $file
echo "window.BILLING_URL_ROOT = '${BILLING_URL_ROOT}';" >> $file
echo "window.VIDEO_HOST = '${VIDEO_HOST}';" >> $file
echo "window.SENTRY_ENV = '${SENTRY_ENV}';" >> $file
