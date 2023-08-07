// https://stackoverflow.com/a/43053803
export const cartesianProduct = (...a) => a.reduce((b, c) => b.flatMap((d) => c.map((e) => [d, e].flat())));
