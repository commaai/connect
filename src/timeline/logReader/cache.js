import LogStream from '@commaai/log_reader';
import { raw as RawApi, request as Request } from '@commaai/comma-api';
import Auth from '@commaai/my-comma-auth';

import { timeout } from 'thyming';
import request from 'simple-get';
import Event from 'geval/event';
import debounce from 'debounce';
import * as capnp from 'capnp-ts';
import { Event as CapnpEvent } from '@commaai/log_reader/capnp/log.capnp';
import filterWhich from './allowedEventTypes';
import * as Demo from '../../demo';

const demoLogUrls = require('../../demo/logUrls.json');

// cache all of the data

const EXPIREY_TIME = 1000 * 60 * 5; // 5 minutes?
// const EXPIREY_TIME = 1000 * 30; // 30 seconds for testing

const CacheStore = {};
const ExpireEvent = Event();

export const onExpire = ExpireEvent.listen;

class CacheEntry {
  constructor(route, segment, dataListener) {
    this.route = route;
    this.segment = segment;
    this.expire = this.expire.bind(this);
    this.dataListener = dataListener;
    this.authInitPromise = Promise.all([Auth.init(), Demo.init()]).then(([token]) => {
      Request.configure(token);
    });

    this.touch();

    this.log = [];
    this.queue = [];
    this.logEvent = Event();
    this.logEvent.listen((e) => {
      this.log = this.log.concat(e);
    });
    const sendLogs = debounce(() => {
      if (!this.queue.length) {
        return;
      }
      const { queue } = this;
      this.queue = [];
      this.logEvent.broadcast(queue);
    });
    this.getLogStream().then((loader) => {
      loader((buf) => {
        const msg = new capnp.Message(buf, false);
        const event = msg.getRoot(CapnpEvent);
        const which = event.which();
        if (!filterWhich(which)) {
          // don't send event to main thread
          return;
        }
        this.queue.push(buf);
        sendLogs();
      });
    });
  }

  getLog(callback) {
    if (this.log.length) {
      callback(this.log);
    }
  }

  subscribe(callback) {
    return this.logEvent.listen(callback);
  }

  start() {
    if (this.started) {
      return;
    }
    this.started = true;

    this.authInitPromise.then(() => {
      this.getLog(this.dataListener);
      this.unlisten = this.subscribe(this.dataListener);
    });
  }

  async getLogUrl() {
    await this.authInitPromise;
    let urls;
    if (Demo.isDemo()) {
      return demoLogUrls[this.route][this.segment];
    } else {
      urls = await RawApi.getRouteFiles(this.route);
      if (urls.logs[this.segment] !== undefined) {
        return urls.logs[this.segment];
      } else {
        return urls.qlogs[this.segment];
      }
    }
  }

  async getLogStream() {
    const logUrl = await this.getLogUrl();
    return new Promise((resolve, reject) => {
      request(logUrl, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        // res.on('end', () => {
        // });
        resolve(new LogStream(res, {
          binary: true
        }));
      });
    });
  }

  touch() {
    if (this.expireTimer) {
      this.expireTimer();
      this.expireTimer = null;
    }
    this.lastTime = Date.now();
    this.expireTimer = timeout(this.expire, EXPIREY_TIME);

    return this;
  }

  expire() {
    // expire out of the cache
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    delete CacheStore[this.route][this.segment];
    ExpireEvent.broadcast({
      route: this.route,
      segment: this.segment
    });
  }
}

export function getEntry(route, segment, dataListener) {
  if (CacheStore[route] && CacheStore[route][segment]) {
    return CacheStore[route][segment].touch();
  }

  if (!CacheStore[route]) {
    CacheStore[route] = {};
  }

  CacheStore[route][segment] = new CacheEntry(route, segment, ((data) => {
    if (dataListener) {
      dataListener({
        route, segment, data
      });
    }
  }));

  return CacheStore[route][segment];
}
