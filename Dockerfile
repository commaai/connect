FROM node:20-alpine AS base

ARG PNPM_VERSION=8.6.3
RUN npm install -g pnpm@$PNPM_VERSION
WORKDIR /app


FROM base AS build

COPY ./pnpm-lock.yaml .
RUN pnpm fetch --prod

ADD . ./
RUN pnpm install --offline --prod

ARG REACT_APP_GIT_SHA=production
ARG SENTRY_AUTH_TOKEN
ENV REACT_APP_GIT_SHA $REACT_APP_GIT_SHA
ENV SENTRY_AUTH_TOKEN $SENTRY_AUTH_TOKEN
ENV GENERATE_SOURCEMAP false
RUN pnpm build:production


FROM nginx:1.22

COPY config.js.template /etc/nginx/templates/config.js.template
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

ENV NGINX_ENVSUBST_OUTPUT_DIR /usr/share/nginx/html

EXPOSE 80
