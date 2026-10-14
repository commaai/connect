export function nativeVideoErrorMessage(code) {
  if (code === 2) return 'Unable to load video. Check your connection.';
  return 'Unable to play this video.';
}

export function hlsFatalErrorMessage(Hls, data) {
  if (data.response?.code === 404) return 'This video has not uploaded yet or has been deleted.';
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) return 'Unable to load video. Check your connection.';
  return 'Unable to play this video.';
}
