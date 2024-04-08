FROM oven/bun:1 AS base

WORKDIR /app

FROM base as build

COPY ./pnpm-lock.yaml .

ADD . ./
RUN bun install

ARG VITE_APP_GIT_SHA=unknown
ARG VITE_APP_GIT_TIMESTAMP=1970-01-01T00:00:00Z
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_RELEASE
ENV VITE_APP_GIT_SHA $VITE_APP_GIT_SHA
ENV VITE_APP_GIT_TIMESTAMP $VITE_APP_GIT_TIMESTAMP
ENV SENTRY_AUTH_TOKEN $SENTRY_AUTH_TOKEN
ENV SENTRY_RELEASE $SENTRY_RELEASE
RUN bun build:production


FROM nginx:1.24

COPY config.js.template /etc/nginx/templates/config.js.template
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_OUTPUT_DIR /usr/share/nginx/html

EXPOSE 80
