const build = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  env: 'VITE_*',
  sourcemap: 'linked',
  splitting: true,
  minify: {
    whitespace: true,
    syntax: true,
  },
  naming: {
    entry: '[dir]/[name].[ext]',
    chunk: '[name]-[hash].[ext]',
    asset: '[name]-[hash].[ext]',
  },
})

const outputs = await Promise.all(build.outputs
  .filter((output) => output.kind !== 'sourcemap')
  .map(async ({ path, kind, size }) => {
    return {
      path,
      kind,
      size,
      compressedSize: Bun.gzipSync(await Bun.file(path).bytes()).byteLength
    }
  }))

console.log('Build outputs:')
console.table(outputs)

const size = outputs.reduce((acc, { size }) => acc + size, 0) / 1024
const compressedSize = outputs.reduce((acc, { compressedSize: size }) => acc + size, 0) / 1024
console.log('Total asset size excluding sourcemaps (KiB):', size.toFixed(1))
console.log('Compressed size excluding sourcemaps (KiB):', compressedSize.toFixed(1))

if (compressedSize < 200) {
  console.error('Bundle size lower than expected, let\'s lower the limit!')
  process.exit(1)
} else if (compressedSize > 325) {
  console.error('Exceeded bundle size limit!')
  process.exit(1)
}
