import fs from 'node:fs'

const dir = process.argv[2]
const extension = '.map'
const mapFiles = fs.readdirSync(dir).filter(fn => fn.endsWith(extension))

const report = []
for (const mapFile of mapFiles) {
  const mapFileData = JSON.parse(fs.readFileSync(dir + mapFile, 'utf8')) as { sources: string[] }
  const assetFile = mapFile.replace(extension, '')
  const sources = mapFileData.sources.filter(source => source.includes('node_modules')).map(source => source.split('node_modules/')[1])
  report.push({ 'asset': assetFile, 'size': fs.statSync(dir + assetFile).size, 'sources': sources})
  fs.unlinkSync(dir + mapFile)
}
report.sort((b, a) => a.size - b.size).forEach(entry => {
  console.log(entry.asset + ':' + (entry.size / 1024).toFixed(2) + 'KB')
  for (const source of entry.sources) {
    console.log('   ' + source)
  }
})
