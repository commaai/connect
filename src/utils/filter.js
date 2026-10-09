const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

// how many drives the dashboard asks for at a time
export const LIMIT_INCREMENT = 5;

export function getDefaultFilter() {
  const end = new Date().setMinutes(60, 0, 0); // next hour

  return {
    start: end - ONE_YEAR,
    end
  };
}
