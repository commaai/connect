import { routeMsFromVideoSeconds } from './timing';

let session = null;
export function resetMediaSessionForTests() { session = null; }
export function bindMediaElement(element, details) { session = { element, ...details }; }
export function unbindMediaElement(element, controller) {
  if (session?.element === element && (!controller || session.controller === controller)) session = null;
}
export function sendMediaCommand(fullname, command, ...args) {
  if (session?.routeFullname !== fullname || !session?.controller) return false;
  session.controller[command](...args);
  return true;
}
export function readRouteOffsetMs(state) {
  if (session && state.currentRoute && session.routeFullname === state.currentRoute.fullname) {
    if (session.controller) return session.controller.readOffset();
    if (session.element.readyState >= 1) {
      return routeMsFromVideoSeconds(session.element.currentTime, state.currentRoute.videoStartOffset);
    }
  }
  return state.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
