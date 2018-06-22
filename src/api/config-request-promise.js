import ConfigRequest from 'config-request/instance';
import errorHandler from './errorHandler';

export default function ConfigRequestPromise() {
  const cr = ConfigRequest();
  let origGet = cr.get, origPost = cr.post, origPatch = cr.patch;

  cr.get = wrap(cr.get.bind(cr));
  cr.post = wrap(cr.post.bind(cr));
  cr.patch = wrap(cr.patch.bind(cr));

  return cr;
}

let wrap = function(requestFunc) {
  return function(path, options) {
    return new Promise(function (resolve, reject) {
      requestFunc(path, options || {}, errorHandler(resolve, reject));
    })
  }
}
