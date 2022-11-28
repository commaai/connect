import { analyticsMiddleware } from './analytics';
import { onHistoryMiddleware } from './history';

const middleware = [
  analyticsMiddleware,
  onHistoryMiddleware,
];

export default middleware;
