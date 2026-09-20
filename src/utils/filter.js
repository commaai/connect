const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

export function getDefaultFilter() {
  const end = new Date().setMinutes(60, 0, 0); // next hour

  return {
    start: end - ONE_YEAR,
    end
  };
}
