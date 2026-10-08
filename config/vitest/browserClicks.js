// jsdom cannot open tabs; leave ordinary clicks to the component/router.
function preventNewTab(event) {
  if (event.ctrlKey || event.metaKey) event.preventDefault();
}

beforeAll(() => document.addEventListener('click', preventNewTab));
afterAll(() => document.removeEventListener('click', preventNewTab));
