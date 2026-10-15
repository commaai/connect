export function mediaErrorKind(error) {
  if (error.code === MediaError.MEDIA_ERR_NETWORK) return 'network';
  return 'media';
}
