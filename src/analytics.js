/* globals gtag document window */

const GA_TRACKING_ID = 'UA-80079182-7';

export const initGoogleAnalytics = (history) => {
  history.listen((location) => {
    if (typeof gtag === 'function') {
      gtag('config', GA_TRACKING_ID, {
        page_title: document.title,
        page_location: window.location.href,
        page_path: location.pathname
      });
    }
  });
};
