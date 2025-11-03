import { history } from './history';

export function navigate(path) {
  history.push(path);
}

export function replace(path) {
  history.replace(path);
}

export default { navigate, replace };
