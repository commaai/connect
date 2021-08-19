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
RUN yarn build:staging

COPY build /var/www/html

EXPOSE 80

CMD ["nginx","-g","daemon off;"]

