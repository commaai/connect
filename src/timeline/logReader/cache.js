import LogStream from '@commaai/log_reader';
import toJSON from  'capnp-json';
import { timeout } from 'thyming';
import request from 'simple-get';
import Event from 'geval/event';
import debounce from 'debounce';
import * as API from '../../api';
import * as capnp from 'capnp-ts';
import { Event as CapnpEvent } from '@commaai/log_reader/capnp/log.capnp';
import filterWhich from './allowedEventTypes';

// cache all of the data

const EXPIREY_TIME = 1000 * 60 * 5; // 5 minutes?
// const EXPIREY_TIME = 1000 * 30; // 30 seconds for testing

const CacheStore = {};
const ExpireEvent = Event();

export const onExpire = ExpireEvent.listen;

class CacheEntry {
  constructor (route, segment, dataListener) {
    this.route = route;
    this.segment = segment;
    this.expire = this.expire.bind(this);
    this.dataListener = dataListener;

    this.touch();

    this.log = [];
    this.queue = [];
    this.logEvent = Event();
    this.logEvent.listen((e) => this.log = this.log.concat(e));
    var sendLogs = debounce(() => {
      if (!this.queue.length) {
        return;
      }
      var queue = this.queue;
      this.queue = [];
      this.logEvent.broadcast(queue);
    });
    this.getLogStream().then((loader) => {
      loader((buf) => {
        let msg = new capnp.Message(buf, false);
        let event = msg.getRoot(CapnpEvent);
        let which = event.which();
        if (!filterWhich(which)) {
          // don't send event to main thread
          return;
        }
        this.queue.push(buf);
        sendLogs();
      });
    });
  }

  getLog (callback) {
    if (this.log.length) {
      callback(this.log);
    }
  }

  subscribe (callback) {
    return this.logEvent.listen(callback);
  }

  start () {
    if (this.started) {
      return;
    }
    this.started = true;
    this.getLog(this.dataListener);
    this.unlisten = this.subscribe(this.dataListener);
  }

  async getLogUrl () {
    var urls = await API.getLogUrls(this.route);
    return urls[this.segment];
  }

  async getLogStream () {
    return new Promise(async (resolve, reject) => {
      request(await this.getLogUrl(), (err, res) => {
        if (err) {
          return reject(err);
        }
        // res.on('end', () => {
        // });
        resolve(new LogStream(res, {
          binary: true
        }));
      });
    });
  }

  touch () {
    if (this.expireTimer) {
      this.expireTimer();
      this.expireTimer = null;
    }
    this.lastTime = Date.now();
    this.expireTimer = timeout(this.expire, EXPIREY_TIME);

    return this;
  }

  expire () {
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

export function getEntry (route, segment, dataListener) {
  if (CacheStore[route] && CacheStore[route][segment]) {
    return CacheStore[route][segment].touch();
  }

  if (!CacheStore[route]) {
    CacheStore[route] = {};
  }

  CacheStore[route][segment] = new CacheEntry(route, segment, function (data) {
    if (dataListener) {
      dataListener({
        route, segment, data
      });
    }
  });

  return CacheStore[route][segment];
}
