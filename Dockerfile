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
