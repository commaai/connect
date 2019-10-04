export function filterEvent(event) {
  return (event.type === 'disengage' || event.type === 'disengage_steer');
}

export function formatDriveDuration(duration) {
  const milliseconds = Math.floor((duration % 1000) / 100);
  let seconds = Math.floor((duration / 1000) % 60);
  let minutes = Math.floor((duration / (1000 * 60)) % 60);
  let hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
  hours = (hours < 10) ? hours : hours;
  minutes = (minutes < 10) ? minutes : minutes;
  seconds = (seconds < 10) ? seconds : seconds;
  return {
    hours,
    minutes,
    seconds,
    milliseconds,
  };
}

export function getDrivePoints(duration) {
  const minutes = Math.floor(duration / (1000 * 60));
  const points = Math.floor(minutes * 1.5); // panda
  return points;
}
