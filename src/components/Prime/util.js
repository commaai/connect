import { athena as Athena } from '@commaai/comma-api';

export async function fetchSimInfo(dongleId) {
  const payload = { method: 'getSimInfo', jsonrpc: '2.0', id: 0 };
  try {
    const response = await Athena.postJsonRpcPayload(dongleId, payload);
    const simInfo = response['result'];
    const simIdIsValid = simInfo && simInfo.sim_id && simInfo.sim_id.length >= 19 && simInfo.sim_id.length <= 22;

    if (!('error' in response) && simIdIsValid) {
      return simInfo;
    }

    if (!simIdIsValid) {
      throw new Error("No SIM detected. Ensure SIM is securely inserted and try again.");
    } else if (response['error'] === "Device not registered" || response['error'] === "Timed out") {
      throw new Error("Could not reach device.\nConnect device to the internet and try again.");
    } else if(typeof response['error'] === 'object' && response['error']['message'] === "Method not found") {
      throw new Error("Activation requires device version 0.6.1 or newer. Please upgrade and try again.");
    } else {
      throw new Error("Server error. Please try again.");
    }
  } catch (err) {
    if (err.message.indexOf('404') !== -1 || err.message.indexOf('408') !== -1) {
      err.message = "Could not reach your device.\nConnect device to WiFi and try again.";
    } else if (err.message.indexOf('500') !== -1) {
      err.message = "Unexpected server error.\nPlease try again.";
    }
    throw err;
  }
}
