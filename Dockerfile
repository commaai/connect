FROM node:16-bullseye

WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install --immutable --immutable-cache --check-cache

COPY . /app/
ENV GENERATE_SOURCEMAP false
ARG SENTRY_AUTH_TOKEN
RUN yarn build:production


FROM nginx:1.22

COPY config.js.template /etc/nginx/templates/config.js.template
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=0 /app/build /usr/share/nginx/html

ENV NGINX_ENVSUBST_OUTPUT_DIR /usr/share/nginx/html
