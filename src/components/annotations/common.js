
export function filterEvent (event) {
  return (event.type === 'disengage' || event.type === 'disengage_steer');
}
