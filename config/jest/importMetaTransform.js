module.exports = {
  process(sourceText, sourcePath, options) {
    return {
      code: sourceText.replaceAll('import.meta.env', '{}'),
    };
  },
};
