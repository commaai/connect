import { athena as Athena } from '@commaai/comma-api';

export async function fetchSimInfo(dongleId) {
  let payload = { method: 'getSimInfo', jsonrpc: '2.0', id: 0 };
  return Athena.postJsonRpcPayload(dongleId, payload).then(
    function(response) {
      return new Promise(function(resolve, reject) {
        let simInfo = response['result'];
        let simIdIsValid = simInfo && simInfo.sim_id !== null && simInfo.sim_id.length >= 19 && simInfo.sim_id.length <= 22;

        if ('error' in response || !simIdIsValid) {
          let err = new Error();
          if (!simIdIsValid) {
            err.message = "No SIM detected. Ensure SIM is securely inserted and try again.";
          } else if (response['error'] === "Device not registered" || response['error'] === "Timed out") {
            err.message = "Could not reach device.\nConnect device to the internet and try again.";
          } else if(typeof response['error'] === 'object' && response['error']['message'] === "Method not found") {
            err.message = "Activation requires device version 0.6.1 or newer. Please upgrade and try again.";
          } else {
            err.message = "Server error. Please try again.";
          }
          reject(err);
        } else {
          resolve({ simInfo });
        }
      })
    }
  ).catch(function(err) {
    return new Promise(function(_, reject) {
      if (err.message.indexOf('404') !== -1 || err.message.indexOf('408') !== -1) {
        err.message = "Could not reach your device.\nConnect device to WiFi and try again.";
      } else if (err.message.indexOf('500') !== -1) {
        err.message = "Unexpected server error.\nPlease try again.";
      }
      reject(err);
    })
  });
}
