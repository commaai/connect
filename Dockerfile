FROM oven/bun:1 as base
WORKDIR /app


FROM base AS build

# Install dependencies with Bun. If a bun.lockb is present it will be used.
COPY package.json ./
RUN bun install

# Copy application source
ADD . ./

ARG VITE_APP_GIT_SHA=unknown
ARG VITE_APP_GIT_TIMESTAMP=1970-01-01T00:00:00Z
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_RELEASE
ENV VITE_APP_GIT_SHA=$VITE_APP_GIT_SHA \
    VITE_APP_GIT_TIMESTAMP=$VITE_APP_GIT_TIMESTAMP \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_RELEASE=$SENTRY_RELEASE

RUN bun run build:production


FROM nginx:1.24

COPY config.js.template /etc/nginx/templates/config.js.template
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_OUTPUT_DIR=/usr/share/nginx/html

EXPOSE 80
