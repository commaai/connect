
export function getDongleID (pathname) {
  var parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  return parts[0] || null;
}

export function getZoom (pathname) {
  var parts = pathname.split('/');
  parts = parts.filter((m) => m.length);

  if (parts.length >= 3) {
    return {
      start: Number(parts[1]),
      end: Number(parts[2])
    };
  }
  return {
    start: null,
    end: null
  };
}

export function getPathname (options) {
  var path = [
    options.dongleId
  ];

  if (options.start && options.end) {
    path.push(options.start);
    path.push(options.end);
  }

  return path.join('/');
}
