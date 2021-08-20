FROM node:16.7-bullseye

WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install

COPY . /app/
ARG SENTRY_AUTH_TOKEN
RUN yarn build:production


FROM nginx:1.21

COPY make_config.sh /docker-entrypoint.d/make_config.sh
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=0 /app/build /usr/share/nginx/html

ARG COMMA_URL_ROOT=https://api.commadotai.com/
ARG ATHENA_URL_ROOT=https://athena.comma.ai/
ARG BILLING_URL_ROOT=https://billing.comma.ai/
ARG VIDEO_HOST=https://my-comma-video.azureedge.net
ARG SENTRY_ENV=production
