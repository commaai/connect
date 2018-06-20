export default (resolve, reject) => {
  return handle;

  function handle(err, data) {
    if (err) {
      if (err.statusCode === 0) {
        err = new Error('There was an unexpected server error, please try again later.');
      }
      return reject(err);
    }
    resolve(data);
  }
}
