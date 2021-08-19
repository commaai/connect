FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y \
        nodejs \
        npm \
        nginx \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN npm install -g yarn

COPY . /app
WORKDIR /app

RUN yarn install

ARG SENTRY_AUTH_TOKEN
RUN yarn build:production


FROM nginx:1.21

COPY make_config.sh /app/make_config.sh
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=0 /app/build /usr/share/nginx/html

EXPOSE 80

ARG COMMA_URL_ROOT=https://api.commadotai.com/
ARG ATHENA_URL_ROOT=https://athena.comma.ai/
ARG BILLING_URL_ROOT=https://billing.comma.ai/
ARG VIDEO_HOST=https://my-comma-video.azureedge.net
ARG SENTRY_ENV=production
CMD ["/app/make_config.sh", "&& exec nginx -g 'daemon off;'"]
