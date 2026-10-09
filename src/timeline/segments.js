// null: no such drive, undefined: not loaded yet. a drive loaded on its own wins over the list
export function selectedDrive(state) {
  const fullname = `${state.dongleId}|${state.nav.logId}`;
  const own = state.drives[fullname];
  return own !== undefined ? own : state.routes?.find((route) => route.fullname === fullname);
}
