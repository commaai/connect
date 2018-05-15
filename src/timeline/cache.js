import LogStream from "@commaai/log_reader";
import { timeout } from 'thyming';
import * as API from '../api';
import request from "simple-get";

// cache all of the data

const EXPIREY_TIME = 1000 * 60 * 5; // 5 minutes?

const CacheStore = {};

class CacheEntry {
  constructor (route, segment) {
    this.route = route;
    this.segment = segment;
    this.expire = this.expire.bind(this);

    this.touch();

    this.log = [];
    this.getLogStream().then((loader) => {
      loader(this.log.push.bind(this.log));
    });
  }

  async getLog () {
    var urls = await API.getLogUrls(this.route);
    return urls[this.segment];
  }

  async getLogStream () {
    return new Promise(async (resolve, reject) => {
      request(await this.getLog(), (err, res) => {
        if (err) {
          return reject(err);
        }
        res.on('end', () => {
          setTimeout(() => {
            console.log('Segment length', this.log.length);
            console.log('Segment', this.segment, 'starts at', this.log[1].LogMonoTime, 'and ends at', this.log[this.log.length - 1].LogMonoTime);
            console.log('Length:', this.log[this.log.length - 1].LogMonoTime - this.log[1].LogMonoTime);
          });
        });
        resolve(new LogStream(res));
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
    delete CacheStore[this.route][this.segment];
  }
}

export function getEntry (route, segment) {
  if (CacheStore[route] && CacheStore[route][segment]) {
    return CacheStore[route][segment].touch();
  }

  if (!CacheStore[route]) {
    CacheStore[route] = {};
  }

  CacheStore[route][segment] = new CacheEntry(route, segment);

  return CacheStore[route][segment];
}
