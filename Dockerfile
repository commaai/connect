FROM node:20-alpine AS base

ARG PNPM_VERSION=8.6.3
RUN npm install -g pnpm@$PNPM_VERSION
WORKDIR /app


FROM base AS build

COPY ./pnpm-lock.yaml .
RUN pnpm fetch

ADD . ./
RUN pnpm install --offline

ARG VITE_APP_GIT_SHA=unknown
ARG VITE_APP_GIT_TIMESTAMP=1970-01-01T00:00:00Z
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_RELEASE
ENV VITE_APP_GIT_SHA $VITE_APP_GIT_SHA
ENV VITE_APP_GIT_TIMESTAMP $VITE_APP_GIT_TIMESTAMP
ENV SENTRY_AUTH_TOKEN $SENTRY_AUTH_TOKEN
ENV SENTRY_RELEASE $SENTRY_RELEASE
RUN pnpm build:production


FROM nginx:1.24

COPY config.js.template /etc/nginx/templates/config.js.template
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_OUTPUT_DIR /usr/share/nginx/html

EXPOSE 80
